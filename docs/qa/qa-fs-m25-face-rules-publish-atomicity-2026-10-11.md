# QA-FS-M25：面相規則發布非原子與 audit 遺失

**嚴重度：critical**　**狀態：待送 X-PM 排序／派工**

## 範圍與證據

路由：`POST /api/admin/face-rules/publish`。程式碼依序更新現行 published row 為 archived、draft row 為 published、清除 profile cache，最後呼叫 `writeAdminAudit`；沒有資料庫 transaction 將三項結果綁定。`lib/auth/admin.ts` 的 `writeAdminAudit` 會 await Supabase insert，但不檢查回傳的 `error`。

QA route＋記憶體 DB/audit 替身腳本：`scripts/qa-face-rules-publish-audit.test.ts`，獨立 Vitest 設定 `scripts/qa-face-rules-publish-audit.vitest.mts`；**4/4 通過**，`npx tsc --noEmit` 通過。該測試模擬實際 `writeAdminAudit` 對 insert 結果的忽略行為，不連資料庫。

| 情境 | 預期 | 替身實際結果 |
|---|---|---|
| 正常發布 | 新版發布、舊版封存、一筆具名 audit、cache 失效 | HTTP 200，狀態與 audit 正確 |
| 無 draft | HTTP 400，任何資料不變 | HTTP 400，無寫入 |
| audit INSERT 回 `{ error }` | 發布不可回報成功；變更須回滾或保留待補記狀態 | HTTP 200；舊版已 archived、新版已 published、cache 已清，audit 0 |
| publish UPDATE 故障（舊版封存已提交） | 發布交易原子回滾，舊版仍 published、draft 仍 draft | HTTP 500；舊版 archived、draft 尚為 draft，暫無 published profile |

## 影響與驗收標準

規則可能在沒有稽核紀錄時切換；若第二次更新失敗，系統可能暫時沒有 published profile。這影響面相規則的可追溯性與服務可用性。替身只證明路由控制流；真實 DB constraints、交易狀態、並發與實際 consumer/cache 行為尚未複驗。

修復須以單一 DB transaction/RPC 完成舊版封存、新版發布與具名 audit；任何資料庫步驟失敗時，三者保持原狀且 cache 不失效。隔離驗收：正常發布、無 draft、audit INSERT 故障、publish update 故障各 10 輪；同時兩個管理員競爭發布 10 輪，只允許一個合法完成、始終最多一筆 published 且 audit 恰一筆。匿名 401、會員 403；成功後 consumer 讀到新 profile，所有 fixture／故障 trigger 清 0。

## 商業規則與安全界線

未觀察到商業規則取捨；不更動既定規則版本流程。所有故障注入只允許專用隔離資料庫，不在正式 DB 執行。尚未宣稱 HTTP＋真 DB 複驗通過。

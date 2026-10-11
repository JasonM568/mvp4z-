# QA-FS-C21：提示／學校規則發布與奇門簽核缺 audit

**嚴重度：critical**　**狀態：待送 X-PM 定序／派工**

## 範圍與證據

路由：`POST /api/admin/prompt-settings/publish`、`POST /api/admin/school-settings/publish`、`POST /api/admin/qimen-review/signoff`。三者均在 profile 狀態／簽核列變動後呼叫 `writeAdminAudit`；共用 helper 不檢查 audit INSERT 回傳的 `{ error }`。

QA route＋記憶體 DB/audit 替身腳本：`scripts/qa-admin-policy-audit-failures.test.ts`，Vitest 設定 `scripts/qa-admin-policy-audit-failures.vitest.mts`；此獨立腳本 **5/5** 通過，其中 prompt、school、qimen 三案例各驗一次。測試注入 audit INSERT error，實際三路由都 HTTP 200 且 mutation 已生效、audit 0。沒有真 DB、production AI prompt、日曆資料或模型呼叫。

## 影響與驗收

Prompt／school 發布可能在無 audit 時改變之後報告採用設定；Qimen 簽核列可能表示老師已核對但無管理操作紀錄。修復須使 profile mutation／簽核與 audit 成為同一交易或有等價的 durable outbox；audit 寫入失敗時不可靜默回成功，已提交狀態須可追溯及冪等重試。

隔離驗收：每個 route 正常及 audit INSERT 故障各 10 輪；發布故障時 profile 版本、cache 與 audit 同步回滾；簽核故障時 signoff row 及 cache 不變；兩管理員同時發布只產生一個狀態轉換與一筆 audit，重送簽核不造重複紀錄。驗匿名 401、會員 403、無 draft／不完整簽核 4xx，所有 fixture／trigger 清 0。

## 證據限制

目前是實際 route handler 配記憶體資料替身；未證明真 PostgreSQL transaction、partial unique index 競態、cache across instances 或面相／易學報告實際採用版本。任何故障注入只可用專用隔離 DB，不在正式環境執行。無需商業規則變更。

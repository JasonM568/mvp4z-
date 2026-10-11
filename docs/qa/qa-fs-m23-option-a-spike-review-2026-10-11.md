# QA-FS-M23 Option A 隔離可行性審核｜`42175c1`

**結論：**每次上傳使用 claim token 專屬 Storage key，並先記持久 intent，是可行的復原方向；**只通過隔離路由／Storage 替身 3/3，不是 M23／M22 正式驗收或採納決定**。工程分支 `/private/tmp/xunfeng-m23-spike` 保持唯讀且乾淨；SQL 位於 `docs/release-drafts/*SPIKE_NOT_DEPLOY.sql`，不是有效 migration。QA 未連正式庫、共用 C4 stack、真 Storage 或付費模型。

| 審核點 | QA 獨立證據 | 邊界 |
|---|---|---|
| event INSERT＋補償 remove 雙故障 | `scripts/qa-m23-option-a-spike.test.ts` 導入 `42175c1` route 與實際 Storage helper，使用自有 in-memory DB／Storage／品質替身：HTTP 500、run `created`／path NULL／attempt 1／claim 釋放、物件 1、intent `cleanup_pending` 且錯誤碼 `STORAGE_REMOVE_FAILED`；順序為 claim→intent→upload→result RPC→cleanup claim→remove→錯誤註記→claim release | DB 交易回滾與 intent 持久性由替身模擬；真 Supabase 故障未實測 |
| RPC 已提交但回應遺失 | 替身先將 run path 與 intent 設為 `attached` 再拋傳輸錯誤：route 回 200，沒有呼叫 Storage remove，attached 物件仍在 | SQL row lock 與網路斷線時序未實測 |
| 舊 A／新 B 與舊路徑 | 真 key builder 對不同 claim 產生不同 path；A 精確刪除後 B 仍存在；新 validator 可預覽舊 `source.png`，拒絕 traversal | 只證明 Storage helper 的 key 隔離；舊 worker 與新 worker 的 DB CAS、preview／analyze／delete／cron 全流程待整合驗 |

**程式／SQL 唯讀判斷：**intent 先於 Storage 寫入；`record_face_upload_result` 草稿在同一 PostgreSQL function 中更新 run、插 event、將 intent `pending→attached`，其中一步拋錯理應整筆交易回滾。補償 RPC 對 intent `FOR UPDATE`，attached 不刪；新 key 只刪本次 claim 的單一物件。舊固定 path 呼叫仍由草稿 RPC 接受。以上 SQL 語義與 ACL 尚未經 QA 的獨立 PostgreSQL 執行驗證，不能寫成已證明的資料庫結果。

**採納前缺口／release gate：**

1. Spike 沒有背景 reconciler、cleanup lease、告警與保留政策。Storage upload 成功但回應遺失，或進入 result RPC 前程序中斷時，intent 可能停在 `pending`；補償失敗則停在 `cleanup_pending`。沒有定期單 key 清理與實際物件盤點，不可宣告孤兒照片問題已解決。需處理 worker 超過 grace 後才寫入物件的時序。
2. 需在 QA 專用隔離 PostgreSQL／Storage 中驗證 SQL 交易、鎖序、CAS、ACL（anon／authenticated 拒絕、service_role 可用）、真 Storage 409／remove 故障，以及多輪 A/B 併發、run 刪除／過期 cron 與 fixture 清零。正式庫不做故障注入。
3. M22 舊應用的路徑 validator 不認得 `/attempts/{token}/`；一旦 M23 寫入新照片，直接回退到未改動 M22 app 將破壞預覽、下載與刪除。發布前須有可讀新舊 key 的回退 artifact，且未清完 intent 時不可刪 schema。
4. 系統故障仍消耗上傳次數，可能達 5 次上限。是否返還次數屬產品規則，交 X-PM／Tech Lead 決定；QA 不預設重設 counter。

**建議給 Tech Lead：**Option A 可以進入正式候選設計，但須先補可觀測、可重試、受限單 key 的 reconciler 和回退讀取相容性，再排獨立 PostgreSQL／Storage 故障驗收。若選擇維持固定 path＋人工清理，變更較小，但同格式重送與輪替 worker 的風險需由人工時限及明確剩餘風險簽核承擔。此文件不授權 migration、push 或部署。

**重跑命令：**`npx vitest run --config scripts/qa-m23-option-a-spike.vitest.mts`（3/3）；`npx tsc --noEmit`（通過）。使用外部 worktree 時可設 `QA_M23_SPIKE_ROOT` 指向相同 SHA 的候選目錄。

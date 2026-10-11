# QA-FS-C21：提示／學校規則發布與奇門簽核缺 audit

**嚴重度：critical**　**狀態：X-PM 已接受並派工程1；待候選與隔離複驗**

## 範圍與證據

路由：`POST /api/admin/prompt-settings/publish`、`POST /api/admin/school-settings/publish`、`POST /api/admin/qimen-review/signoff`。三者均在 profile 狀態／簽核列變動後呼叫 `writeAdminAudit`；共用 helper 不檢查 audit INSERT 回傳的 `{ error }`。

QA route＋記憶體 DB/audit 替身腳本：`scripts/qa-admin-policy-audit-failures.test.ts`，Vitest 設定 `scripts/qa-admin-policy-audit-failures.vitest.mts`；此獨立腳本 **5/5** 通過，其中 prompt、school、qimen 三案例各驗一次。測試注入 audit INSERT error，實際三路由都 HTTP 200 且 mutation 已生效、audit 0。沒有真 DB、production AI prompt、日曆資料或模型呼叫。

## 影響與驗收

Prompt／school 發布可能在無 audit 時改變之後報告採用設定；Qimen 簽核列可能表示老師已核對但無管理操作紀錄。修復須使 profile mutation／簽核與 audit 成為同一交易或有等價的 durable outbox；audit 寫入失敗時不可靜默回成功，已提交狀態須可追溯及冪等重試。

隔離驗收：每個 route 正常及 audit INSERT 故障各 10 輪；發布故障時 profile 版本、cache 與 audit 同步回滾；簽核故障時 signoff row 及 cache 不變，移除故障後重試形成一筆 signoff 與一筆 audit；兩管理員同時發布只產生一個狀態轉換與一筆 audit。驗匿名 401、會員 403、無 draft／不完整簽核 4xx，所有 fixture／trigger 清 0。

⚠ **待產品規則確認：**`qimen_signoffs` 為 append-only。成功簽核後的普通重送是否視為同一操作並去重，需另決定是否引入 idempotency key；本票不預設「成功後重送必須去重」，也不擅自改簽核語義。

## 證據限制

目前是實際 route handler 配記憶體資料替身；未證明真 PostgreSQL transaction、partial unique index 競態、cache across instances 或面相／易學報告實際採用版本。任何故障注入只可用專用隔離 DB，不在正式環境執行。無需商業規則變更。


## 2026-10-12 候選 1af8943 獨立複驗

- 候選：`/private/tmp/xunfeng-c21-policy-signoff`，HEAD `1af894375ed06af34960e237cf9b25bd6c48a601`，worktree clean；QA 未改工程候選。
- `route.c21.test.ts` **10/10**、`tsc --noEmit` 通過。這仍是 route unit／mock，不是 HTTP。
- QA 自有 `scripts/qa-c21-policy-school-isolated-local.sh` 以一次性 native PostgreSQL 最小 fixture 建立角色／必要資料表，依序套 Qimen base migration 與 C21 migration；event audit fault、transaction rollback、ACL/RLS、正常 publish、重送 conflict、Qimen append-only SQL contract **10/10**。Prompt 同 draft N=2 發布競態 **10/10**，school 同 draft N=2 **10/10**；每輪各 1 winner／1 conflict／1 audit，輪後 QA profile、profile row、audit fixture 清 0。腳本會核對候選 SHA／clean tree，使用 Unix socket、停用 TCP，結束停止並清除自有 cluster。
- **限制：**最小 PostgreSQL schema 非 Supabase 完整 clean replay；本輪沒有 HTTP／cache 跨程序／實際報告 consumer／正式站。Qimen 成功後普通重送仍按 append-only 寫入第二筆，本測試未要求去重；語義待產品決策，不作缺陷。`ADMIN_KEY` actor 相容性仍需確認。
- 結論：候選 SQL 與狹義競態 contract 有隔離複驗證據；QA-FS-C21 仍為 critical，待整合 release SHA、完整 migration replay、HTTP/cache/consumer 回歸及部署 gate。

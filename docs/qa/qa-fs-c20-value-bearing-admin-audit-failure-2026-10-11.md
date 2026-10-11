# QA-FS-C20：啟用碼建立／開票成功但 audit 未寫入

**嚴重度：critical**　**狀態：待送 X-PM 定序／派工**

## 範圍與證據

路由：`POST /api/admin/create-code` 與 `POST /api/admin/invoices/{orderId}/issue`。兩者在業務操作後呼叫 `writeAdminAudit`；此 helper await Supabase `.insert()` 但忽略回傳的 `{ error }`。

QA route＋記憶體 DB／invoice helper 替身腳本：`scripts/qa-admin-audit-side-effects.test.ts`，Vitest 設定 `scripts/qa-admin-audit-side-effects.vitest.mts`；**3/3 通過**。同一腳本也觀察既有 QA-FS-C2 credits route，結果應併入 C2 票，不另開重複票。沒有真 DB、ezPay 或外部開票請求。

| 案例 | 預期 | 替身實際 |
|---|---|---|
| 啟用碼建立後 audit INSERT 回 `{ error }` | 不暴露／啟用無稽核碼；交易與 audit 原子成功或完整回滾 | HTTP 200 並回傳新 code；`activation_codes` 新增 1，audit 0 |
| 會員補扣點，餘額與 ledger 原本可對帳，audit INSERT 回 `{ error }` | audit 失敗需清楚失敗／補償，不可靜默成功 | HTTP 200；餘額 5→0、ledger `amount=-5`，audit 0（此為 C2 既有路由範圍） |
| 已付款測試單開票 helper 回成功，audit INSERT 回 `{ error }` | 保留開票結果並留下可重試、可對帳 audit/outbox，不重複呼叫外部開票 | HTTP 200、invoice helper 被呼叫 1 次，audit 0；helper 為 stub，沒有真發票副作用證據 |

## 影響與驗收標準

啟用碼有可兌換點數／權益價值，無 audit 會失去建立者追溯；補扣點 audit 遺失已併入 QA-FS-C2；開票屬外部不可逆副作用，audit 失敗後重送必須靠 idempotency／outbox 對帳，不得重開發票。

修復後於專用隔離 DB：啟用碼與 audit 故障各 10 輪、不得留下可兌換但無 audit 的碼；credits 依 C2 決定的超額扣點規則與 audit 原子一致，並發後餘額／ledger/audit 對帳；開票只用本機 provider stub，audit 故障後重送不得第二次呼叫 provider，最後 invoice outcome 與 audit/outbox 各一筆。匿名／會員拒絕、正常流程、超長非法輸入及 fixture／mock side-effect 清零均需回歸。

## 證據限制與規則決策

本證據證明 route 在 helper 回報 insert error 時仍成功返回，以及 mock side effect 順序；未證實真資料庫持久化、真 provider 行為或財務對帳，不得宣稱真開票驗收通過。C2 的超額扣點語意仍待產品決策；本票不改扣點／開票商業規則。

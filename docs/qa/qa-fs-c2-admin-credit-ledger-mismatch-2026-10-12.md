# QA-FS-C2｜管理員補扣點帳務不一致與 audit 遺失

**嚴重度：critical**　**狀態：route/mock 已證實帳本不符、audit 遺失及併發 lost update；等待 X-PM／產品確認超額扣點規則及工程修復。**

## 範圍與證據

路由：`POST /api/admin/credits`，實作 `app/api/admin/credits/route.ts`。本票沿用既有 QA-FS-C2，不另開重複缺陷。

1. **超額扣點帳本不符（route 替身證據）**：`app/api/admin/credits/route.qa.test.ts` 建立 5 點有效權益，提交 `amount=-10`。測試要求餘額被截為 0，交易 `amount=-5` 反映實際變化；現行 route 寫餘額 0，卻將原請求 `-10` 寫入交易。測試以 `it.fails` 保留預期失敗，修復前不能算通過。重跑 `npx vitest run app/api/admin/credits/route.qa.test.ts`：1 個 expected-fail，代表缺陷斷言仍失敗。
2. **audit INSERT 故障仍成功（route＋記憶體替身）**：`scripts/qa-admin-audit-side-effects.test.ts` 對 5 點會員扣 5 點，注入 audit INSERT error。結果 HTTP 200、餘額 5→0、ledger `amount=-5`、audit 0。`npx vitest run --config scripts/qa-admin-audit-side-effects.vitest.mts`：3/3 通過，其中 C2 案例是成功重現缺陷。
3. **並發 lost update（route＋deterministic DB stub）**：QA barrier 強制兩個請求都讀到餘額 5，再併發補點 +1 與 +2。兩個交易與 audit 都寫入，但最終餘額為 7、ledger delta 合計 +3；序列化後應為 8。

### 後續 route boundary 複驗（2026-10-12）

QA-owned `scripts/qa-c2-admin-credits-boundaries.test.ts` 使用 deterministic DB stub，執行 `./node_modules/.bin/vitest run --config scripts/qa-c2-admin-credits-boundaries.vitest.mts`。目前 **11 passed、2 expected fail（13 tests）**。11 個通過案例覆蓋非法／SQLi 形狀 UUID、amount 0／小數／非數值、days 3651、note 501、note 500 正常 +4 補點、管理員拒絕、無有效權益扣點及 route stub 併發。兩個明確 `it.fails` 邊界案例要求 amount 高於 `2,147,483,647` 或低於 `-2,147,483,648` 時，在建立 DB client 前回 400；現行 Zod schema 只驗 `.int()`，兩值均通過該驗證並進入 mock DB path，預期斷言失敗。

這兩例只證明 route/mock 的驗證缺口。`supabase/migrations/0001_init.sql` 將 `member_entitlements.credits_remaining` 與 `credit_transactions.amount` 定義為 PostgreSQL `integer`，因此欄位範圍為 int4；實際 HTTP／PostgreSQL 對超界值的錯誤狀態與是否有任何副作用**尚未實測**，不可記為已觀察到 500。修復後應加入明確 int4 範圍驗證，並在隔離 API/DB 驗證上下界及越界輸入均不產生餘額、ledger、audit 副作用。

其餘邊界案例皆為 route＋替身證據，未連真資料庫或 API stack，沒有真實會員／權益／交易資料寫入；不證明 Supabase transaction 競態。int4 越界兩例是 route mock 的 expected fail，實際 DB/API 結果仍待隔離驗證；正式端到端亦未完成。

## 重現步驟

### 超額扣點

1. 建立隔離 QA 會員及一筆有效權益，`credits_remaining=5`。
2. 具名管理員送 `POST /api/admin/credits`，body：`{"user_id":"<QA UUID>","amount":-10,"note":"QA overdraw"}`。
3. 比對 HTTP、權益餘額、credit transaction amount 與 audit。

**預期／實際：**超額扣點政策需由產品決策；任何政策下餘額、交易與 audit 必須一致。若選「拒絕超額」，預期 4xx 且三者零變更；若選「截至 0」，預期交易 amount 為實際扣除 `-5`，不能記 `-10`。現行替身實際為餘額 0、交易 `-10`。

### audit 故障

1. 於隔離 fixture 對專用會員建立 5 點權益。
2. 注入只影響本次 audit INSERT 的故障，管理員提交 `amount=-5`。
3. 檢查 HTTP、餘額、ledger、audit；解除故障後重試，核對不重複改帳。

**預期：**audit 必須和餘額／ledger 在同一交易原子提交；任一寫入失敗時全部回滾並回可追蹤錯誤。**實際：**route 替身回 200、餘額與 ledger 已改、audit 為 0；真 DB transaction 故障尚未測。

## 影響與驗收標準

帳本 amount 可能不等於餘額實際變化，使營運對帳、退款／授權計算與稽核紀錄失真；audit 故障時改帳成功但沒有操作者軌跡。並發下可能遺失一筆餘額更新；這項影響待隔離複驗。

修復後須先記錄產品選定的超額規則，再於專用隔離 API／DB 驗證：正常加點與扣點；超額及零餘額邊界；int4 `-2,147,483,648`／`2,147,483,647` 上下界與兩側越界值；audit INSERT 與 ledger INSERT fault 原子回滾；雙管理員 N=2／N=10 並發後餘額等於起始餘額加所有成功 ledger delta；管理員授權、未知會員／無有效權益、非法／小數金額及 500／501 字 note；重試不得重複增減點；fixture／audit／故障 trigger 清零。每個故障和競爭案例至少 10 輪，修復後移除 `it.fails` 改正常斷言並跑完整相關回歸。

## 待決與派工

- **產品決策：**超額扣點採「拒絕」或「截至餘額」。QA 建議拒絕超額以保持請求量與實際效果語義一致；若產品選截至 0，交易必須記錄實際 delta。兩方案由 X-PM 提交決策，不由 QA 擅自套用。
- **工程修復：**以 DB 原子 RPC／交易鎖處理餘額、ledger 與 audit；並發操作不可覆蓋對方變更；audit 或 ledger 寫入失敗需全回滾。
- **派工狀態：**C2 已由 X-PM 收件／追蹤；本文件補足可重現證據與驗收標準，等候確認產品規則及工程候選 SHA。

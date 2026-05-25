# Handoff

更新時間：2026-05-19 Asia/Taipei，整合測試進度

## 目前狀態

這是巽風官方網站 V2 的本機新專案，目標是把舊版 Cloudflare Pages + Worker + D1 架構，改成 Next.js + Supabase + 綠界金流 + OpenAI + Vercel。

目前採用「新版獨立 repo」策略。舊 repo 只作為素材與內容來源。

使用者已提供新版 GitHub repo：

```text
https://github.com/JasonM568/mvp4z-.git
```

本機路徑：

```text
/Users/jasonmchen/codex-巽風系統/xunfeng-official-v2
```

舊版來源：

```text
/Users/jasonmchen/codex-巽風系統/xunfeng-official
```

## 已完成

- 建立 Next.js + TypeScript 專案骨架。
- 搬入舊版 HTML 到 `legacy-pages/`。
- 搬入舊版 CSS 到 `styles/site.css`、`styles/member.css`。
- 搬入舊版圖片與前端 JS 到 `public/`。
- 搬入舊版內容 JSON 到 `content/` 與 `public/content/`。
- 建立 `app/[[...slug]]/page.tsx`，用 Next.js route adapter 讀取舊頁面，先維持原本視覺與頁面內容。
- 建立 Supabase helper：
  - `lib/supabase/client.ts`
  - `lib/supabase/admin.ts`
- 建立綠界 helper：
  - `lib/payments/ecpay.ts`
- 建立 OpenAI helper：
  - `lib/ai/openai.ts`
- 建立 API route 佔位：
  - `/api/auth/register`
  - `/api/auth/login`
  - `/api/auth/logout`
  - `/api/member/me`
  - `/api/member/redeem`
  - `/api/member/usage`
  - `/api/ai/chat`
  - `/api/orders/create`
  - `/api/payments/ecpay/notify`
  - `/api/payments/ecpay/return`
  - `/api/admin/members`
  - `/api/admin/create-code`
  - `/api/admin/orders`
  - `/api/admin/credits`
- 建立 Supabase migration 初版：
  - `supabase/migrations/0001_init.sql`
  - `supabase/migrations/0002_rls.sql`
  - `supabase/seed.sql`
- 建立 `.env.example`。
- 建立 README。
- 已執行 `npm install`。
- 已執行 `npm run build`，build 通過。
- 已初始化本機 Git。
- 已設定 remote：`https://github.com/JasonM568/mvp4z-.git`。
- 已建立並推送 `develop` 分支。
- 已建立功能 worktree：
  - `/Users/jasonmchen/codex-巽風系統/xunfeng-v2-next-base`：`feature/next-base`
  - `/Users/jasonmchen/codex-巽風系統/xunfeng-v2-supabase-auth`：`feature/supabase-auth`
  - `/Users/jasonmchen/codex-巽風系統/xunfeng-v2-ecpay`：`feature/ecpay-payments`
  - `/Users/jasonmchen/codex-巽風系統/xunfeng-v2-ai-member`：`feature/ai-member`
  - `/Users/jasonmchen/codex-巽風系統/xunfeng-v2-admin`：`feature/admin-dashboard`
- `feature/supabase-auth` 已開始實作 Supabase Auth：
  - 新增 `lib/supabase/server.ts`。
  - 新增 `lib/auth/member.ts`，負責驗證 Bearer token、確保 profile、輸出舊前端可用的 member shape。
  - 實作 `/api/auth/register`、`/api/auth/login`、`/api/auth/logout`。
  - 實作 `/api/member/me`、`/api/member/redeem`、`/api/member/usage`。
  - 新增舊 Worker 相容路徑 `/api/register`、`/api/login`、`/api/logout`、`/api/me`、`/api/redeem`。
- `feature/ecpay-payments` 已開始實作綠界金流：
  - 擴充 `lib/payments/ecpay.ts`，支援 MerchantTradeNo、綠界日期格式、AioCheckOut params、表單資料解析。
  - 新增 `lib/payments/orders.ts`。
  - 實作 `/api/orders/create`，登入會員可建立 pending order 並取得綠界 checkout form payload。
  - 實作 `/api/payments/ecpay/notify`，驗證 `CheckMacValue`、紀錄 payment、更新 order、建立會員權益與點數交易紀錄。
  - 實作 `/api/payments/ecpay/return`，處理付款完成後回站。
  - 新增 `supabase/migrations/0003_payment_idempotency.sql`，用於 payment/order entitlement 防重複。
- `feature/ai-member` 已開始實作 AI 會員問答：
  - 新增 `lib/ai/member-chat.ts`，集中 AI system instructions 與 OpenAI 呼叫。
  - 實作 `/api/ai/chat`。
  - 新增舊 Worker 相容路徑 `/api/chat`。
  - AI 問答前會檢查有效 entitlement、到期日與剩餘點數。
  - 呼叫 OpenAI 前先扣 1 點；若 OpenAI 或寫紀錄失敗，會補回點數。
  - 成功後寫入 `usage_logs` 與 `credit_transactions`，並回傳舊前端可用的 `{ reply, member }`。
- `feature/admin-dashboard` 已開始實作管理員 API：
  - 新增 `lib/auth/admin.ts`。
  - 管理驗證支援 Supabase `role=admin`，並暫時相容舊後台 `X-Admin-Key`。
  - 實作 `/api/admin/members`。
  - 實作 `/api/admin/orders`。
  - 實作 `/api/admin/create-code`。
  - 實作 `/api/admin/credits`。
  - 管理操作會寫入 `admin_audit_logs`。
- 已建立第一個 commit：

```text
e1e715e Initialize Next.js v2 scaffold
```

## 本機服務

今天曾啟動過：

```text
http://localhost:3000
```

使用者收工時 in-app browser 位於：

```text
http://localhost:3000/services
```

收工前已停止 Next dev server，沒有刻意保留長時間執行程序。

如果下次 server 沒有在跑，從專案根目錄執行：

```bash
npm run dev
```

## 驗證紀錄

已通過：

```bash
npm run build
```

今天最後一次是在 `develop` 整合線執行，通過。並曾確認 localhost 回應 `HTTP/1.1 200 OK`。

注意：`npm install` 後顯示 `2 moderate severity vulnerabilities`。正式部署前要再處理。

## 今日收工摘要

今天完成並推送到 GitHub：

- `feature/supabase-auth`：`343f3ea Implement Supabase member auth APIs`
- `feature/ecpay-payments`：`edcbfad Implement ECPay order payment flow`
- `feature/ai-member`：`3d1178f Implement AI member chat credits`
- `feature/admin-dashboard`：`6557ea4 Implement admin management APIs`

以上皆已 fast-forward merge 回 `develop`，並推送到 `origin/develop`。

目前 `develop` 最新 commit：

```text
6557ea4 Implement admin management APIs
```

本次收工前確認：

```text
git status --short --branch
## develop...origin/develop
```

## 2026-05-19 整合測試進度

今天完成本機 + Supabase Cloud 整合測試，後端骨架四條主要鏈路打通。

### 環境設定

- 已安裝 Supabase CLI（`brew install supabase/tap/supabase`，目前 v2.100.0）。
- 已建立 Supabase Cloud project：
  - Reference ID：`pvasgmmjrodukudbzuhp`
  - API URL：`https://pvasgmmjrodukudbzuhp.supabase.co`
- `.env.local` 目前值（收工狀態，URL 都是 ngrok）：
  - `NEXT_PUBLIC_SITE_URL=https://acclivous-tomi-prevailingly.ngrok-free.dev`（測完 webhook 後就停了，這個網址會作廢）
  - `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 都填好。
  - `ECPAY_ENV=sandbox`、`ECPAY_MERCHANT_ID=3002607`、`ECPAY_HASH_KEY=pwFHCqoQZGmho4w6`、`ECPAY_HASH_IV=EkRm7iFT261dpevs`（用綠界公開測試帳號，**不是**使用者自己的沙箱商店）
  - `ECPAY_NOTIFY_URL` / `ECPAY_RETURN_URL` / `ECPAY_CLIENT_BACK_URL` 目前都指向 ngrok 網址，下次重啟前要先改回 `http://localhost:3000` 或新的 ngrok 網址。
  - `OPENAI_API_KEY` 仍為空（AI chat 還沒測）。
  - `ADMIN_EMAILS` 仍為空（程式碼目前沒引用，admin 透過 `profiles.role='admin'` 或 `ADMIN_KEY` header 驗證）。
- 已執行 `supabase link --project-ref pvasgmmjrodukudbzuhp`，token 與 DB password 已存進 mac keychain。
- 使用者自己申請的綠界沙箱商店 `3325455` / HashKey `vtOLMbfELHctscIw` / HashIV `nRGcBI1MSIGER2fW` 在綠界後台 **尚未啟用任何付款方式**（沙箱回 `10200141` 錯誤），需要先去 https://vendor-stage.ecpay.com.tw/ 啟用信用卡等付款方式才能用。在那之前都用綠界公開測試帳號 `3002607` 測流程。

### Supabase 已套用 migrations + seed

- `supabase db push` 套用了 `0001_init.sql`、`0002_rls.sql`、`0003_payment_idempotency.sql`。
- seed 改用 PostgREST API 直接 insert 3 個方案（trial / basic / pro），因為 supabase CLI 的 seed 指令需要 config.toml。
- 9 個 table 全部 HTTP 200 可存取。

### 端到端測試結果（本機 dev server）

| 流程 | 結果 |
| --- | --- |
| `POST /api/auth/register` | ✅ Supabase Auth 建 user + profile，回 JWT 與 PublicMember。 |
| `GET /api/member/me` (Bearer) | ✅ 取得會員，初始 `status=pending`、`plan=free`、`credits_remaining=0`。 |
| `POST /api/auth/login` | ✅ 同帳號重新發 token。 |
| `POST /api/orders/create` (`basic`) | ✅ 寫入 pending order，產綠界 sandbox `AioCheckOut/V5` 表單參數與 `CheckMacValue`。 |
| 直接改 DB 把 profile 升 admin | ✅ `role='admin'`。 |
| `POST /api/admin/create-code` | ✅ 產出 `XF-XXXX-XXXX` 啟用碼。 |
| `POST /api/member/redeem` | ✅ 升級成 `active`/`basic`/60 credits/30 天。 |
| `GET /api/member/me` 二測 | ✅ 反映新 entitlement。 |
| `POST /api/orders/create` (`pro`) → 走完綠界 sandbox 真實刷卡 → webhook 回 callback | ✅ ngrok 同時收到 `POST /api/payments/ecpay/notify` (200) 與 `POST /api/payments/ecpay/return` (307)。`orders.status` → `paid`、`payments.check_mac_valid=true`、`member_entitlements` 新增 pro 150 credits、`credit_transactions` 新增 grant +150 (source `ecpay_payment`、ref_id 為 order_no)。會員 me 顯示 `plan=pro` / `credits_remaining=150`。 |

測試帳號（本機/sandbox 用）：

- email：`test_1779164570@xunfeng.dev`
- password：`testpass1234`
- profile id：`185dff2c-9b48-484a-8449-3d457a0c6afa`
- 已升 admin，已 redeem basic 方案，也已透過綠界 sandbox 完成一筆 pro 訂單。

### 已知踩雷與待修

- **綠界 sandbox 「模擬付款」按鈕不會發 webhook**：只做 browser redirect，沒有 server-to-server 通知。要測 webhook **必須走真實刷卡表單**（信用卡分頁 → 填卡號 `4311-9522-2222-2222` / `222` / `12/30` → 確認付款）。
- **return endpoint redirect URL bug 已於 2026-05-20 修正**：付款成功瀏覽器曾被導去 `https://localhost:3000/member?payment=paid&order=...`；目前已改用 `NEXT_PUBLIC_SITE_URL` 或 forwarded/request origin，localhost 強制使用 `http`。
- **idempotency 沒測**：migration 0003 加了 `(provider, merchant_trade_no)` 與 `(provider, provider_trade_no)` 的 unique index，理論上重複 webhook 會被擋，但沒實際重送驗證。

## 尚未完成

- **電子發票串接**（依台灣稅法，付款成功後須開立統一發票，目前完全沒做。詳見下方「電子發票串接 TODO」）。
- AI chat 流程尚未完整端到端驗證。
- Vercel 部署設定（新 GitHub repo 已存在 `JasonM568/mvp4z-`，但 Vercel project 還沒建）。

## 電子發票串接 TODO

付款流程是收費系統的「前半段」，電子發票是「後半段」，目前**完全沒實作**，正式對外營運前必須補上。

### 法規與選型

- 台灣稅法要求：B2C 付款成功後須開立雲端發票（個人）或三聯式統一發票（公司戶）。
- 選型方向（擇一）：
  - 綠界電子發票模組（`https://invoice-stage.ecpay.com.tw/`），與目前金流串接同一供應商，後台合一最省事。
  - 藍新 / ezPay 電子發票服務（若日後也想換金流可考慮）。
  - 自建 → 不建議，發票格式與大平台對接（財政部 / 載具）規則繁瑣。
- 預設往「**綠界電子發票**」走，後續若有商業考量再換。

### 預期實作

1. DB 新增 `invoices` table：欄位至少 `id`、`order_id`（FK orders）、`provider`、`invoice_number`、`random_code`、`buyer_type`（personal/company）、`buyer_name`、`buyer_id`（統編 / 個人手機條碼）、`carrier_type`、`carrier_num`、`donation_code`、`status`（issued/voided）、`raw_payload`、`issued_at`、`created_at`。
2. `orders` 結帳前要收集發票相關資訊（個人 / 公司、載具、捐贈碼、抬頭、統編）。前端 `member-pricing` 頁面要加表單欄位。
3. 後端 `/api/payments/ecpay/notify` 確認付款 `paid` 之後，**串行**呼叫綠界電子發票 API 開立發票，成功才回 `1|OK` 給綠界（或先回 OK 再非同步開票 + 重試，看可接受程度）。
4. 新增 API：
   - `POST /api/invoices/issue`（手動補開）
   - `POST /api/invoices/void`（作廢，30 天內）
   - `GET /api/invoices` / `GET /api/invoices/:id`（會員查自己發票）
   - admin 也要有列表 + 補開 + 作廢介面。
5. 新增 `.env` 變數：`ECPAY_INVOICE_MERCHANT_ID`、`ECPAY_INVOICE_HASH_KEY`、`ECPAY_INVOICE_HASH_IV`（沙箱 / 正式分開），以及預設開立來源（自動 / 手動）。
6. 失敗處理：開票失敗要寫 audit log、要可重試；發票號碼用罄、字軌過期、買受人資料錯誤等錯誤碼要有對應 UI 訊息。

### 與現有系統的接點

- 開票時機：建議綁在 `payments` 寫入 `status=paid` 的同一個 transaction 之後（不要在 transaction 內呼叫外部 API，避免 hold 連線太久）。
- 已測過的測試訂單 `XF2026051913034555C9` 目前沒對應發票，正式上線前要決定歷史測試資料如何清理。

## 下次建議先做

1. 註冊第一個 admin 帳號（ADMIN_EMAILS 已設）→ /login 註冊 → 重新登入 → /admin-login。
2. 測 `/api/ai/chat`：扣點、`usage_logs`、點數不足情境。
3. **規劃電子發票串接**：先決定供應商（預設綠界）→ 申請沙箱發票字軌 → 加 `invoices` migration → `/api/payments/ecpay/notify` 補開票邏輯 → 結帳頁加買受人 / 載具欄位（詳見「電子發票串接 TODO」章節）。

## 2026-05-23 Vercel project 釐清

repo 原本同時被 `mvp4z` 與 `xunfeng-v2-vercel-deploy` 兩個 Vercel project watch，PR check 兩邊都跑 preview。盤點發現 `mvp4z` 只有 10 個 env（缺 ECPAY_* 與 ADMIN_EMAILS，付款流程動不了），`xunfeng-v2-vercel-deploy` 有完整 16 個 env，是 2026-05-21 worktree 補設的。

決策：**合併到 `mvp4z`，刪除 `xunfeng-v2-vercel-deploy`**。

執行步驟：

- 從 `xunfeng-official-v2/.env.local` 把 8 個缺的 env vars 用 stdin pipe 加進 `mvp4z` production：
  - 5 個原樣搬：`ADMIN_EMAILS`、`ECPAY_ENV`、`ECPAY_HASH_IV`、`ECPAY_HASH_KEY`、`ECPAY_MERCHANT_ID`
  - 3 個 URL 改寫指向 `https://mvp4z.vercel.app`：`ECPAY_RETURN_URL`、`ECPAY_NOTIFY_URL`、`ECPAY_CLIENT_BACK_URL`
- 重新 production deploy：`dpl_Guc3AWJu5SJmxSN1JuTnABUdegUG`，URL `https://mvp4z-dafgklx4g-tjs-projects-435187fd.vercel.app`。
- Smoke test 5 條全通過：
  - `GET /` → 200
  - `GET /member-pricing` → 200
  - `GET /api/payments/ecpay/return` → 303 → `https://mvp4z.vercel.app/member`
  - `GET /admin-login` → 200
  - `GET /member-ai` → 200
- `vercel project rm xunfeng-v2-vercel-deploy` 刪除重複 project。
- PR #5 (`feature/vercel-deploy`) 已關（不 merge）、branch 已刪、worktree 已 `git worktree remove`。
- 副作用：原本 PR #5 內的 `docs/vercel-deployment.md` 隨 worktree 一起刪了，若日後要長期保留部署紀錄要重寫一份以 `mvp4z` project 為主的版本。

## 2026-05-23 一日大整收尾紀錄

從 2026-05-21 三個未 commit worktree 的尾巴一路接到 ECPay 自動化前端 + 易學決策報告（council）可運行。一共 merge 11 個 PR（#3～#21，#5 closed without merge）。`main` HEAD 多次推進，最後落在 PR #21 release（`feature/council-route-maxduration` 修真兇）。

### 一、清三個 2026-05-21 收尾未提交的 worktree
- **PR #3/#4/#5** 開出。
- **PR #3**（`feature/ecpay-idempotency`）→ develop merged，新增 `scripts/test-ecpay-idempotency.mjs` + npm script。
- **PR #4**（`feature/audit-fixes`）→ develop merged（先 rebase 解 handoff.md 衝突），鎖 `postcss@8.5.15` + npm overrides。
- **PR #5**（`feature/vercel-deploy`）暫留 → 後續流程裡決定不 merge → 直接 close。

### 二、Vercel project 釐清 → 合併到 mvp4z
- 發現 repo 同時被 `mvp4z` 與 `xunfeng-v2-vercel-deploy` 兩個 Vercel project watch，PR check 兩邊都跑 preview。
- 盤點 env：`mvp4z` 缺 8 個（ADMIN_EMAILS、ECPAY_*），`xunfeng-v2-vercel-deploy` 才完整。
- 從 `.env.local` 用 stdin pipe 把缺的 env 補進 `mvp4z`（值不 echo 到 log），URL 類改寫指向 `https://mvp4z.vercel.app`。
- mvp4z 重新 deploy `dpl_Guc3AWJu5SJmxSN1JuTnABUdegUG`，5 條 smoke test 通過。
- `vercel project rm xunfeng-v2-vercel-deploy`，PR #5 關閉、branch+worktree 移除。

### 三、Legacy 渲染 bug 兩連修
- **PR #6/#7**（`feature/legacy-head-scripts`）：`lib/site/legacy-page.ts` 原本只在 body 範圍掃 `<script src=>`，但 `login.html` 等把 `member-config.js` / `member-auth.js` 放在 `<head>`，導致 `window.registerMember` / `loginMember` 全 undefined、所有「建立帳號 / 登入 / 啟用」按鈕點下去都沒反應、也沒 console error（onclick ReferenceError 被 React event system 吞掉）。改成從整份 raw HTML 抓 script + dedupe。Root cause 靠 gstack-browse 在 prod /login 點按鈕、發現 network 完全沒打 /api/register 找到的。
- **PR #8/#9**（`feature/legacy-js-urls`）：`member-auth.js` / `member-ai.js` / `cms-render.js` 內 `location.href = "X.html"` 會打到 catch-all 沒登記的 /X.html → 404。改成 `/X`。順手 `.gitignore` 加 `.gstack/`。

### 四、第一個 admin 帳號上線
- 用 `306465@gmail.com` 註冊 → `ensureProfileForAuthUser` 看 ADMIN_EMAILS 自動升 role=admin（profile id `5e02737a-f545-446a-98bf-9dd1bba00b31`，name=CHEN MENG HUNG）。
- 清掉 debug 過程在 prod Supabase 建的 2 個 `debug_*@example.com` 測試帳號（profile + auth.users）。

### 五、ECPay 一鍵結帳 UX 整合
原本 backend `/api/orders/create` + ECPay webhook 都串好，但前端從沒接：`/member-pricing` 仍是 v1「LINE 詢問人工開通」靜態頁、`/member` 註冊完只看到「輸入啟用碼」面板。

- **PR #10/#11**（`feature/ecpay-pricing-frontend`）：
  - 新增 GET `/api/plans`（公開）回 active 非 trial plans。
  - 重寫 `/member-pricing.html` 為動態渲染骨架 + 新增 `public/js/member-pricing.js`：拉 `/api/plans` 渲染 basic/pro/vip 三張卡，「立即購買」未登入跳 /login，已登入則 POST `/api/orders/create` → 組 hidden form auto-submit 到綠界。
  - `/member.html` 加狀態化 CTA：active 顯示「進入 AI 會員版」、非 active 顯示「立即購買方案」。啟用碼面板降級為「我有啟用碼」摺疊區（admin promo code 用）。
  - `member-auth.js` 擴 `loadMember` 分支 activePanel / pendingPanel；新增 `showPaymentResult` 讀 `?payment=` query 顯示 banner。

### 六、Next.js script 注入時序兩連修
- **PR #12/#13**（`feature/dom-ready-fix`）：`member-pricing.js` / `member-ai.js` 用 `document.addEventListener("DOMContentLoaded", ...)`，但 `next/script strategy="afterInteractive"` 注入時 DOMContentLoaded 已 fire 過，listener 永遠不會跑。改成檢查 `readyState === "loading"` 決定要 listen 還是直接呼叫。
- **PR #16/#17**（`feature/member-page-autoinit`）：`<body onload="loadMember()">` 屬性會被 Next.js RootLayout 的無屬性 `<body>{children}</body>` 覆蓋掉（dangerouslySetInnerHTML 只接受 body 內容、不帶 body tag 自身屬性）。會員中心永卡「讀取中」。在 `member-auth.js` 末尾用元素判別（看有沒有 `#memberName`）+ readyState 自啟動。順手把 member.html 失效的 `onload="..."` 拿掉。

### 七、共用 SiteHeader
- **PR #14/#15**（`feature/site-header-shared`）：`/member-ai/decision` 原本自帶簡化版 topbar（只 3 個 link）。新增 `components/SiteHeader.tsx` 對齊 legacy index.html 的 `.topbar` + `.nav-links`（11 個 link，含 LINE 預約），支援可選 member badge（登入後顯示 `PRO ｜ 剩 N 點` 取代「登入」按鈕）。先用在 decision 頁，之後 admin/admin-login 可同步換上。

### 八、ECPay sandbox「模擬付款」按鈕的雷
admin 在 /member-pricing 點「pro 立即購買」→ 跳綠界 → 點「模擬付款」按鈕 → 綠界顯示成功、browser redirect 回站、但 **server-to-server webhook 完全沒發**。DB 留下 2 筆 pending order、無 entitlement。

- 2 筆 pending order 已 service role 刪除。
- 用 `scripts/test-ecpay-idempotency.mjs --base-url https://mvp4z.vercel.app` 模擬 webhook 對新建的 pro order：走真實 webhook code path 寫 entitlement（150 credits / 30 天）+ payment + credit_transaction。順便驗 prod webhook idempotency（連送兩次三張表筆數不變）。
- Production 沒這顆按鈕，僅 sandbox 才有，正式上線不會踩此雷。

### 九、易學決策報告 504 timeout 真兇追擊
admin 在 /member-ai/decision 點「生成綜合報告」→ 系統提示 `Unexpected token 'A', "An error o"... is not valid JSON`（Vercel 預設錯誤頁不是 JSON）。

- **第一次嘗試 — PR #18/#19**（`feature/council-timeout`）：以為 `vercel.json` 的 `app/api/ai/council/route.ts: maxDuration: 120` 是兇手，改成 300（順便拿掉 Active CPU billing 已忽略的 `memory: 1024`）。Deploy 後重試 → 仍 504 timeout after **120 seconds**。
- **第二次嘗試 — PR #20/#21**（`feature/council-route-maxduration`）：真兇是 `app/api/ai/council/route.ts:46` 內 `export const maxDuration = 120`。**Next.js App Router 的 route segment config export 優先於 vercel.json**。改 route 內 export 為 300。Deploy 後重試 → council 跑 **150 秒**生成完成、`council_runs.final_ok=true` / `fallback_used=false` / `credits_charged=10` / `total_tokens_in=50059, out=18177`，credit_transactions debit row 也正常寫入（source=`ai_council` ref_id=council_runs.id）。

### 副作用 — Council atomicity bug
兩次 504 中間 admin 各被扣 10 點但完全沒拿到報告（route 是先扣點再跑 LLM、Vercel 強制 kill function 時 refund 沒跑）：
- 504 不會寫 credit_transactions debit row、不會寫 council_runs row、credits_remaining 直接 -10。
- 兩次手動補退 10 點 + log `adjustment +10 source=admin_refund ref_id=council-504-timeout-*-2026-05-23`。
- 真正修法應該動 council route 把扣點 + 寫 transaction 改成原子操作，或改成「LLM 成功才扣點」。列在待辦。

### 收工狀態
- `main` HEAD: PR #21 release merge（route maxDuration=300）
- Prod `https://mvp4z.vercel.app` ECPay sandbox 一鍵結帳、council 都可運作
- Admin `306465@gmail.com` 持有 pro entitlement / 140 credits / 到期 2026-06-22
- council_runs 表第一筆真實生成記錄 `95e1f355-9c84-4bc8-8247-5f76a7628530`

### 待辦（重要性排序）
1. ECPAY production keys 切換正式商店（目前是綠界公開測試帳號 `3002607`）
2. **Council 扣點 atomicity bug**：扣點 + 寫 transaction 改原子，或改「LLM 成功才扣點」
3. 電子發票串接（`feature/ecpay-invoice` worktree 已建未開工）
4. `feature/ecpay-merchant-config`（sandbox/prod 切換規則）未開工
5. AI chat (/api/ai/chat) 端到端流程驗證（admin 有 pro entitlement 可拿來測）
6. 課程報名訂單系統（之後另開 worktree）
7. SiteHeader 推到其他 Next 頁面（admin / admin-login）
8. 未付款訂單自動清理 cron（>24h pending → cancelled）
9. /member-ai/decision useEffect 拿不到 member 時 silently swallow 401，按鈕應 disabled 並提示重新登入
10. 重寫 Vercel 部署文件（原 docs/vercel-deployment.md 隨 feature/vercel-deploy 一起刪了）

### 累積的 Sandbox UX 提醒
- 綠界 sandbox「**模擬付款**」按鈕**不發 webhook**，要驗 webhook 必須走信用卡分頁填測試卡（`4311-9522-2222-2222` / `222` / `12/30`）
- Supabase JWT 預設 1 小時過期，token 過期後 /api/me 401，需要重新登入

## 2026-05-20 ECPay idempotency 驗證

- 新增 `scripts/test-ecpay-idempotency.mjs` 與 `npm run test:ecpay-idempotency -- --order-no <order_no> --trade-no <trade_no>`，可重送同一筆綠界 notify payload 並比對資料筆數。
- 已用既有測試訂單 `XF2026051913034555C9` 與綠界交易編號 `2605191303547152` 驗證重送兩次 webhook。
- 驗證結果：`payments`、`member_entitlements`、`credit_transactions` 在測試前、第一次 notify 後、第二次 notify 後都維持各 1 筆，沒有重複付款紀錄、重複權益或重複加點。

## 2026-05-21 npm audit 修正

- `npm audit` 的 2 個 moderate vulnerabilities 來源是 Next 15.5.18 內部固定依賴的 `postcss@8.4.31`，對應 GHSA-qx2v-qp2m-jg93。
- 未採用 `npm audit fix --force`，因為 npm 建議降到 `next@9.3.3`，會破壞目前 Next 15 App Router 專案。
- 將直接 devDependency `postcss` 固定為 `8.5.15`，並新增 npm `overrides.postcss=8.5.15`，讓 `next`、Tailwind、Autoprefixer 共用修補版。
- 驗證：`npm audit` 回 `found 0 vulnerabilities`；`npm ls postcss` 顯示 `next@15.5.18` 使用 `postcss@8.5.15 deduped`；`npm run build` 通過。

## 2026-05-20 開工紀錄

- `develop` 已前進到 `dd130c0 Merge feature/admin-portal: /admin-login + /admin tree`，handoff 先前仍停在 `6557ea4`，需以目前 git log 為準。
- 已整合但舊 handoff 未完整記錄的功能：
  - `f93b2f7 Merge feature/bookings-backend: consultation_bookings + booking form`
  - `dd130c0 Merge feature/admin-portal: /admin-login + /admin tree`
- 已把 `.env.local` 的 `NEXT_PUBLIC_SITE_URL`、`ECPAY_RETURN_URL`、`ECPAY_NOTIFY_URL`、`ECPAY_CLIENT_BACK_URL` 從失效 ngrok 改回 `http://localhost:3000`。
- 已修 `app/api/payments/ecpay/return/route.ts`：
  - 回站 redirect 改用 `NEXT_PUBLIC_SITE_URL` 或 forwarded/request origin。
  - localhost / 127.0.0.1 強制使用 `http`。
  - POST / GET redirect 改成 `303 See Other`。
  - POST 回站用 `URLSearchParams` 帶 `payment` 與 `order`，避免手動 query encode。
- 驗證：
  - `npm run build` 通過。
  - 本機 dev server 驗證 `GET /api/payments/ecpay/return` 回 `303 Location: http://localhost:3000/member`。
  - 本機 dev server 驗證無效 POST payload 回 `303 Location: http://localhost:3000/member?payment=pending&order=XFTEST123`。

## 2026-05-21 收工紀錄

今天接續多個 worktree 任務，重點是把付款防重送、安全 audit、Vercel deploy 三條上線前路徑往前推。三個 worktree 都還沒 commit，下一次若要整合，先逐一 review diff、commit、push branch，再決定 merge 順序。

### 已完成事項

1. `xunfeng-v2-ecpay-idempotency` (`feature/ecpay-idempotency`)
   - 建立 `.env.local` symlink 指向 `../xunfeng-official-v2/.env.local`。
   - `npm install` 完成。
   - 啟動 Next dev server 後完成綠界 notify idempotency 重送測試。
   - 新增 `scripts/test-ecpay-idempotency.mjs`。
   - 新增 npm script：`npm run test:ecpay-idempotency -- --order-no <order_no> --trade-no <trade_no>`。
   - 已用測試訂單 `XF2026051913034555C9` 與交易編號 `2605191303547152` 重送 webhook 兩次，確認沒有重複付款、重複開通或重複加點。

2. `xunfeng-v2-audit-fixes` (`feature/audit-fixes`)
   - 查明 `npm audit` 的 2 個 moderate vulnerabilities 來源是 `next@15.5.18` 內部固定的 `postcss@8.4.31`，對應 GHSA-qx2v-qp2m-jg93。
   - 未採用 `npm audit fix --force`，因為 npm 建議降級到 `next@9.3.3`，會破壞目前 Next 15 App Router 專案。
   - 將直接 devDependency `postcss` 固定為 `8.5.15`。
   - 新增 npm `overrides.postcss=8.5.15`，讓 `next`、Tailwind、Autoprefixer 共用修補版。

3. `xunfeng-v2-vercel-deploy` (`feature/vercel-deploy`)
   - 用 Vercel CLI 建立並 link project：`tjs-projects-435187fd/xunfeng-v2-vercel-deploy`。
   - 連接 GitHub repo：`https://github.com/JasonM568/mvp4z-`。
   - Production URL：`https://xunfeng-v2-vercel-deploy.vercel.app`。
   - 匯入 production env，並把：
     - `NEXT_PUBLIC_SITE_URL`
     - `ECPAY_RETURN_URL`
     - `ECPAY_NOTIFY_URL`
     - `ECPAY_CLIENT_BACK_URL`
     指向 Vercel production URL。
   - 重新 production deploy，讓新增 env 生效。
   - 移除 `vercel.json` 裡 Vercel Active CPU billing 會忽略的 `memory` 設定。
   - 新增 `docs/vercel-deployment.md`，記錄 project、部署命令、env 清單、ECPay URL 與 caveats。

### 修改過的檔案

- `xunfeng-v2-ecpay-idempotency/handoff.md`
- `xunfeng-v2-ecpay-idempotency/package.json`
- `xunfeng-v2-ecpay-idempotency/scripts/test-ecpay-idempotency.mjs`
- `xunfeng-v2-audit-fixes/handoff.md`
- `xunfeng-v2-audit-fixes/package.json`
- `xunfeng-v2-audit-fixes/package-lock.json`
- `xunfeng-v2-vercel-deploy/handoff.md`
- `xunfeng-v2-vercel-deploy/vercel.json`
- `xunfeng-v2-vercel-deploy/docs/vercel-deployment.md`
- `xunfeng-official-v2/handoff.md`

### 驗證結果

- `feature/ecpay-idempotency`
  - `npm run test:ecpay-idempotency -- --order-no XF2026051913034555C9 --trade-no 2605191303547152`
  - 結果：`payments`、`member_entitlements`、`credit_transactions` 在測試前、第一次 notify 後、第二次 notify 後都維持各 1 筆。

- `feature/audit-fixes`
  - `npm audit` 回 `found 0 vulnerabilities`。
  - `npm ls postcss` 顯示 `next@15.5.18` 使用 `postcss@8.5.15 deduped`。
  - `npm run build` 通過。

- `feature/vercel-deploy`
  - Vercel production deploy ready：`dpl_V4aXtEyqAq5ZjCeyKidHXZiAbR3g`。
  - `GET https://xunfeng-v2-vercel-deploy.vercel.app/` 回 `200`。
  - `GET https://xunfeng-v2-vercel-deploy.vercel.app/member-pricing` 回 `200`。
  - `GET https://xunfeng-v2-vercel-deploy.vercel.app/api/payments/ecpay/return` 回 `303 Location: https://xunfeng-v2-vercel-deploy.vercel.app/member`。
  - 本機 `npm run build` 通過。

### 當前 git status 摘要

```text
xunfeng-v2-ecpay-idempotency:
## feature/ecpay-idempotency
 M handoff.md
 M package.json
?? scripts/

xunfeng-v2-audit-fixes:
## feature/audit-fixes
 M handoff.md
 M package-lock.json
 M package.json

xunfeng-v2-vercel-deploy:
## feature/vercel-deploy
 M handoff.md
 M vercel.json
?? docs/
```

### 尚未完成事項

- 三個完成中的 worktree 尚未 commit / push / PR。
- `feature/vercel-deploy` 的 Preview env 尚未成功設定，因為 `feature/vercel-deploy` 當時尚未存在於 connected GitHub repository。push branch 後再補 Preview env 或用 Vercel dashboard 設定。
- `feature/vercel-deploy` 仍顯示 npm audit 2 個 moderate vulnerabilities，原因是 `feature/audit-fixes` 尚未合併；不要在 deploy 分支重複修同一件事。
- `feature/ecpay-merchant-config` 尚未開始。
- `feature/ecpay-invoice` 尚未開始。
- AI chat 端到端流程尚未完整驗證。

### 下一次建議起手式

1. 先確認三個 worktree diff：
   - `cd /Users/jasonmchen/codex-巽風系統/xunfeng-v2-ecpay-idempotency && git diff`
   - `cd /Users/jasonmchen/codex-巽風系統/xunfeng-v2-audit-fixes && git diff`
   - `cd /Users/jasonmchen/codex-巽風系統/xunfeng-v2-vercel-deploy && git diff`
2. 逐一 commit / push：
   - `feature/ecpay-idempotency`
   - `feature/audit-fixes`
   - `feature/vercel-deploy`
3. push `feature/vercel-deploy` 後，在 Vercel 補 Preview env，或確認 production env 是否足夠目前測試。
4. 下一個實作 worktree 建議做 `xunfeng-v2-ecpay-merchant-config`，先把 sandbox / production 商店設定、公開測試帳號與正式商店切換規則整理好，再進 `xunfeng-v2-ecpay-invoice`。

### 收工時長時間程序狀態（2026-05-21）

- 已停用：`xunfeng-v2-ecpay-idempotency` 的 Next dev server。
- 已確認：本機 port `3000` 沒有 listener。
- 仍存在：Vercel project `tjs-projects-435187fd/xunfeng-v2-vercel-deploy` 與 production deployment `https://xunfeng-v2-vercel-deploy.vercel.app`。
- 仍存在：Supabase Cloud project `pvasgmmjrodukudbzuhp`。

## 工作紀錄規則

當使用者說：

```text
今天先這樣
收工
先到這
今天到這邊
```

要更新本檔案，至少記錄：

- 當下時間。
- 已完成事項。
- 修改過的檔案。
- 測試/驗證結果。
- 尚未完成事項。
- 下一次建議起手式。
- 是否有 dev server 或其他長時間程序正在跑。

下一次重新開始本專案時，先讀：

1. `handoff.md`
2. `memory.md`
3. `git status --short`
4. 必要時再讀 README 與相關程式檔

## 收工時長時間程序狀態（2026-05-19）

- 已停用：ngrok tunnel（網址 `acclivous-tomi-prevailingly.ngrok-free.dev` 已失效）。
- 已停用：Next dev server。
- 仍存在：Supabase Cloud project `pvasgmmjrodukudbzuhp`（持續運作，無費用問題，免費方案）。

## 2026-05-24　v2/v3 nav 全站整併

### 起因

v3「易學決策報告」併入 v2 後，使用者觀察到 nav 不一致：
- 首頁 `/` nav 含「易學決策報告」與「會員方案」
- 點 `/services`、`/enterprise`、`/cases` 等 legacy 頁則消失
- 兩套系統實際只是「硬掛」，沒真正整併

### 根因

v2 採兩套渲染：

1. **Legacy HTML 直送**（13 個頁面）— `app/[[...slug]]/page.tsx` → `LegacyPage` 用
   `dangerouslySetInnerHTML` 塞 `legacy-pages/*.html`，每個 HTML 自帶獨立 header
2. **Next.js 原生頁面** — 如 `/member-ai/decision` 用 `components/SiteHeader.tsx`

13 個 legacy HTML 裡只有 3 個（index / member-ai / member-pricing）含
「易學決策報告」連結，其他 10 個還是 v3 整併前的舊 nav。

### 採取方案：C 全站轉 Next.js Server Component

分三階段完成，全部頁面收進 `app/(public)/` route group，
共用 `(public)/layout.tsx` 注入 SiteHeader / SiteFooter / FloatingActions /
cms-render.js，確保 nav 真·single source of truth。

#### Phase 0/1/2（commit 0dfca3c）

- 新建 `components/SiteFooter.tsx`、`components/FloatingActions.tsx`
- 新建 `app/(public)/layout.tsx`
- 遷移 15 個頁面：
  - 一般：about / services / enterprise / cases / courses / booking / ai /
    privacy / thanks / login
  - 會員：member / member-ai / member-admin / member-pricing
- 修 member 系列 client init race：
  - `public/js/member-ai.js`、`member-auth.js`、`member-pricing.js`
    export init 函數到 `window`
  - member / member-ai / member-pricing 頁改 `"use client"` + useEffect 動態
    依序載入 `member-config.js` 與業務 js 後手動呼叫 init，繞過 Next.js
    `<Script strategy="afterInteractive">` 與 vanilla DOMContentLoaded 的 race

#### Phase 3（commit 9eb681e）

- 新建 `app/(public)/page.tsx` 取代 legacy `index.html`
- 刪除 `app/[[...slug]]/`、`components/LegacyPage.tsx`、
  `lib/site/legacy-page.ts`
- `.gitignore` 加入 `tsconfig.tsbuildinfo`

### 修改過的檔案

新增：
- `app/(public)/layout.tsx`
- `app/(public)/page.tsx` 及 14 個 sub-route page
- `components/SiteFooter.tsx`、`components/FloatingActions.tsx`

修改：
- `public/js/member-ai.js`、`member-auth.js`、`member-pricing.js`
- `.gitignore`

刪除：
- `app/[[...slug]]/page.tsx`
- `components/LegacyPage.tsx`
- `lib/site/legacy-page.ts`

保留作 reference 但不再被讀取：
- `legacy-pages/`（整個資料夾）

### 驗證結果

- `npx tsc --noEmit` 通過
- preview 部署使用者驗證 `/services` `/about` `/courses` nav 含
  「易學決策報告」「會員方案」✅
- `/member-ai` 載入會員資料正常 ✅
- 首頁與其他頁面尚待 preview 上完整驗收

### 尚未完成

- preview 完整驗收（特別是首頁 brand-anchor、cms-render 動態填值
  服務卡片、cases / courses 輪播、booking 表單）
- preview OK 後 develop → main 合併，升 production
- 未來改 nav 只改 `components/SiteHeader.tsx`（single source of truth）

### 下一次建議起手式

1. 開 Vercel 看 develop 最新 preview deployment
2. 完整驗收 16 頁
3. 全 OK 則開 PR 合 develop → main
4. main merge 後驗 mvp4z.vercel.app production

### 收工時長時間程序狀態（2026-05-24）

- 已停用：本機 dev server（本次 session 未啟動）
- 仍存在：Supabase Cloud project `pvasgmmjrodukudbzuhp`
- Vercel：preview deployment 隨 develop push 自動建立

## 2026-05-24 晚｜nav 上 prod + atomicity 修復 + 發票串接設計

### 一、Nav 整併升 prod（PR #23）

- develop 上的 nav 整併（commits `0dfca3c` + `9eb681e` + handoff 更新 `7d5effe`）squash merge 進 main，commit `35946f2`
- Squash merge 後 Vercel git integration **沒自動觸發 production build**（等了 5+ 分鐘無動靜），最後用 `vercel --scope tjs-projects-435187fd deploy --prod --yes` 從本機推上 prod，deploy id `dpl_AjcATi9sPHZmjRqnPf1SHCTgPfUh`
- Smoke test 8 條全 200：`/`、`/member-pricing`、`/login`、`/member-ai`、`/member-ai/decision`、`/admin-login`、`/courses`、`/booking`
- 4 條抽查皆有「易學決策」nav link + SiteFooter + topbar
- develop reset 與 main 對齊

### 二、Council 扣點 atomicity bug 修復（PR #24）

#### 起因

2026-05-23 admin 點生成綜合報告 504 timeout，credits_remaining 已扣 10、但 credit_transactions 沒寫 debit row、council_runs 整列空、refund handler 沒跑（Vercel 強制 kill function 連同 `try/catch` 也殺）。當下手動補退 + adjustment log，但根本問題沒修。

#### 根因

`app/api/ai/council/route.ts` 原本流程：
1. DB UPDATE 扣 credits（optimistic lock）
2. 記憶體存 `reserved` 物件
3. 跑 7 次 LLM 呼叫（30~250s）
4. 寫 usage_logs + council_runs + credit_transactions
5. catch 觸發 refund

步驟 1 已落 DB，步驟 3 期間 Vercel kill function → 記憶體 + catch 一起被殺 → refund 永遠不執行 → credits 黑洞。

#### 採取方案：Charge on success（路線 A）

不預扣，LLM 成功才扣，搭配 Postgres function 把 debit + credit_transactions insert 綁進一個 transaction（含原本的 optimistic lock）。

評估過的另兩條（未採用）：
- 路線 B：reservation table + cron sweep（v2 升級時可考慮）
- 路線 C：背景 worker + queue + SSE（工程量太大）

#### 實作

新增 migration `supabase/migrations/0007_council_atomic_commit.sql`：

```sql
create or replace function public.commit_council_credit(
  p_user_id uuid,
  p_entitlement_id uuid,
  p_previous_credits integer,
  p_charge integer,
  p_ref_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_after integer;
  v_tx_id uuid;
begin
  if p_charge <= 0 then raise exception 'invalid charge amount' using errcode = 'CR000'; end if;
  v_balance_after := p_previous_credits - p_charge;
  if v_balance_after < 0 then raise exception 'insufficient credits' using errcode = 'CR001'; end if;

  update public.member_entitlements
  set credits_remaining = v_balance_after
  where id = p_entitlement_id and user_id = p_user_id and credits_remaining = p_previous_credits;
  if not found then raise exception 'credits state changed' using errcode = 'CR002'; end if;

  insert into public.credit_transactions (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
  values (p_user_id, p_entitlement_id, 'debit', -p_charge, v_balance_after, 'ai_council', p_ref_id)
  returning id into v_tx_id;

  return jsonb_build_object('tx_id', v_tx_id, 'balance_after', v_balance_after);
end;
$$;
```

`route.ts` 改寫流程：
1. 取得 entitlement，**驗證足額但不扣**
2. 跑 7 輪 LLM
3. 寫 `usage_logs`
4. RPC `commit_council_credit`（debit + tx 原子寫）
5. 寫 `council_runs`（含實際 `credits_charged`）
6. 回傳

失敗模式：
- LLM 失敗 / function kill：步驟 4 未執行 → 不扣到錢 ✅
- RPC race（CR002，極罕見）：報告已生成，送這份、`council_runs.credits_charged=0` + `console.warn` 記 log
- Fallback 報告：`plannedCharge=0`，不扣點、不消耗免額度

刪 `refundReservedCredit` dead code（charge-on-success 沒有 reserved 狀態）。

#### 部署順序與踩坑

- Migration 0007 透過 Supabase SQL Editor 手動執行（CLI `supabase link` DB 密碼 prompt 被吞掉，改貼 SQL）
- 確認 function 在線後才開 PR → merge → deploy
- 順序顛倒會炸（route.ts 呼叫不存在的 RPC）

**新踩坑：worktree 部署陷阱**
- 在 `xunfeng-v2-council-atomic` worktree 跑 `vercel deploy --prod --yes`，因為 worktree **沒繼承 `.vercel/project.json`**，被當成新專案建了個 `xunfeng-v2-council-atomic` Vercel project
- 修法：worktree 部署前先 `cp /主 worktree/.vercel/project.json .vercel/project.json`，或直接回主 worktree 操作
- 已用 `echo "y" | vercel project rm xunfeng-v2-council-atomic` 清掉誤建 project

**Vercel webhook 觀察更新：** PR #24 merge 後 webhook 這次有自動觸發（3m 內就 Ready）。看來時靈時不靈，先觀察。

#### 驗證

- 本機 `npm run build` 通過
- Supabase function 建立成功（"Success. No rows returned"）
- Production deploy `dpl_*-e4un4rh0w` 上線、aliased 到 `mvp4z.vercel.app`
- E2E 待你親手用 admin 帳號跑一份報告驗證扣點

### 三、ECPay 電子發票串接設計（commit `cc57ac5`，未 merge）

`feature/ecpay-invoice` worktree 從沉睡的 `37d4d81` rebase 到 develop。今天**只設計、不寫 code**，產出 `docs/ecpay-invoice-plan.md`（288 行）。

涵蓋：
- **環境**：沙箱用綠界公開測試 MerchantID `2000132`，正式之後申請
- **架構**：v1 走 sync inline 開票（在 notify 內呼叫 ECPay invoice issue API），失敗不阻擋付款流程、admin 可手動 retry
- **加密**：綠界發票 V3 用 AES-128-CBC + URL encode（跟金流 V5 的 CheckMacValue 完全不同）
- **DB schema**：migration 0008 加 `orders.invoice_request` jsonb + 新建 `invoices` 表（含買受人、載具、捐贈、狀態、原始 payload、retry 計數、作廢資訊）
- **API**：notify 內部加開票 + admin retry/void + member 查發票，共 6 個 endpoint
- **UX**：結帳前 modal 收買受人/載具/捐贈；member 加「我的發票」分頁；admin 加 `/admin/invoices`
- **階段**：切 4 階段（Phase 1: helper + admin manual / Phase 2: notify auto + 前端 modal / Phase 3: 載具+作廢+重試 / Phase 4: 換正式商店）

#### 6 條待決策（影響 v1 範圍，動 Phase 1 前要先有答案）

1. MVP 要不要做載具？個人無載具預設「捐贈」還是「雲端發票寄 email」？
2. 統編檢核要打財政部 API 還是信任使用者輸入？
3. 發票 email 由綠界代寄還是我們自寄？
4. 歷史測試訂單 `XF2026051913034555C9` 怎麼標？
5. 開票失敗要不要 admin 通知（email / Slack）？
6. 正式發票字軌誰申請、何時切換？

### 四、Repo / Worktree / Deploy 狀態（EOD）

- **main**：`e346663` Fix council credit atomicity
- **develop**：`e346663`（與 main 齊平）
- **feature/ecpay-invoice**：`cc57ac5`（已 push，未 merge，含設計文件）
- **production**：`mvp4z.vercel.app` 跑在 atomicity fix
- **Supabase prod**：migration 0007 已上線
- **已清理**：誤建的 `xunfeng-v2-council-atomic` Vercel project、council-atomic worktree

### 五、下一次建議起手式

1. 親手跑一份 council 驗證 atomicity 修正（admin 帳號 `306465@gmail.com` 目前 150 點 pro entitlement）
2. 對焦發票 plan 的 6 條待決策（影響 v1 範圍）
3. 動發票 Phase 1：
   - 新建 migration 0008（`orders.invoice_request` + `invoices` 表）
   - 新建 `lib/payments/ecpay-invoice.ts`（AES-128-CBC helper + issue/void/query）
   - 對沙箱 `2000132` 開一張測試發票驗證
   - 加 admin manual issue API + 最簡列表 UI
4. 或先處理其他待辦：SiteHeader 推 admin 區、課程報名訂單、未付款訂單清理 cron

### 收工時長時間程序狀態（2026-05-24 晚）

- 已停用：本機 dev server（本次 session 未啟動）
- 仍存在：Supabase Cloud project `pvasgmmjrodukudbzuhp`（migration 0007 已套用）
- Vercel：mvp4z production `dpl_*-e4un4rh0w` 跑在 atomicity fix
- 待開：`feature/ecpay-invoice` PR（Phase 1 寫完一起開）

## 2026-05-25 早｜清掉兩條無痛 PR：忘記密碼 + 訂單清理 cron

### 一、PR #32 忘記密碼/重設密碼流程

`feature/forgot-password` squash merge 進 main（commit `adc25e0`），Vercel webhook 自動觸發 prod build，34s Ready。

- `/login` 改 3 tab：登入 / 註冊 / 忘記密碼，加「忘記密碼？」連結
- `POST /api/auth/forgot-password`：呼叫 supabase admin `resetPasswordForEmail`，永遠回 200 防 user enumeration
- `/reset-password`：PKCE flow `exchangeCodeForSession(code)` → `updateUser({password})` → 跳 `/login?reset=1`
- `/login?reset=1` 顯示「密碼已更新」banner
- `member-auth.js` 加 `forgotPasswordMember` + window export

**Supabase Auth 設定已透過 Management API 同步調整：**
- `site_url = https://mvp4z.vercel.app`
- `uri_allow_list` 加 `/reset-password` 與 localhost
- `password_min_length = 8`（對齊前端 zod）

**已知限制：** SMTP 走 Supabase 預設（3 封/小時），正式營運前需接 custom SMTP（Resend）。

**Smoke test：** `/login` 200、`/reset-password` 200。E2E（送信、收信、改密碼、再登入）待手動驗。

### 二、PR #33 未付款訂單自動清理 cron

`feature/orders-cleanup-cron` squash merge 進 main（commit `0c57e80`），webhook 觸發 prod build，32s Ready。

- 新增 `GET /api/cron/cleanup-pending-orders`，每小時整點 `0 * * * *` 觸發
- 規則：`status='pending'` 且 `created_at < now - 24h` → 標 `cancelled`
- 單次上限 500 筆、`UPDATE WHERE status='pending'` 防競態
- 每次寫 `admin_audit_logs`（`action=orders_auto_cancel`，metadata 含 `cleaned_count` + 抽樣 5 筆）
- 支援 `?dry_run=1` 手動驗證
- `vercel.json` 加 crons entry
- 文件：`docs/orders-cleanup-cron.md`

#### 部署後 secret 設定

`CRON_SECRET` 已生成並透過 `vercel env add CRON_SECRET production --scope tjs-projects-435187fd` 設好。Preview 環境沒設（CLI 跳互動式 prompt 沒過，可之後補）。

設完 prod env 後做了 `vercel redeploy <prod-url> --target production`，新 deployment `mvp4z-cxx2yce73` 上線、aliased 到 `mvp4z.vercel.app`，cron route 從 500 變 200。

#### Dry-run 驗證

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://mvp4z.vercel.app/api/cron/cleanup-pending-orders?dry_run=1"
```

回應確認 4 筆 sandbox 殘留候選（全是 5/19 sandbox 測試「點購買 → 跳綠界 → 模擬付款不發 webhook」典型 pattern）：

| order_no | created_at | amount |
| --- | --- | --- |
| `XF202605191223340925` | 2026-05-19 04:23 UTC | 980 |
| `XF20260519123324AD8F` | 2026-05-19 04:33 UTC | 1980 |
| `XF202605191237072F2E` | 2026-05-19 04:37 UTC | 1980 |
| `XF20260519130035B78C` | 2026-05-19 05:00 UTC | 1980 |

確認系統尚未開放真實用戶 → 4 筆全為 sandbox 殘留 → 不手動清，交給 cron 在 2026-05-25 10:00 (UTC 02:00) 首次整點觸發自動處理。

### 三、Worktree / Branch 清理

已移除：
- `xunfeng-v2-forgot-password` worktree + local + remote branch
- `xunfeng-v2-orders-cleanup` worktree + local + remote branch

### 四、剩下未 merge 的 5 條 feature branch（手感越來越冷的順序）

| Worktree | 狀態 |
| --- | --- |
| `xunfeng-official-v2`（`fix/header-member-state`）| header 會員態 UI 一致性 fix，commit `08b3a4b` 已 push 未 merge |
| `xunfeng-v2-ecpay-merchant-config` | ECPay env 集中設定 + 切換 SOP，commit `076b21f` 已 push 未 merge |
| `xunfeng-v2-ai-chat-e2e` | AI chat charge-on-success atomicity + E2E 測試，commit `bc3db76` 已 push 未 merge |
| `xunfeng-v2-ecpay-invoice` | 發票 Phase 1（schema + helper + admin manual issue），commit `87af793` 已 push 未 merge |
| `xunfeng-v2-ecpay-invoice-phase2` | 發票 Phase 2（notify 自動開票 + 結帳 modal），commit `0e83872` 已 push 未 merge；卡在 6 條 v1 範圍決策 |

### 五、下一次建議起手式

1. 驗 cron：10:00 觸發後查 `admin_audit_logs` 看 `orders_auto_cancel` 那條 metadata，4 筆 candidate 是否如預期變 cancelled
2. 補 `CRON_SECRET` 到 preview 環境（互動式跑：`vercel env add CRON_SECRET preview`）
3. 動下一條無痛的：`feature/ecpay-merchant-config`（ECPay env 集中設定，純內部設定 + 切換 SOP，沒外部依賴）
4. 或對焦發票 Phase 2 的 6 條 v1 決策（卡最久、影響最大）

### 收工時長時間程序狀態（2026-05-25 早）

- 已停用：本機 dev server（本次 session 未啟動）
- 仍存在：Supabase Cloud project `pvasgmmjrodukudbzuhp`
- Vercel：mvp4z production `dpl_*-cxx2yce73` 跑在 forgot-password + cron + 新 CRON_SECRET
- 已上線 cron：`/api/cron/cleanup-pending-orders` 每小時整點觸發
- 待補：`CRON_SECRET` preview 環境變數

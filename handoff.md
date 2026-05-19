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
- **return endpoint redirect URL bug**：付款成功瀏覽器被導去 `https://localhost:3000/member?payment=paid&order=...`。「https + localhost」不通，正式部署前要修 `app/api/payments/ecpay/return/route.ts` 的 redirect 邏輯（應依 `request.url` 的 host 或 `NEXT_PUBLIC_SITE_URL` 組對應 protocol）。
- **idempotency 沒測**：migration 0003 加了 `(provider, merchant_trade_no)` 與 `(provider, provider_trade_no)` 的 unique index，理論上重複 webhook 會被擋，但沒實際重送驗證。

## 尚未完成

- 綠界 webhook idempotency 重送測試。
- 修 `/api/payments/ecpay/return` 的 redirect URL bug。
- AI chat 流程（缺 OpenAI API key）。
- Vercel 部署設定（新 GitHub repo 已存在 `JasonM568/mvp4z-`，但 Vercel project 還沒建）。
- `npm install` 顯示的 `2 moderate severity vulnerabilities` 尚未處理。
- `.env.local` 的 URL 還停在 ngrok（已停用），下次續工前要先改回 `http://localhost:3000` 或新的 ngrok 網址。

## 下次建議先做

1. 修 `.env.local` 的 URL（`NEXT_PUBLIC_SITE_URL`、`ECPAY_*_URL`）改回 `http://localhost:3000`，或重新開 ngrok 後改成新網址。
2. 修 `app/api/payments/ecpay/return/route.ts` 的 redirect 邏輯（避免硬寫 https + localhost）。
3. 重送一次 webhook 驗 idempotency（可用上次測試的 `2605191303547152` provider_trade_no 直接 POST 自己組的 payload）。
4. 取得 OpenAI API key 後測 `/api/ai/chat`：扣點、`usage_logs`、點數不足情境。
5. Vercel 專案建立 + 環境變數設定 + 第一次 preview deploy（注意 ngrok 不能當正式 webhook URL，要改成 Vercel preview domain）。
6. 處理 npm audit 漏洞。

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

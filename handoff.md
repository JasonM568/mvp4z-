# Handoff

更新時間：2026-05-18 Asia/Taipei

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
- 已建立第一個 commit：

```text
e1e715e Initialize Next.js v2 scaffold
```

## 本機服務

目前曾啟動過：

```text
http://localhost:3000
```

使用者當前 in-app browser 位於：

```text
http://localhost:3000/services
```

如果下次 server 沒有在跑，從專案根目錄執行：

```bash
npm run dev
```

## 驗證紀錄

已通過：

```bash
npm run build
```

並確認 localhost 回應 `HTTP/1.1 200 OK`。

注意：`npm install` 後顯示 `2 moderate severity vulnerabilities`。正式部署前要再處理。

## 尚未完成

部分 API route 仍是 `501` 佔位，還沒有真正接商業邏輯。

待實作：

- 管理員權限判斷。
- 管理後台：會員、訂單、補點、啟用碼、audit logs。
- Vercel 部署設定。
- Supabase project 實際建立與 migration 套用。

## 下次建議先做

下一步建議優先做管理員後台，因為 Auth、綠界訂單與 AI 問答骨架已經先接上。

建議順序：

1. 到 `/Users/jasonmchen/codex-巽風系統/xunfeng-v2-admin`。
2. 先 merge `develop`，取得 Auth 與綠界最新基底。
3. 實作 admin role 檢查。
4. 實作 `/api/admin/members`、`/api/admin/orders`。
5. 實作 `/api/admin/create-code`。
6. 實作 `/api/admin/credits` 與 `admin_audit_logs`。

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

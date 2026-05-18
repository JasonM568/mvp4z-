# Handoff

更新時間：2026-05-18 Asia/Taipei

## 目前狀態

這是巽風官方網站 V2 的本機新專案，目標是把舊版 Cloudflare Pages + Worker + D1 架構，改成 Next.js + Supabase + 綠界金流 + OpenAI + Vercel。

目前採用「本機先完成，不設定 GitHub remote」策略。舊 repo 只作為素材與內容來源。

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

目前 API route 都只是 `501` 佔位，還沒有真正接商業邏輯。

待實作：

- Supabase Auth 註冊 / 登入 / 登出。
- 使用者 profile 建立與 session server-side 驗證。
- 會員中心資料讀取。
- 方案與訂單建立。
- 綠界付款參數產生。
- 綠界 `CheckMacValue` 驗證。
- 綠界付款通知 webhook idempotency。
- 付款成功後建立會員權益與額度紀錄。
- AI chat API。
- AI 問答前檢查會員權益與剩餘額度。
- AI 問答後扣點、寫入 `usage_logs` 與 `credit_transactions`。
- 管理員權限判斷。
- 管理後台：會員、訂單、補點、啟用碼、audit logs。
- Vercel 部署設定。
- Supabase project 實際建立與 migration 套用。
- 新 GitHub repo remote 設定與 push。

## 下次建議先做

下一步建議優先做 Supabase Auth 與 server auth helpers，因為後續綠界訂單、會員中心、AI 扣點都依賴登入會員身份。

建議順序：

1. 建立 Supabase 專案與環境變數。
2. 套用 `supabase/migrations` 與 `seed.sql`。
3. 實作 `lib/supabase/server.ts`。
4. 實作 `/api/auth/register`、`/api/auth/login`、`/api/auth/logout`。
5. 改寫舊會員登入頁 JS 或改成 Next.js client component。
6. 實作 `/api/member/me`。

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

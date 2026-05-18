# 巽風官方網站 V2

Next.js + Supabase + 綠界金流版本骨架。

這個 repo 目前把舊版 Cloudflare Pages 靜態網站作為視覺與內容來源，先完成可遷移的 Next.js 基底。舊頁面放在 `legacy-pages/`，由 `app/[[...slug]]/page.tsx` 轉接成新路由，圖片、JS、公開 JSON 內容放在 `public/`。

## 技術棧

- Next.js App Router
- TypeScript
- Supabase Auth / PostgreSQL / RLS
- 綠界金流
- OpenAI Responses API
- Vercel 部署

## 主要路由

- `/`
- `/about`
- `/services`
- `/enterprise`
- `/cases`
- `/courses`
- `/booking`
- `/member-pricing`
- `/login`
- `/member`
- `/member-ai`
- `/member-admin`

## API

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

Supabase Auth 已先接上：

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/member/me`
- `/api/member/redeem`
- `/api/member/usage`

為了相容舊版前端 JS，也保留 Worker 版路徑：

- `/api/register`
- `/api/login`
- `/api/logout`
- `/api/me`
- `/api/redeem`

其餘 API 仍是 `501` 佔位，後續逐步接綠界、OpenAI 與管理後台。

綠界金流已先接上：

- `/api/orders/create`
- `/api/payments/ecpay/notify`
- `/api/payments/ecpay/return`

`/api/orders/create` 會建立 pending order，並回傳綠界 AioCheckOut V5 表單送出所需的 action URL 與 params。`notify` 會驗證 `CheckMacValue`，付款成功後更新 order、建立會員權益與點數交易紀錄。

## 本機開發

```bash
npm install
npm run dev
```

## 環境變數

複製 `.env.example` 成 `.env.local`，填入 Supabase、OpenAI、綠界設定。

## Supabase

SQL migration 放在：

```text
supabase/migrations/
```

初始方案 seed：

```text
supabase/seed.sql
```

付款防重複索引：

```text
supabase/migrations/0003_payment_idempotency.sql
```

## GitHub

新版 repo：

```text
https://github.com/JasonM568/mvp4z-.git
```

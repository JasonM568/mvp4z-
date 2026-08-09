# 巽風官方網站 V2

正式商用系統，非骨架專案。整合官網內容、會員訂閱、點數經濟、AI 易學決策、課程銷售、顧問預約、金流發票與營運後台。

- 正式站：`https://www.xunfeng.tw`（fallback `mvp4z.vercel.app`）
- Repo：`JasonM568/mvp4z-`

## 文件導覽

| 文件 | 內容 |
| --- | --- |
| `CLAUDE.md` | 開工流程、點數規則、方案表、核心架構原則 |
| `docs/SYSTEM_ARCHITECTURE.md` | 完整系統與功能模組架構書 |
| `handoff.md` | 最新進度與待辦（單一交接來源） |
| `worklog.md` | 依日期累積的工作紀錄 |
| `memory.md` | 長期架構決策與不可忘的約束 |

功能異動時以 `docs/SYSTEM_ARCHITECTURE.md` 為架構基準，並同步更新本檔。

## 技術棧

- Next.js 15 App Router、React 19、TypeScript、Tailwind CSS
- Supabase Auth / PostgreSQL / Row Level Security
- OpenAI、Gemini、DeepSeek（易學決策 AI Council）
- 綠界 ECPay 金流
- ezPay 電子發票
- Vercel 部署

## 公開路由

`/`、`/about`、`/services`、`/enterprise`、`/cases`、`/courses`、`/booking`、`/member-pricing`、`/privacy`、`/thanks`

會員：`/login`、`/reset-password`、`/member`、`/member-ai`、`/member-ai/decision`、`/member-admin`

後台：`/admin`、`/admin/members`、`/admin/bookings`、`/admin/orders`、`/admin/invoices`、`/admin/council-runs`、`/admin/token-usage`

## API

身分與會員：

- `/api/auth/register`、`/api/auth/login`、`/api/auth/logout`、`/api/auth/forgot-password`
- `/api/member/me`、`/api/member/redeem`、`/api/member/usage`
- `/api/plans`

AI：

- `/api/ai/chat`：會員問答，OpenAI 單模型
- `/api/ai/council`：易學決策報告，OpenAI + Gemini + DeepSeek 三模型 Council

預約與課程：

- `/api/bookings`、`/api/courses/checkout`

金流與發票：

- `/api/orders/create`
- `/api/payments/ecpay/notify`、`/api/payments/ecpay/return`
- `/api/admin/invoices`、`/api/admin/invoices/[orderId]/issue`
- `/api/cron/cleanup-pending-orders`

管理後台：

- `/api/admin/members`、`/api/admin/orders`、`/api/admin/bookings`、`/api/admin/bookings/[id]`
- `/api/admin/credits`、`/api/admin/create-code`
- `/api/admin/council-runs`、`/api/admin/token-usage`

### 舊 Worker 相容層

`/api/register`、`/api/login`、`/api/logout`、`/api/me`、`/api/redeem`、`/api/chat` 是舊 Cloudflare Worker 路徑的 re-export。

2026-08-09 起站內前端已全面改呼叫正規路徑，這六條僅為使用者瀏覽器可能快取的舊版 JS 保留。確認正式站無流量後可整組移除。

## 點數規則

以程式碼為準，不以本檔為準：

| 項目 | 規則 | 來源 |
| --- | --- | --- |
| 易學決策報告 | 固定 20 點 / 份 | `lib/auth/tier.ts` |
| AI 會員問答 | 回覆中文字每 1,000 字 1 點，最少 1 點 | `lib/ai/member-chat.ts` |
| 註冊免費體驗 | 30 點 / 30 天 | `lib/auth/member.ts` |

扣點採 charge-on-success 原子扣點（council RPC `0007`、chat RPC `0010`），LLM 成功才扣。兩者啟動前都必須先顯示扣點說明並取得使用者同意。

## 內容來源

公開頁面的服務、案例、課程、照片內容由 `public/js/cms-render.js` 在 client 端讀取 `public/content/*.json` 後填入 React 頁面的 `#cms*` 錨點。

**`public/content/` 是唯一會被瀏覽器讀到的來源。** 根目錄 `content/` 是同內容的鏡像副本，沒有任何程式或 build 步驟會讀取它；兩者必須手動保持一致，否則只改 `content/` 的異動不會上線（歷史上 commit `f2c636d` 就因此從未生效）。後續建議直接淘汰根目錄 `content/`。

`legacy-pages/` 是舊 Cloudflare 靜態頁，已無任何程式讀取，僅作視覺與文案參考。

## 本機開發

```bash
npm install
npm run dev
```

複製 `.env.example` 成 `.env.local`，填入 Supabase、OpenAI、Gemini、DeepSeek、綠界與 ezPay 設定。

## 測試與環境檢查

```bash
npm run build
npm run check:ecpay-env
npm run check:ezpay-env
npm run test:ecpay-idempotency
npm run test:ecpay-atm-allocation
npm run test:ezpay-invoice-e2e
npm run test:ai-chat-e2e
node scripts/test-council-structured.mjs
```

## Supabase

Migration 放在 `supabase/migrations/`（目前到 `0014_council_structured.sql`），初始方案 seed 在 `supabase/seed.sql`。

方案與點數定義在 `0013_point_economy_2026.sql`，為純 update 可重複執行。

## 正式營運前未完成項目

以 `handoff.md` 最新章節為準，目前已知：

- 易學決策 Council 待補齊 OpenAI / Gemini / DeepSeek 正式 key
- 信用卡真實刷卡 E2E 尚未補測（ECPay 已切正式 MID）
- ezPay 發票目前仍走 stage 環境，未切正式
- Supabase Auth custom SMTP（Resend）未接，忘記密碼受預設 3 封／小時限制

# 巽風官方網站 V2 — 專案指引

正式商用系統：Next.js + Supabase + 綠界(ECPay)金流 + EZPay 發票 + OpenAI + Vercel。
正式線 `https://www.xunfeng.tw`（fallback `mvp4z.vercel.app`）。Repo：`JasonM568/mvp4z-`。

## 開工流程（每次重開本專案，務必依序讀）

1. `handoff.md` — 最新進度與待辦（單一交接來源）
2. `memory.md` — 長期架構決策與不可忘的約束
3. `git status --short --branch` + `git log --oneline -5` — 對齊實際 code 狀態
4. 必要時再讀 `README.md` 與相關程式檔

> ⚠️ handoff.md 可能落後實際 commit。若 git log 比 handoff 新，以 **code / migration 為準**。

收工（使用者說「收工 / 今天先這樣 / 先到這」）要更新 `handoff.md`：當下時間、已完成、改過的檔、驗證結果、未完成、下次起手式、是否有長時間程序在跑。

## 點數規則（single source of truth = 程式碼，非本檔；改價要 commit）

| 項目 | 規則 | 來源 |
|------|------|------|
| 易學決策報告（council） | **固定 20 點/次**（舊 env 的 10 已廢棄） | `lib/auth/tier.ts:18` |
| AI 對話（偽 GPT 聊天） | AI 回覆**中文字**每 1000 字 1 點，最少 1 點 | `lib/ai/member-chat.ts:21` |
| 註冊免費體驗 | **30 點 / 30 天**（寫死常數，與 plans 表解耦） | `lib/auth/member.ts:155` |
| 扣點機制 | charge-on-success 原子扣點（council RPC `0007` / chat RPC `0010`）；**LLM 成功才扣**，function 被 kill 不會扣到錢 | — |
| **啟動前同意** | council 報告 / AI 聊天**啟動前必須秀出扣點說明**，使用者勾選「已閱讀並同意」才能執行 | commit `2f92f1e` |

## 會員方案（migration `0013_point_economy_2026.sql`，2026-06-01 版）

點數 = **報告點**（可生報告數 × 20）**＋ 額外聊天點**（給偽 GPT 聊天用）：

| code | 名稱 | 價格 | 報告點(約N份報告) | + 額外聊天點 | = 總點數 | 效期 |
|------|------|------|------|------|------|------|
| trial | 免費體驗 | 0 | 30（體驗用，不分拆） | — | 30 | 30 天 |
| basic | 基礎會員 | NT$980 | 100（約 5 份） | 6 | **106** | 30 天 |
| pro | 進階會員 | NT$1,980 | 206（約 10 份） | 12 | **218** | 30 天 |
| vip | VIP 會員 | NT$4,980 | 516（約 26 份） | 18 | **534** | 30 天 |

> 拆解只是設計意圖（報告 vs 聊天的分配），**DB 與扣點不分桶**：總點數是同一個 `credits_remaining`，報告扣 20、聊天按字數扣，先扣先用。

- 改方案點數/價格 → 改 `0013` migration 並重跑（純 update，可重複執行）。
- trial 的 30 點以程式常數 `TRIAL_CREDITS` 為準，plans 表的 trial.credits 只為後台顯示一致。
- 綠界結帳商品名前綴「巽風系統」，例：`巽風系統 - 進階會員 - 1980元`（`app/api/orders/create`）。

## 核心架構原則（節錄自 memory.md）

- 全站 nav 單一來源：`components/SiteHeader.tsx`；新頁面放 `app/(public)/`，由 `(public)/layout.tsx` 注入 header/footer/floating。`legacy-pages/` 僅參考不再讀取。
- 前端只顯示狀態，**不決定付款 / 開通 / 權限 / 扣點**；金額、方案、訂單狀態一律後端 + DB 比對。
- 付款由綠界 webhook 驗 `CheckMacValue` 後決定，且必須 idempotent（不可重複開通）。
- Supabase `service_role` 只能 server-side；RLS 必須啟用；admin 權限 server-side 檢查 `profiles.role='admin'`。
- 敏感 key 一律進環境變數，不進 Git。

## 待解（開放真實用戶 / 正式收款前的 gate）

- council 多 provider 待補 **OpenAI / Gemini / DeepSeek key**。
- **信用卡真實刷卡 E2E 尚未補測**（ECPay 已切正式 MID `3325455`）。
- **發票走 EZPay 不是 ECPay**，`ezpay-invoice.ts` adapter 尚未改寫，目前仍沙箱。
- Supabase Auth custom SMTP（Resend）未接；忘記密碼受預設 3 封/小時限制。
- 詳見 `handoff.md` 最新「待辦 / 下次起手式」。

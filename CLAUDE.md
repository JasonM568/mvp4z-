# 巽風官方網站 V2 — 專案指引

正式商用系統：Next.js + Supabase + 綠界(ECPay)金流 + EZPay 發票 + OpenAI + Vercel。
正式線 `https://www.xunfeng.tw`（fallback `mvp4z.vercel.app`）。Repo：`JasonM568/mvp4z-`。

## 開工流程（使用者說「開工」或每次重開本專案，務必依序讀）

1. `handoff.md` — 最新進度與待辦（單一交接來源）
2. `worklog.md` — 依日期累積的實際工作紀錄
3. `memory.md` — 長期架構決策與不可忘的約束
4. `git status --short --branch` + `git log --oneline -5` — 對齊實際 code 狀態
5. 必要時再讀 `README.md` 與相關程式檔

> ⚠️ handoff.md 可能落後實際 commit。若 git log 比 handoff 新，以 **code / migration 為準**。

收工（使用者說「收工 / 今天先這樣 / 先到這」）必須同時更新：

- `handoff.md`：最新狀態、已完成、改過的檔、驗證結果、未完成、待辦優先順序、下次起手式、Git 狀態、是否有長時間程序在跑。此檔只維持「下一次接手所需的最新摘要」。
- `worklog.md`：以日期追加本次工作內容、重要判斷、產出檔案、驗證結果與遺留事項，不覆蓋歷史紀錄。

使用者說「開工」時，先讀完 `handoff.md` 與 `worklog.md` 的最新紀錄，再依上述順序核對 code 與 Git；不要只依聊天記憶開始工作。

## 點數規則（single source of truth = 程式碼，非本檔；改價要 commit）

| 項目 | 規則 | 來源 |
|------|------|------|
| 易學決策報告（council） | **固定 20 點/次**（舊 env 的 10 已廢棄） | `lib/auth/tier.ts:18` |
| AI 對話（AI 即時問答，內部代號「偽 GPT」，**不得出現在前台**） | AI 回覆**中文字**每 1000 字 1 點，最少 1 點 | `lib/ai/member-chat.ts:21` |
| 註冊免費體驗 | **30 點 / 30 天**（寫死常數，與 plans 表解耦） | `lib/auth/member.ts:172` |
| 註冊贈點防刷 | **同一支手機只發一次**。認領表 `trial_phone_claims` 以正規化手機為 PK，發放走 `grant_signup_trial` RPC（認領＋建 entitlement＋寫交易同一 transaction）。註冊**不擋**、只是不發點；要重新放行就刪認領表那一列 | `supabase/migrations/20260905100000_trial_phone_claims.sql` |
| 扣點機制 | charge-on-success 原子扣點（council RPC `0007` / chat RPC `0010`）；**LLM 成功才扣**，function 被 kill 不會扣到錢 | — |
| **啟動前同意** | council 報告 / AI 聊天**啟動前必須秀出扣點說明**，使用者勾選「已閱讀並同意」才能執行 | commit `2f92f1e` |

## 會員方案（migration `0013_point_economy_2026.sql`，2026-06-01 版）

點數 = **報告點**（可生報告數 × 20）**＋ 額外聊天點**（給 AI 即時問答用）：

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
- **發票走 EZPay 不是 ECPay**。adapter 其實已改寫完成（`issue-invoice-from-order.ts:12` 已 import `./ezpay-invoice`），
  但 `.env.example:55` 仍列舊的 `ECPAY_INVOICE_*`，實際讀的是 `EZPAY_INVOICE_*` —— 環境設定要對齊。
  另：只有 `issueInvoice()`，**沒有作廢／折讓**，做退款前要先補。
- Supabase Auth custom SMTP（Resend）未接；忘記密碼受預設 3 封/小時限制。
- 詳見 `handoff.md` 最新「待辦 / 下次起手式」。

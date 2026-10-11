# API 與頁面驗收缺口清單（自動盤點）

產生基準：本機 commit `27c652f`；88 個 API route 檔、50 個頁面檔。執行 `node scripts/qa-route-inventory.mjs` 重建。
本表的「部分已驗」只指欄中列出的情境；其餘正常、異常、空狀態、邊界、超長與並發仍以 [全系統 Test Matrix](full-system-acceptance-2026-10-11.md) 逐項追蹤。`待驗` 是明確未有執行證據，不能推定通過。動態參數路由以模板名稱表示。

## API routes

| 路由 | 方法 | QA 狀態／已驗範圍 |
|---|---|---|
| `/api/admin/bookings` | GET | 隔離通過：具名管理員列表與 limit 邊界 M6 11/11；正式待驗 |
| `/api/admin/bookings/[id]` | GET, PATCH | 隔離通過：具名管理員 GET／PATCH＋audit；更多邊界待驗 |
| `/api/admin/council-runs` | DELETE, GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/course-product` | GET, PATCH | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/course-registrations` | GET | 隔離通過 M7/M11：非法 limit 400、完整摘要與 DB 一致，跟進流程 17/17；正式站待驗 |
| `/api/admin/course-registrations/[id]` | PATCH | 隔離通過：具名管理員跟進 PATCH、時間戳與 audit；非法／超長拒絕 |
| `/api/admin/create-code` | POST | 隔離通過：具名管理員建立、非法／邊界、N=10 唯一碼與 audit 13/13；正式待驗 |
| `/api/admin/credits` | POST | 不合格 C2：餘額與帳本不一致 |
| `/api/admin/documents` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/documents/[id]` | DELETE, PATCH | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/effective-settings` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/email-domain` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-analysis` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-analysis/[id]` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-analysis/[id]/preview` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-knowledge` | GET, POST | 部分已驗：具名管理員建立／查詢與非法輸入通過；C6 並發隔離回歸通過 |
| `/api/admin/face-knowledge/[id]` | DELETE, PATCH | 部分已驗 C6：單／雙管理員 N=10 各 11 輪隔離通過；正式站待驗 |
| `/api/admin/face-knowledge/[id]/revisions` | GET | 部分已驗 C6：隔離並發快照一致；正式站待驗 |
| `/api/admin/face-knowledge/bulk` | POST | 隔離通過 C6：具名送審／發布／封存各唯一版本、revision、audit；共用 key 403，正式待驗 |
| `/api/admin/face-knowledge/export` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-knowledge/import` | POST | 部分已驗 C6：新卡／upsert 版本與 audit 正確；M14 同批重複 card_id 回 500，正式待驗 |
| `/api/admin/face-provider-approval` | DELETE, GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-review-questions` | GET, PATCH | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-rules` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-rules/publish` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-teachings` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-teachings/[id]` | DELETE, PATCH | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-teachings/import-builtin` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/gemini-provider-approval` | DELETE, GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/invoices` | GET | 部分已驗：具名管理員 pending 發票列表與訂單連結；開票／退款待驗 |
| `/api/admin/invoices/[orderId]/issue` | POST | 部分已驗 C8：隔離 paid 訂單非法 body 7/7；合法 ezPay 開票／正式站待驗 |
| `/api/admin/members` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/orders` | GET | 不合格 M10：管理員清單／詳情與發票對帳通過，三種非法 id 回 500 |
| `/api/admin/orders/[id]/refund` | GET, POST | 部分已驗 C10：新 SQL 隔離 DB 直退／拆退／並發與短缺複驗通過；管理員真 API、正式站與發票處理待驗 |
| `/api/admin/prompt-settings` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/prompt-settings/publish` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/provider-health` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/provider-health/test-alert` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/qimen-review` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/qimen-review/preview` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/qimen-review/signoff` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/referrals` | GET, PATCH, POST | 部分已驗 C7：隔離建立／並發改率 audit 11 輪通過；正式站及 C5 歸因規則待驗 |
| `/api/admin/school-settings` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/school-settings/preview` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/school-settings/publish` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/site-content` | DELETE, GET, PATCH, POST | 不合格 M13：is_published 字串 false 在 POST/PATCH 被當 true、意外上架；其餘 CMS 管理流程待驗 |
| `/api/admin/site-content/media` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/site-content/media/sign` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/token-usage` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/ai/chat` | POST | 不合格 B1：並發免費答案 |
| `/api/ai/council` | POST | 既有正式證據：並發／日限額；瀏覽器找回待驗 |
| `/api/auth/forgot-password` | POST | 部分已驗：帳號不洩漏；重設信待驗 |
| `/api/auth/login` | POST | 部分已驗：正確／錯密碼 |
| `/api/auth/logout` | POST | 不合格 C12：登出回 200 後原 refresh token 仍可換新 access；隔離 3/4 |
| `/api/auth/refresh` | POST | 部分已驗：有效／無效 refresh |
| `/api/auth/register` | POST | 部分已驗：註冊／同手機並發；郵件待驗 |
| `/api/bookings` | POST | 部分已驗：欄位邊界；M1／M3 待規則 |
| `/api/chat` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/courses/checkout` | GET, POST | 部分已驗：驗證與後端定價；M5 雙送待規則 |
| `/api/cron/cleanup-face-images` | GET, POST | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/cron/cleanup-pending-orders` | GET | 隔離通過：密鑰拒絕、dry-run、舊 pending 清理及新 pending／paid 保留；正式排程待驗 |
| `/api/cron/expire-entitlements` | GET | 隔離通過 C11：dry-run、過期狀態與點數保留、audit／重跑 13/13；正式排程待驗 |
| `/api/cron/pending-drafts` | GET, POST | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/cron/provider-health` | GET | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/face-analysis/runs` | GET, POST | 部分已驗：A/B 歷史列表；C9 僅在已套回退 migration 的隔離庫建立綁新 VIP 權益；provider 待驗 |
| `/api/face-analysis/runs/[id]` | DELETE, GET | 部分已驗：A/B 詳情與越權 DELETE；本人刪除待驗 |
| `/api/face-analysis/runs/[id]/analyze` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/face-analysis/runs/[id]/image` | DELETE | 部分已驗：越權 DELETE 404；本人照片待驗 |
| `/api/face-analysis/runs/[id]/pdf` | GET | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/face-analysis/runs/[id]/preview` | GET | 部分已驗：越權 404；有效照片待驗 |
| `/api/face-analysis/runs/[id]/upload` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/login` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/logout` | POST | 不合格 C12：舊路由轉接無撤銷的 /api/auth/logout |
| `/api/me` | GET | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/member/council-runs` | GET | 隔離通過：A/B 列表所有權 |
| `/api/member/council-runs/[id]` | GET | 隔離通過：A/B 詳情所有權 |
| `/api/member/me` | GET | C9 條件通過：已套現回退 migration 的隔離庫 VIP/20；現行 fresh DB 加購仍不合格 |
| `/api/member/orders` | GET | 隔離通過：A/B 訂單所有權、付款開通輪詢與 SQLi 形狀查詢 11/11 |
| `/api/member/redeem` | POST | 隔離通過：N=10 原子兌換／rollback；正式待驗 |
| `/api/member/usage` | GET | 隔離通過：A/B 使用量 API 所有權與匿名／壞 token 拒絕 |
| `/api/orders/create` | POST | 部分已驗：M4 邊界及內部方案 code／ID 拒絕 9/9、推廣歸因；M5／C5 待規則 |
| `/api/payments/ecpay/notify` | POST | 隔離通過：C4 四情境×20 輪；正式待驗 |
| `/api/payments/ecpay/return` | GET, POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/plans` | GET | 部分已驗：公開 GET 200 與 plans 結構（安全冒煙 21/21）；內部方案顯示／排序待驗 |
| `/api/redeem` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/referral/lookup` | GET | 隔離通過：公開查碼 8/8；註冊歸因待驗 |
| `/api/register` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/site-content` | GET | 不合格 M12：DB 全部下架服務後仍回靜態 JSON 9 筆；故障備援待驗 |

## 頁面 routes

| 路由 | QA 狀態／已驗範圍 |
|---|---|
| `/` | 部分已驗：桌面／手機截圖；內容與互動待驗 |
| `/about` | 待驗：未有本輪頁面互動證據 |
| `/admin` | 待驗：未有本輪頁面互動證據 |
| `/admin-login` | 待驗：未有本輪頁面互動證據 |
| `/admin/bookings` | 待驗：未有本輪頁面互動證據 |
| `/admin/bookings/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/council-runs` | 待驗：未有本輪頁面互動證據 |
| `/admin/council-runs/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/course-launch` | 待驗：未有本輪頁面互動證據 |
| `/admin/course-registrations` | 待驗：未有本輪頁面互動證據 |
| `/admin/documents` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-analysis` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-analysis/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-knowledge` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-provider` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-rules` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-teachings` | 待驗：未有本輪頁面互動證據 |
| `/admin/gemini-provider` | 待驗：未有本輪頁面互動證據 |
| `/admin/invoices` | 待驗：未有本輪頁面互動證據 |
| `/admin/members` | 待驗：未有本輪頁面互動證據 |
| `/admin/orders` | 待驗：未有本輪頁面互動證據 |
| `/admin/orders/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/prompt-settings` | 待驗：未有本輪頁面互動證據 |
| `/admin/provider-health` | 待驗：未有本輪頁面互動證據 |
| `/admin/qimen-review` | 待驗：未有本輪頁面互動證據 |
| `/admin/referrals` | 待驗：未有本輪頁面互動證據 |
| `/admin/school-settings` | 待驗：未有本輪頁面互動證據 |
| `/admin/site-cases` | 待驗：未有本輪頁面互動證據 |
| `/admin/site-services` | 待驗：未有本輪頁面互動證據 |
| `/admin/token-usage` | 待驗：未有本輪頁面互動證據 |
| `/booking` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/cases` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/courses` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/enterprise` | 待驗：未有本輪頁面互動證據 |
| `/login` | 部分已驗：Ego 本機登入／錯密碼、正式站 390px；M8 英文錯誤待修，註冊／重設 UI 待驗 |
| `/member` | 部分已驗：Ego 本機本人方案／空報告／pending 單；M9 過期 token 假空狀態、C12 登出後 refresh 可恢復待修 |
| `/member-admin` | 待驗：未有本輪頁面互動證據 |
| `/member-admin/council-runs` | 待驗：未有本輪頁面互動證據 |
| `/member-admin/council-runs/[id]` | 待驗：未有本輪頁面互動證據 |
| `/member-ai` | 待驗：未有本輪頁面互動證據 |
| `/member-ai/decision` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/member-ai/face` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/member-ai/face/history` | 待驗：未有本輪頁面互動證據 |
| `/member-ai/face/reports/[id]` | 待驗：未有本輪頁面互動證據 |
| `/member-pricing` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/member/reports/[id]` | 待驗：未有本輪頁面互動證據 |
| `/privacy` | 待驗：未有本輪頁面互動證據 |
| `/reset-password` | 待驗：未有本輪頁面互動證據 |
| `/services` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/thanks` | 待驗：未有本輪頁面互動證據 |

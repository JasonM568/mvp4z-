# API 與頁面驗收缺口清單（自動盤點）

產生基準：本機 commit `d1d3128`；88 個 API route 檔、50 個頁面檔。執行 `node scripts/qa-route-inventory.mjs` 重建。
本表的「部分已驗」只指欄中列出的情境；其餘正常、異常、空狀態、邊界、超長與並發仍以 [全系統 Test Matrix](full-system-acceptance-2026-10-11.md) 逐項追蹤。`待驗` 是明確未有執行證據，不能推定通過。動態參數路由以模板名稱表示。

## API routes

| 路由 | 方法 | QA 狀態／已驗範圍 |
|---|---|---|
| `/api/admin/bookings` | GET | 隔離通過：具名管理員列表與 limit 邊界 M6 11/11；正式待驗 |
| `/api/admin/bookings/[id]` | GET, PATCH | 隔離通過：具名管理員 GET／PATCH＋audit；更多邊界待驗 |
| `/api/admin/council-runs` | DELETE, GET | M17 補修分支 `ced1432` 隔離 GET 複驗通過；後台兩路由合計 16/16，含 100／500 位數字 400；DELETE 與正式站待驗 |
| `/api/admin/course-product` | GET, PATCH | 具名管理員 GET 隔離冒煙 200（23 路由批次）；PATCH 待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/course-registrations` | GET | 隔離通過 M7/M11：非法 limit 400、完整摘要與 DB 一致，跟進流程 17/17；正式站待驗 |
| `/api/admin/course-registrations/[id]` | PATCH | 隔離通過：具名管理員跟進 PATCH、時間戳與 audit；非法／超長拒絕 |
| `/api/admin/create-code` | POST | 隔離通過：具名管理員建立、非法／邊界、N=10 唯一碼與 audit 13/13；正式待驗 |
| `/api/admin/credits` | POST | 不合格 C2：餘額與帳本不一致 |
| `/api/admin/documents` | GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；上傳待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/documents/[id]` | DELETE, PATCH | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/effective-settings` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；設定內容正確性待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/email-domain` | GET, POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-analysis` | GET | M17 補修分支 `ced1432` 隔離 GET 複驗通過；後台兩路由合計 16/16，含 100／500 位數字 400；正式站待驗 |
| `/api/admin/face-analysis/[id]` | GET | 不合格 M18：具名合法詳情／事件／audit、授權與 no-store 通過；非法／SQLi／500 字 id 均 500；與 preview 合計隔離 13/19，正式站待驗 |
| `/api/admin/face-analysis/[id]/preview` | POST | 不合格 M18：無照片／過期照片 410、未知合法 UUID 404、匿名401／會員403及拒絕不寫 event 通過；非法／SQLi／500 字 id 均 500；有效照片簽名 URL 待驗 |
| `/api/admin/face-knowledge` | GET, POST | 部分已驗：具名管理員建立／查詢與非法輸入通過；C6 並發隔離回歸通過 |
| `/api/admin/face-knowledge/[id]` | DELETE, PATCH | 部分已驗 C6：單／雙管理員 N=10 各 11 輪隔離通過；正式站待驗 |
| `/api/admin/face-knowledge/[id]/revisions` | GET | 部分已驗 C6：隔離並發快照一致；正式站待驗 |
| `/api/admin/face-knowledge/bulk` | POST | 隔離通過 C6：具名送審／發布／封存各唯一版本、revision、audit；共用 key 403，正式待驗 |
| `/api/admin/face-knowledge/export` | GET | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-knowledge/import` | POST | 部分已驗 C6：新卡／upsert 版本與 audit 正確；M14 同批重複 card_id 回 500，正式待驗 |
| `/api/admin/face-provider-approval` | DELETE, GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；寫入／撤銷待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/face-review-questions` | GET, PATCH | 具名管理員 GET 隔離冒煙 200（23 路由批次）；PATCH 待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/face-rules` | GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；POST 待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/face-rules/publish` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/face-teachings` | GET, POST | C18 候選 `461f213`＋migration：X-QA 全新隔離 stack 建立／audit 故障原腳本 6/6；其他 kind、正式整合／部署待驗 |
| `/api/admin/face-teachings/[id]` | DELETE, PATCH | C17 候選曾發布保留／雙管理員競爭／刪除 audit 回滾隔離通過；C18 候選 PATCH 發布 audit 故障回滾與正常具名 audit 連續兩輪各通過；舊報告 v1 正文還原未證，正式整合／部署待驗 |
| `/api/admin/face-teachings/import-builtin` | POST | C18 候選 X-QA 隔離兩輪通過：audit 故障 500／新增 0、正常匯入 67 筆、重跑冪等且具名 audit；正式整合／部署待驗 |
| `/api/admin/gemini-provider-approval` | DELETE, GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；寫入／撤銷待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/invoices` | GET | 部分已驗：具名管理員 pending 發票列表與訂單連結；開票／退款待驗 |
| `/api/admin/invoices/[orderId]/issue` | POST | 部分已驗 C8：隔離 paid 訂單非法 body 7/7；合法 ezPay 開票／正式站待驗 |
| `/api/admin/members` | GET | C16 修復分支隔離 API 9/9：205 筆跨五頁無漏、最舊 Email 搜尋、全域總數及非法 page／q／cursor；Ego UI 第 5 頁／搜尋通過，1,001 筆規模 11/11；正式整合／部署待驗 |
| `/api/admin/orders` | GET | 不合格 M10：管理員清單／詳情與發票對帳通過，三種非法 id 回 500 |
| `/api/admin/orders/[id]/refund` | GET, POST | C10/C13/C14/M16 最新隔離 API/DB 複驗通過：正常 20/20、同鍵與異金額 17/17、N=10 並發 4 輪、audit 故障 15/15；Ego Lite 管理員 UI 遺失回應後重載同鍵重送，退款／交易／audit 各 1 且清理完成；正式 migration／站端待驗 |
| `/api/admin/prompt-settings` | GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；草稿儲存待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/prompt-settings/publish` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/provider-health` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；提供者實際可用性待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/provider-health/test-alert` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/qimen-review` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；盤例與簽核仍待老師確認；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/qimen-review/preview` | POST | 隔離 API 11/11：具名管理員合法時間 3×3、空／越界／SQLi／超長 400、不存在日期空盤與 error、五路並發相同盤；Auth/profile 清 0；盤面專業簽核待老師 |
| `/api/admin/qimen-review/signoff` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/referrals` | GET, PATCH, POST | 部分已驗 C7：隔離建立／並發改率 audit 11 輪通過；正式站及 C5 歸因規則待驗 |
| `/api/admin/school-settings` | GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；草稿儲存待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/school-settings/preview` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/school-settings/publish` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/site-content` | DELETE, GET, PATCH, POST | 隔離服務通過 M13：字串 false POST/PATCH 400 零發布、真布林上／下架 4/4；其餘 CMS／正式站待驗 |
| `/api/admin/site-content/media` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/site-content/media/sign` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/token-usage` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；統計對帳待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/ai/chat` | POST | 不合格 B1：並發免費答案 |
| `/api/ai/council` | POST | 既有正式證據：並發／日限額；瀏覽器找回待驗 |
| `/api/auth/forgot-password` | POST | 部分已驗：帳號不洩漏；重設信待驗 |
| `/api/auth/login` | POST | 部分已驗：正確／錯密碼 |
| `/api/auth/logout` | POST | 隔離通過 C12：舊 access／refresh 均立即 401、重複登出 200，API 6/6；故障 UI 留存憑證並提示重試；正式站待驗 |
| `/api/auth/refresh` | POST | 部分已驗：有效／無效 refresh |
| `/api/auth/register` | POST | 部分已驗：註冊／同手機並發；郵件待驗 |
| `/api/bookings` | POST | 部分已驗：欄位邊界；M1／M3 待規則 |
| `/api/chat` | POST | 舊路由無權杖 401，與新 `/api/ai/chat` 相同；有效會話及 B1 待修 |
| `/api/courses/checkout` | GET, POST | 部分已驗：驗證與後端定價；M5 雙送待規則 |
| `/api/cron/cleanup-face-images` | GET, POST | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/cron/cleanup-pending-orders` | GET | 隔離通過：密鑰拒絕、dry-run、舊 pending 清理及新 pending／paid 保留；正式排程待驗 |
| `/api/cron/expire-entitlements` | GET | 隔離通過 C11：dry-run、過期狀態與點數保留、audit／重跑 13/13；正式排程待驗 |
| `/api/cron/pending-drafts` | GET, POST | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/cron/provider-health` | GET | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/face-analysis/runs` | GET, POST | A/B 歷史列表通過；M17 補修分支 `ced1432` limit 邊界隔離 8/8，abc／SQLi／100／500 位均 400；C9 僅在已套回退 migration 的隔離庫建立綁新 VIP 權益；provider／正式站待驗 |
| `/api/face-analysis/runs/[id]` | DELETE, GET | 不合格 M19：A/B 所有權、本人刪除抹除與重送部分通過；N=5 並發曾產生 `run_deleted` 2 筆，已刪列 route 同款 claim 與 redact RPC 均可再執行；隔離腳本 13/15；有效照片／PDF 實體刪除待驗 |
| `/api/face-analysis/runs/[id]/analyze` | POST | M20 不合格：有效會員直接 API，未知 UUID 404，非法／SQLi 形狀／500 字 id 均 500；與另五路由矩陣兩輪各 15/24。有效報告分析、扣點與 provider 待驗 |
| `/api/face-analysis/runs/[id]/image` | DELETE | 部分已驗：越權 DELETE 404；本人照片待驗 |
| `/api/face-analysis/runs/[id]/pdf` | GET | QA-FS-M20：C4 隔離 DB／3214 app 兩輪各 7/10；本人完成報告 PDF 位元組與重取一致、跨會員 404、未完成 409、匿名／壞 token 401；非法、SQLi 形狀及 500 字 id 均 500。六路由矩陣重現；待修與正式站複驗 |
| `/api/face-analysis/runs/[id]/preview` | GET | M20 不合格：有效會員直接 API，未知 UUID 404，非法／SQLi 形狀／500 字 id 均 500；越權 404 已驗，有效照片待驗 |
| `/api/face-analysis/runs/[id]/upload` | POST | 待驗：缺可重跑的正常與異常流程證據 |
| `/api/login` | POST | 舊路由空 body 400，與新路由相同；正常登入待驗 |
| `/api/logout` | POST | 舊路由空 body 冪等 200，與 C12 新路由相同；有效 session 待驗 |
| `/api/me` | GET | 舊路由無權杖 401，與新路由相同；有效會員待驗 |
| `/api/member/council-runs` | GET | A/B 列表所有權通過；M17 補修分支 `ced1432` limit 邊界隔離 8/8，abc／SQLi／100／500 位均 400；正式站待驗 |
| `/api/member/council-runs/[id]` | GET | 隔離通過：A/B 詳情所有權 |
| `/api/member/me` | GET | C9 條件通過：已套現回退 migration 的隔離庫 VIP/20；現行 fresh DB 加購仍不合格 |
| `/api/member/orders` | GET | 隔離通過：A/B 訂單所有權、付款開通輪詢與 SQLi 形狀查詢 11/11 |
| `/api/member/redeem` | POST | 隔離通過：N=10 原子兌換／rollback；正式待驗 |
| `/api/member/usage` | GET | 隔離通過：A/B 使用量 API 所有權與匿名／壞 token 拒絕 |
| `/api/orders/create` | POST | 部分已驗：M4 邊界及內部方案 code／ID 拒絕 9/9、推廣歸因；M5／C5 待規則 |
| `/api/payments/ecpay/notify` | POST | 隔離通過：C4 四情境×20 輪；正式待驗 |
| `/api/payments/ecpay/return` | GET, POST | 隔離 dummy stage MAC 5/5：GET 導會員頁、偽造付款 pending、合法 MAC 導 paid；僅導回，真實交易與 UI 輪詢待驗 |
| `/api/plans` | GET | 部分已驗：公開 GET 200 與 plans 結構（安全冒煙 21/21）；內部方案顯示／排序待驗 |
| `/api/redeem` | POST | 舊路由無權杖 401，與新路由相同；有效兌換待驗 |
| `/api/referral/lookup` | GET | 隔離通過：公開查碼 8/8；註冊歸因待驗 |
| `/api/register` | POST | 舊路由空 body 400，與新路由相同；正常註冊待驗 |
| `/api/site-content` | GET | 隔離服務通過 M12：部分下架 9→8、全下架 DB/API 0；案例／課程及正式站待驗 |

## 頁面 routes

| 路由 | QA 狀態／已驗範圍 |
|---|---|
| `/` | 部分已驗：桌面／手機截圖；本機 3104 基本渲染通過（h1／main／無 Application error）；內容互動與正式站仍待驗 |
| `/about` | 本機 3104 基本渲染通過（h1／main／無 Application error）；互動與正式站待驗 |
| `/admin` | 部分已驗 C12：具名管理員隔離雙分頁登出與雙 token 清除通過；總覽資料與正式站待驗；本機具名管理員殼層導覽通過，資料與操作待驗 |
| `/admin-login` | 待驗：未有本輪頁面互動證據 |
| `/admin/bookings` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/bookings/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/council-runs` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/council-runs/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/course-launch` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/course-registrations` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/documents` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/face-analysis` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/face-analysis/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/face-knowledge` | 部分已驗 C6：隔離 UI 409 當下保留草稿；M15 刷新比對流程、正式站待驗；本機具名管理員殼層導覽通過，資料與操作待驗 |
| `/admin/face-provider` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/face-rules` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/face-teachings` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/gemini-provider` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/invoices` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/members` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/orders` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/orders/[id]` | 待驗：未有本輪頁面互動證據 |
| `/admin/prompt-settings` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/provider-health` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/qimen-review` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/referrals` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/school-settings` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/site-cases` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/site-services` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/admin/token-usage` | 本機具名管理員殼層導覽通過；資料與操作待驗 |
| `/booking` | 正式站 390px 無水平溢出；本機 3104 基本渲染通過；完整互動待驗 |
| `/cases` | 正式站 390px 無水平溢出；本機 3104 基本渲染通過；完整互動待驗 |
| `/courses` | 正式站 390px 無水平溢出；本機 3104 基本渲染通過；完整互動待驗 |
| `/enterprise` | 本機 3104 基本渲染通過（h1／main／無 Application error）；互動與正式站待驗 |
| `/login` | Ego 本機登入／錯密碼、正式站 390px；本機 3104 基本渲染通過；M8 英文錯誤待修，註冊／重設 UI 待驗 |
| `/member` | 部分已驗：Ego 本機本人方案／空報告／pending 單；C12 隔離雙分頁登出與雙 token 清除通過，M9 過期 token 假空狀態待修 |
| `/member-admin` | 待驗：未有本輪頁面互動證據 |
| `/member-admin/council-runs` | 待驗：未有本輪頁面互動證據 |
| `/member-admin/council-runs/[id]` | 待驗：未有本輪頁面互動證據 |
| `/member-ai` | 待驗：未有本輪頁面互動證據 |
| `/member-ai/decision` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/member-ai/face` | 部分已驗：正式站 390px 無水平溢出；完整互動待驗 |
| `/member-ai/face/history` | 待驗：未有本輪頁面互動證據 |
| `/member-ai/face/reports/[id]` | 待驗：未有本輪頁面互動證據 |
| `/member-pricing` | 正式站 390px 無水平溢出；本機 3104 基本渲染通過；完整互動待驗 |
| `/member/reports/[id]` | 待驗：未有本輪頁面互動證據 |
| `/privacy` | 本機 3104 基本渲染通過（h1／main／無 Application error）；互動與正式站待驗 |
| `/reset-password` | C15 補修分支 `6bd59cd` QA Ego Lite 隔離 E2E 兩輪各 11/11：有效連結改密成功、新密登入舊密拒絕、已用／無連結／無效 token 提示與 hash 清空；正式站舊版仍 client-side exception，待部署、真實收信與站端回歸 |
| `/services` | 正式站 390px 無水平溢出；本機 3104 基本渲染通過；完整互動待驗 |
| `/thanks` | 本機 3104 基本渲染通過（h1／main／無 Application error）；實際預約提交與正式站待驗 |

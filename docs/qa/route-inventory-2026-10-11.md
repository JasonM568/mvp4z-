# API 與頁面驗收缺口清單（自動盤點）

產生基準：本機 commit `3bcad03`；88 個 API route 檔、50 個頁面檔。執行 `node scripts/qa-route-inventory.mjs` 重建。
路由與方法由程式自動盤點；QA 狀態沿用上一版註記，重建不等於重測，程式改動後須人工複核。新增路由採既有預設狀態並待人工核實。其餘正常、異常、空狀態、邊界、超長與並發仍以 [全系統 Test Matrix](full-system-acceptance-2026-10-11.md) 逐項追蹤。`待驗` 是明確未有執行證據，不能推定通過。動態參數路由以模板名稱表示。

## API routes

| 路由 | 方法 | QA 狀態／已驗範圍 |
|---|---|---|
| `/api/admin/bookings` | GET | 隔離通過：具名管理員列表與 limit 邊界 M6 11/11；正式待驗 |
| `/api/admin/bookings/[id]` | GET, PATCH | 隔離通過：具名管理員 GET／PATCH＋audit；更多邊界待驗 |
| `/api/admin/council-runs` | DELETE, GET | M17 補修分支 `ced1432` 隔離 GET 複驗通過；後台兩路由合計 16/16，含 100／500 位數字 400；DELETE 與正式站待驗 |
| `/api/admin/course-product` | GET, PATCH | 具名管理員 GET 隔離冒煙 200（23 路由批次）；PATCH 待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/course-registrations` | GET | 隔離通過 M7/M11：非法 limit 400、完整摘要與 DB 一致，跟進流程 17/17；正式站待驗 |
| `/api/admin/course-registrations/[id]` | PATCH | 隔離通過：具名管理員跟進 PATCH、時間戳與 audit；非法／超長拒絕 |
| `/api/admin/create-code` | POST | 隔離正常／非法／邊界／N=10 唯一碼與 audit 13/13；audit INSERT 回 error 的 route＋替身再現 HTTP 200、新碼已建但 audit 0（QA-FS-C20 critical）；真 DB 故障未驗 |
| `/api/admin/credits` | POST | 不合格 QA-FS-C2：超額扣點餘額與帳本不一致；audit error route＋替身再現 valid delta 已入餘額／ledger、HTTP 200 但 audit 0，併入 C2 追蹤 |
| `/api/admin/documents` | GET, POST | 現行 main 原缺陷仍在；C19 候選 `78dff9c` 隔離 HTTP 正常／audit 故障原子性與 Storage、字數邊界 22/22，加 DB 並發 1/1；Storage 故障只有替身 2/2，正式整合／部署待驗 |
| `/api/admin/documents/[id]` | DELETE, PATCH | 現行 main 原缺陷仍在；C19 候選 `78dff9c` 的 PATCH／DELETE 正常、audit 故障回滾、title-only 相容性列入隔離 HTTP 22/22；Storage 故障只有替身 2/2，正式整合／部署待驗 |
| `/api/admin/effective-settings` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；設定內容正確性待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/email-domain` | GET, POST | QA 路由＋Resend 網路替身 11/11：拒絕非管理員、缺 key 503、空／已驗證網域 GET、create 冪等、verify 尚 pending、無網域 404、非法／超長 action 400、上游 403→502 且不洩 key；舊交接記載正式 Resend 網域曾 verified 且測試告警已收，當前狀態與本輪正式流程未重驗 |
| `/api/admin/face-analysis` | GET | M17 補修分支 `ced1432` 隔離 GET 複驗通過；後台兩路由合計 16/16，含 100／500 位數字 400；正式站待驗 |
| `/api/admin/face-analysis/[id]` | GET | 現行 main 非法 ID 仍 500；M18 候選 `2f672f0` 與整合候選隔離 21/21：壞 ID 400、未知 UUID 404、授權與詳情、有效私有預覽；正式整合／部署待驗 |
| `/api/admin/face-analysis/[id]/preview` | POST | 現行 main 非法 ID 仍 500；M18 候選隔離 21/21 含有效私有簽名預覽、無圖／過期 410、匿名 401／會員 403；正式整合／部署待驗 |
| `/api/admin/face-knowledge` | GET, POST | 部分已驗：具名管理員建立／查詢與非法輸入通過；C6 並發隔離回歸通過 |
| `/api/admin/face-knowledge/[id]` | DELETE, PATCH | 部分已驗 C6：單／雙管理員 N=10 各 11 輪隔離通過；正式站待驗 |
| `/api/admin/face-knowledge/[id]/revisions` | GET | 部分已驗 C6：隔離並發快照一致；正式站待驗 |
| `/api/admin/face-knowledge/bulk` | POST | 隔離通過 C6：具名送審／發布／封存各唯一版本、revision、audit；共用 key 403，正式待驗 |
| `/api/admin/face-knowledge/export` | GET | 隔離 API 8/8：匿名／壞 token 401、會員 403、具名管理員 JSON 200＋attachment/no-store；28 卡 ID 與 DB 全數同序、重取一致，Auth/profile 清 0。大量卡片與正式站待驗 |
| `/api/admin/face-knowledge/import` | POST | 部分已驗 C6：新卡／upsert 版本與 audit 正確；M14 同批重複 card_id 回 500，正式待驗 |
| `/api/admin/face-provider-approval` | DELETE, GET, POST | QA-FS-C22 POST/DELETE route＋替身各重現 audit INSERT error 後仍 200 且狀態 active/revoked、audit 0；真 DB／OpenAI provider 未驗；具名管理員授權程式檢查待動態確認 |
| `/api/admin/face-review-questions` | GET, PATCH | 具名管理員 GET 隔離冒煙 200（23 路由批次）；PATCH 待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/face-rules` | GET, POST | QA-FS-M25 route＋記憶體 DB/audit 替身：draft 建立後 audit INSERT 回 error 仍 HTTP 200、audit 0；81 字版本標籤 400 零寫入；真 DB／舊 draft update 未驗；⚠ 是否將現行 ADMIN_KEY 改為具名管理員待決 |
| `/api/admin/face-rules/publish` | POST | QA-FS-M25 route＋記憶體 DB/audit 替身 7/7：正常／無 draft、ADMIN_KEY null actor 通過；audit INSERT 回 error 仍 HTTP 200 且 profile 已切換、無 audit；publish UPDATE 故障可造成無 published profile並回退 built-in rules；真 DB／並發未驗；critical |
| `/api/admin/face-teachings` | GET, POST | C18 候選 `461f213`＋migration：X-QA 全新隔離 stack 建立／audit 故障原腳本 6/6；其他 kind、正式整合／部署待驗 |
| `/api/admin/face-teachings/[id]` | DELETE, PATCH | C17 候選曾發布保留／雙管理員競爭／刪除 audit 回滾隔離通過；C18 候選 PATCH 發布 audit 故障回滾與正常具名 audit 連續兩輪各通過；舊報告 v1 正文還原未證，正式整合／部署待驗 |
| `/api/admin/face-teachings/import-builtin` | POST | C18 候選 X-QA 隔離兩輪通過：audit 故障 500／新增 0、正常匯入 67 筆、重跑冪等且具名 audit；正式整合／部署待驗 |
| `/api/admin/gemini-provider-approval` | DELETE, GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；寫入／撤銷待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/invoices` | GET | 部分已驗：具名管理員 pending 發票列表與訂單連結；開票／退款待驗 |
| `/api/admin/invoices/[orderId]/issue` | POST | C8 隔離 paid 訂單非法 body 7/7；成功 invoice helper＋audit error route stub 為 HTTP 200、audit 0（QA-FS-C20）；真 ezPay 開票／DB audit 故障未驗 |
| `/api/admin/members` | GET | C16 修復分支隔離 API 9/9：205 筆跨五頁無漏、最舊 Email 搜尋、全域總數及非法 page／q／cursor；Ego UI 第 5 頁／搜尋通過，1,001 筆規模 11/11；正式整合／部署待驗 |
| `/api/admin/orders` | GET | 不合格 M10：管理員清單／詳情與發票對帳通過，三種非法 id 回 500 |
| `/api/admin/orders/[id]/refund` | GET, POST | C10/C13/C14/M16 隔離 API/DB：正常 20/20、同鍵與異金額 17/17、N=10 並發 4 輪、audit 故障 15/15；Ego 管理員 UI 遺失回應後同鍵重送，退款／交易／audit 各 1；正式 migration／站端待驗 |
| `/api/admin/prompt-settings` | GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；草稿儲存待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/prompt-settings/publish` | POST | QA-FS-C21 route＋記憶體替身：audit INSERT 回 error 仍 HTTP 200、draft 已 published／舊版 archived、audit 0；真 DB／cache 版本未驗 |
| `/api/admin/provider-health` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；提供者實際可用性待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/provider-health/test-alert` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/qimen-review` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；盤例與簽核仍待老師確認；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/qimen-review/preview` | POST | 隔離 API 11/11：具名管理員合法時間 3×3、空／越界／SQLi／超長 400、不存在日期空盤與 error、五路並發相同盤；Auth/profile 清 0；盤面專業簽核待老師 |
| `/api/admin/qimen-review/signoff` | POST | QA-FS-C21 route＋記憶體替身：audit INSERT 回 error 仍 HTTP 200、signoff row 已新增、audit 0；真 DB／盤例計算／cache 未驗 |
| `/api/admin/referrals` | GET, PATCH, POST | 部分已驗 C7：隔離建立／並發改率 audit 11 輪通過；正式站及 C5 歸因規則待驗 |
| `/api/admin/school-settings` | GET, POST | 具名管理員 GET 隔離冒煙 200（23 路由批次）；草稿儲存待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/admin/school-settings/preview` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/school-settings/publish` | POST | QA-FS-C21 route＋記憶體替身：audit INSERT 回 error 仍 HTTP 200、draft 已 published／舊版 archived 並附簽核資訊、audit 0；真 DB／consumer 未驗 |
| `/api/admin/site-content` | DELETE, GET, PATCH, POST | 隔離服務通過 M13：字串 false POST/PATCH 400 零發布、真布林上／下架 4/4；其餘 CMS／正式站待驗 |
| `/api/admin/site-content/media` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/site-content/media/sign` | POST | 部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗 |
| `/api/admin/token-usage` | GET | 具名管理員 GET 隔離冒煙 200（23 路由批次）；統計對帳待驗；匿名／壞 token／會員拒絕已驗 |
| `/api/ai/chat` | POST | 現行 main B1 不合格；整合候選 `d5758bb` 專用 49 migration stack 的假模型真 HTTP N=10×3 輪：各 1 答覆／扣點、9 筆 409，usage／ledger 一致，fixture 清 0；真模型與正式站待驗 |
| `/api/ai/council` | POST | 既有正式證據：並發／日限額；瀏覽器找回待驗 |
| `/api/auth/forgot-password` | POST | 部分已驗：帳號不洩漏；重設信待驗 |
| `/api/auth/login` | POST | 部分已驗：正確／錯密碼 |
| `/api/auth/logout` | POST | C12 隔離 API 6/6：舊 access／refresh 均立即 401、重複登出 200，故障 UI 留存憑證並提示重試；正式站待驗 |
| `/api/auth/refresh` | POST | 部分已驗：有效／無效 refresh |
| `/api/auth/register` | POST | 部分已驗：註冊／同手機並發；郵件待驗 |
| `/api/bookings` | POST | 部分已驗：欄位邊界；M1／M3 待規則 |
| `/api/chat` | POST | 舊路由無權杖 401，與新 `/api/ai/chat` 相同；有效會話及 B1 待修 |
| `/api/courses/checkout` | GET, POST | 部分已驗：驗證與後端定價；M5 雙送待規則 |
| `/api/cron/cleanup-face-images` | GET, POST | 路由＋記憶體 DB／Storage 替身 7/7：密鑰、空批、到期、批次、Storage 與 DB 更新故障；自有 56 migration stack 因 Storage health 失敗停止，故真 Storage 不存在物件重試未驗；正式排程、上傳競爭待驗 |
| `/api/cron/cleanup-pending-orders` | GET | 隔離通過：密鑰拒絕、dry-run、舊 pending 清理及新 pending／paid 保留；正式排程待驗 |
| `/api/cron/expire-entitlements` | GET | 隔離通過 C11：dry-run、過期狀態與點數保留、audit／重跑 13/13；正式排程待驗 |
| `/api/cron/pending-drafts` | GET, POST | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/cron/provider-health` | GET | 部分已驗：匿名 401；排程實際執行待驗 |
| `/api/face-analysis/runs` | GET, POST | A/B 歷史列表通過；M17 補修分支 `ced1432` limit 邊界隔離 8/8，abc／SQLi／100／500 位均 400；C9 僅在已套回退 migration 的隔離庫建立綁新 VIP 權益；provider／正式站待驗 |
| `/api/face-analysis/runs/[id]` | DELETE, GET | 現行 main M19 競態仍開票；M19 候選與整合 production build 隔離 16/16：A/B、N=20、PII 抹除、一次事件、私有照片／PDF 刪除、重送；正式 migration／部署待驗 |
| `/api/face-analysis/runs/[id]/analyze` | POST | 現行 main M20 壞 ID 仍 500；候選／整合隔離 ID 矩陣 24/24、非法分析無 DB／Storage／點數副作用 4/4；有效新分析另以受控 Vision／報告替身與真隔離帳務驗證，真模型及正式站待驗 |
| `/api/face-analysis/runs/[id]/image` | DELETE | 原有隔離：越權 DELETE 404；QA-FS-M24 route＋記憶體 DB/Storage 替身 8/8，重現 Storage 刪除後 DB finalize 失敗會卡 `deletion_pending`、audit INSERT 失敗會永久漏事件；真 Supabase DB/Storage 故障尚未驗，X-PM 已接受 critical 並派工程1 |
| `/api/face-analysis/runs/[id]/pdf` | GET | 現行 main M20 壞 ID 仍 500；候選／整合隔離 PDF 11/11：本人位元組與重取一致、跨會員 404、未完成 409、壞 ID 400；正式站待驗 |
| `/api/face-analysis/runs/[id]/preview` | GET | 現行 main M20 壞 ID 仍 500；候選／整合隔離 ID 矩陣 24/24，A/B 有效私有照片預覽與拒絕路徑已驗；正式站待驗 |
| `/api/face-analysis/runs/[id]/upload` | POST | 現行 main M21／M22 原缺陷仍開票；M22 整合候選 `15631e7` 隔離 29/29：空照片不計次、品質拒絕→合格、N=2×10、lease、event 故障原子回滾；M23 雙故障孤兒檔仍為 critical，真品質與正式站待驗 |
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
| `/` | 正式站 SSR 唯讀煙霧 `qa-public-page-smoke.mjs` 200、title／h1／main 存在、無錯誤文案；內容互動與手機視覺待驗 |
| `/about` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；互動與手機視覺待驗 |
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
| `/booking` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；390px 曾驗無溢出，表單提交待驗 |
| `/cases` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；390px 曾驗無溢出，內容互動待驗 |
| `/courses` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；390px 曾驗無溢出，報名互動待驗 |
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
| `/member-pricing` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；390px 曾驗無溢出，購買流程待驗 |
| `/member/reports/[id]` | 待驗：未有本輪頁面互動證據 |
| `/privacy` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；政策內容與連結逐項審核待驗 |
| `/reset-password` | C15 最小 release `5631c7f` QA Ego Lite 隔離 hash 兩輪各 11/11、PKCE code／過期／重用與新舊密驗證通過；正式站舊版仍 client-side exception，待部署、真實收信與站端回歸 |
| `/services` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；390px 曾驗無溢出，內容互動待驗 |
| `/thanks` | 正式站 SSR 唯讀煙霧 200、title／h1／main 存在、無錯誤文案；實際預約提交與狀態驗證待驗 |

# Handoff

## 2026-09-04 收工｜課程後台修復、介面改善與媒體上傳修正

### 目前狀態

- 正式專案：`xunfeng-official-v2`
- 分支：`main`
- 最新功能 commit：`1930692 fix(admin): upload posters and videos directly to storage`
- `main` 與 `origin/main` 同步；更新交接文件前工作樹乾淨。
- 今日五批變更均已 push；最後一批（媒體上傳）Vercel `dpl_2uE9tEFywTAf4jpmfTjjgRSaa9Xw` 已 READY 並掛在 `www.xunfeng.tw`。
- 第一批課程日期修復曾確認 Production Ready，正式站也驗到新的前台同步標記。
- 後兩批 UI 改善已成功 build 與 push，但 Vercel 狀態查詢因權限審查服務回 404 而無法完成正式站二次核對。

### 已完成

1. **修復後台無法編輯真正課程日期**
   - 新增 `GET/PATCH /api/admin/course-product`。
   - 後台主打課程頁新增「報名課程設定」，可修改課程名稱、期別、日期、開始／結束時間、地點、新生價與複訓價。
   - API 驗證不存在日期、時間格式、結束時間必須晚於開始時間及價格範圍。
   - 前台 `/courses` 報名摘要改由 `course_products` 的同一筆資料同步，不再只顯示硬編碼日期與價格。
   - Commit：`536d63d`。

2. **放大後台左側功能區塊名稱**
   - 原本區塊標題只有 10px，且比子項目更小。
   - 改為 15px、提高對比、減少字距，點擊高度至少 44px，補鍵盤焦點樣式。
   - Commit：`cc2fc24`。

3. **重新設計主打課程推廣頁**
   - 頂部新增課程名稱、上下架狀態與排程摘要。
   - 表單分為上架排程、課程主訊息、內容與行動按鈕、海報與影片四個步驟。
   - 右側新增即時內容／主海報摘要。
   - 儲存、上架、下架操作區固定於頁面底部。
   - 補平板與手機響應式排版。
   - Commit：`c7ff948`。

4. **提高主打課程頁整體可讀性**
   - 報名課程設定與推廣編輯區一起調整。
   - 區塊標題 20px、欄位名稱 15px、輸入文字 16px、輔助說明 13px、按鈕 15px。
   - 輸入框最小高度 48px，並提高說明文字對比與行高。
   - Commit：`185c294`。

5. **修復海報上傳失敗、新增宣傳影片上傳**
   - 根因：舊上傳把檔案送進 Vercel function，撞 4.5MB request body 上限；影片欄位根本沒有上傳功能。
   - 新增 `POST /api/admin/site-content/media/sign`，瀏覽器改直接 PUT 到 Supabase Storage（圖 10MB／影片 200MB）。
   - `MediaField` 支援圖片與影片、上傳進度、影片預覽；前台支援 YouTube / Vimeo 嵌入與 mp4 / webm / mov。
   - migration `20260904120000_site_media_video.sql` 已用 `supabase db push` 套用正式庫。
   - 本地 `site_content_cms` migration 改名為 `20260901154318` 對齊遠端。
   - Commit：`1930692`。

### 修改檔案

- `app/api/admin/course-product/route.ts`
- `app/admin/_course-product-editor.tsx`
- `app/admin/_promo-editor.tsx`
- `app/admin/site-cases/page.tsx`
- `app/admin/admin.css`
- `app/(public)/courses/page.tsx`
- `public/js/course-checkout.js`
- `app/api/admin/site-content/media/sign/route.ts`（新）
- `app/admin/_content-editor.tsx`
- `public/js/cms-render.js`
- `styles/site.css`
- `supabase/migrations/20260904120000_site_media_video.sql`（新）
- `supabase/migrations/20260901154318_site_content_cms.sql`（改名）

### 驗證結果

- `npx tsc --noEmit`：通過。
- `npm run test:unit`：169 passed、2 skipped（課程日期修復批次）。
- `npm run build`：四批變更皆通過；最後一次為字級改善後的完整 Production build。
- `git diff --check`：通過。
- 第一批 Vercel deployment：Ready，別名含 `www.xunfeng.tw`。
- 正式 `/courses` 曾確認包含課程日期、標題與價格同步標記。
- 正式 CSS 曾確認側邊欄 `.admin-nav-toggle` 已為 15px。

### 未完成事項與風險

0. **需真人登入後台實際上傳一張大於 5MB 的海報與一支 MP4**，確認瀏覽器端 XHR 直傳流程與進度條。
   Supabase 全域上傳上限已由 50MB 調到 200MB（Management API，非 migration；重建專案要再調一次），
   150MB 直傳實測成功。
1. **需真人登入後台驗收主打課程頁**
   - 路徑：後台 → 網站內容 → 案例課程 → 主打課程推廣。
   - 確認新四步驟版面、字級與手機顯示。
   - 實際修改課程日期並儲存，再重新整理 `/courses`，確認日期、時間、地點與價格同步。
2. 後兩批 UI deployment 的 Production Ready 狀態未被工具二次核對；原因是批准服務回 404，不是 build 或 push 失敗。
3. 報名商品仍是單一固定代碼 `zhangzhongjue-115-01`；若未來要同時販售多門課，需要改成多課程商品管理。
4. 前次遺留仍在：
   - 用全新 Email 從 `?ref=ran81127` 註冊 → 下單 → 到後台確認終身推廣歸因。
   - NT$1 信用卡真刷後停用 `e2e_card_test`。
   - EZPay 正式環境、Resend 網域驗證、AI provider keys、面相規則 PDF 對帳與 ZDR。

### 待辦優先順序

0. 真人驗收已做一次：上傳成功但圖放到「影片預覽圖」欄位（前台不顯示）。請改上傳到「海報 1～3」再看 `/courses`；影片上傳仍待驗。
1. 真人登入後台驗收新版主打課程頁與放大字級。
2. 修改一次真實課程日期，確認前台報名摘要與結帳資料同步。
3. 完成推廣連結新會員註冊與訂單歸因真人驗收。
4. 完成 NT$1 信用卡 E2E 並停用測試方案。

### 下次起手式

1. 讀本檔、`worklog.md` 最新紀錄與 `memory.md`。
2. 執行 `git status --short --branch`、`git log --oneline -5`。
3. 查 Vercel 最新 Production deployment 是否 Ready。
4. 直接登入正式後台驗收「主打課程推廣」，優先確認字級與課程日期儲存。

### Git 狀態

- 收工文件提交前：`main...origin/main`，工作樹乾淨。
- 最新功能 commit：`1930692`。
- 收工文件更新後需 commit 並 push。

### 長時間程序

- 無。

# Handoff

## 2026-09-04 收工｜/courses Landing Page 改版、課程上架後台、媒體上傳修正

### 目前狀態

- 正式專案：`xunfeng-official-v2`，分支 `main`，與 `origin/main` 同步，工作樹乾淨。
- 最新功能 commit：`1065b61 feat(admin): drag-and-drop image order in course launch step 6`；Vercel Production READY。
- 今天同一時段另有一個「持續開發 Loop」session 在本 repo 提交 `063d18a`（課程結帳先鎖定、推廣 cookie 降級），
  其回歸測試已更新以配合新按鈕文字（見下）。收工時該 session 可能仍在執行，接手前先 `git pull`。

### 今日完成（依時間）

1. **媒體上傳修復**：圖片改走 Supabase signed upload URL 直傳（繞過 Vercel 4.5MB）；新增影片上傳（MP4/WebM/MOV ≤200MB）
   與 YouTube/Vimeo 嵌入；Supabase 全域上傳上限 50MB→200MB（Management API，非 migration）。
2. **/courses 改為完整 Landing Page**（server 端渲染，ISR 30s）：固定報名列、Hero（單張主視覺）、課程介紹圖往下滿版堆疊、
   痛點、學完你能、大綱時間軸、影片、講師、課程資訊、FAQ、注意事項、報名表（四個編號區塊＋金色結帳按鈕寫金額）、其他課程講座。
3. **後台「課程上架」**（`/admin/course-launch`）七步驟：報名商品／主視覺文案／課程內容／講師與信任／FAQ 與注意事項／
   主視覺、介紹圖與影片（可拖曳排序）／上架排程；右側「前台區段檢查」。`/admin/site-cases` 只剩案例與其他課程講座。
4. **資料**：`site_course_promo` 新增 18 個 Landing 欄位＋`gallery`（migration `20260904150000`、`20260904170000`，皆 `supabase db push`）。
   STEP 6 圖片順序整串存 `gallery`，前三張同步 `poster_*`；前台以 `gallery` 為準，空的舊資料退回海報 1～3。
5. **正式站內容**：老師上傳的兩張海報已排為第 1、2 張，舊「掌中訣開班授課」QR 海報第 3 張。
6. 由 `course-planner`／`copywriter` agent 產出架構與預設文案；Codex 協助三個報名區 CSS 細節。

### 修改檔案（主要）

- `app/(public)/courses/page.tsx`（重寫）、`public/js/course-checkout.js`、`public/js/cms-render.js`、`styles/site.css`
- `app/admin/_course-landing-editor.tsx`（新）、`app/admin/course-launch/page.tsx`（新）、`app/admin/_content-editor.tsx`（MediaField）、
  `app/admin/_course-product-editor.tsx`、`app/admin/site-cases/page.tsx`、`app/admin/_shell.tsx`、`app/admin/admin.css`；刪除 `_promo-editor.tsx`
- `app/api/admin/site-content/media/sign/route.ts`（新）、`app/api/admin/site-content/route.ts`、`lib/site/content.ts`、`lib/site/course-product.ts`（新）
- `supabase/migrations/20260901154318_site_content_cms.sql`（改名對齊遠端）、`20260904120000_site_media_video.sql`、
  `20260904150000_course_landing_fields.sql`、`20260904170000_course_gallery.sql`
- `lib/site/course-checkout-regression.test.ts`（斷言改為含金額的按鈕文字）

### 驗證結果（收工時）

- `npx tsc --noEmit` 通過；`npm run test:unit` 178 tests：176 passed、2 skipped；`git diff --check` 通過。
- 最後一次 `npm run build` 通過（1065b61）。
- 正式站以 headless Chromium 核對：Hero 單張主視覺、介紹圖 2 張堆疊、報名區金色按鈕文字含金額、手機固定報名列正常。
- 注意：收工前對正式站的高頻檢查觸發了 Vercel Security Checkpoint（403 挑戰頁）；之後驗證請放慢頻率。

### 未完成、風險與待辦

1. **真人驗收後台 STEP 6 拖曳排序**與整個七步驟：改幾個字、拖一次順序、儲存並上架，30 秒後看 `/courses`。
2. 學員見證、更多課程介紹圖仍空白，由老師自行補。
3. 仍是單一課程商品 `zhangzhongjue-115-01`；多課程需另做商品管理。
4. 前次遺留：推廣連結新會員註冊→下單→後台歸戶真人驗收；NT$1 信用卡真刷後停用 `e2e_card_test`；EZPay 正式環境、Resend 網域驗證、AI provider keys。
5. Supabase 全域上傳上限是專案設定，重建專案要再調。

### 下次起手式

1. `git pull`，讀本檔、`worklog.md` 最新兩節與 `memory.md`；`git status --short --branch`、`git log --oneline -5`。
2. 查 Vercel 最新 Production 是否 READY。
3. 登入正式後台 → 網站內容 → 課程上架，走一遍七步驟做真人驗收。

### Git 狀態

- `main...origin/main`，收工文件提交後工作樹乾淨。

### 長時間程序

- 本 session：無。另一個「持續開發 Loop」Claude session（navide pane）可能仍在本 repo 執行。

---

## 附錄：另一個 session 的交接（原文保留）

## 2026-09-04 持續開發 Loop｜課程首屏與推廣歸因防護

### 目前狀態

- 正式專案：`xunfeng-official-v2`，分支 `main`。
- 本輪找出並修復兩個額外邊界缺陷：課程頁 API 回應前顯示過期假資料；破損 `xf_ref` cookie 可能讓下單異常。
- 課程結帳現在必須先取得當期 API 資料才會解鎖；API 失敗時維持鎖定並顯示原因。
- HTML 驗收報告：`docs/reports/2026-09-04-continuous-development-verification.html`。
- Commit `063d18a` 已 push；Vercel Production `dpl_Au7hG5XjbtbxUDfEJfJDDi3e39Jb` Ready 並已掛上 `www.xunfeng.tw`。

### 已完成與修改檔案

- `app/(public)/courses/page.tsx`：過期硬編課程改為中性讀取狀態，結帳按鈕預設鎖定。
- `public/js/course-checkout.js`：成功同步資料後解鎖；失敗時鎖定並告知。
- `lib/referral/attribution.ts`：損壞 URI cookie 安全降級為無歸因，不擋下單。
- 新增推廣歸因與課程首屏回歸測試，並保存 Playwright 驗收截圖。

### 驗證結果

- `npm run test:unit`：176 passed、2 skipped。
- `npx tsc --noEmit`：通過。
- `npm run build`：通過，101 頁成功生成。
- `git diff --check`：通過。
- Playwright 正式站：`/courses` API 200、三張海報、桌機與手機可操作；推廣導流與後台未登入保護正常。
- Playwright 本機 production build：API 正常時解鎖、503 時鎖定的兩條路徑均通過。
- HTML 報告已以 HTTP 實際開啟，兩張內嵌證據圖均載入 200；僅 favicon 未設定產生無影響 404。

### 未完成、風險與待辦

- 程式範圍內無未完成項目。
- 營運層仍可由真人做一次「管理員實際上傳 MP4」、「全新 Email 註冊→下單→後台歸戶」與 NT$1 真刷；這些需帳號／費用，本輪沒有擅自執行。
- 正式 HTML 已比對：新讀取標記 2 處、過期 `2026年6月21日` 0 處；API 回當期 2026-10-17 資料。

### 下次起手式

1. 若使用者提供營運驗收帳號，執行 MP4 與新會員歸戶的最後真人 E2E。
2. 其餘開發可直接依新需求開始，本輪程式項目已閉環。

### Git 與長時間程序

- 長時間程序：無。
- Git：`main` 已與 `origin/main` 同步；最新功能 commit `063d18a`（本次交接更新將另一筆 docs commit）。

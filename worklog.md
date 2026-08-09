# Worklog

此檔按日期追加實際工作紀錄；不可覆蓋舊紀錄。最新交接與下一步仍以 `handoff.md` 為準。

## 2026-08-06｜面相運程原型分析與正式系統 SPEC

### 需求

- 分析 `https://xunfeng-face-app.kingking0909.chatgpt.site/?v=25`。
- 將面相功能整理成 SPEC，並整合至現有 `xunfeng-official-v2`，沿用既有前後端技術棧。
- 建立固定的「開工／收工」紀錄流程。

### 調查與判斷

- 實際檢查原型 DOM、視覺、互動元素與 inline JavaScript。
- 原型已有自拍／他人模式、相機／相簿、年齡、同意、儀式動畫、分層報告與任務換點 UI。
- 程式未呼叫後端 API；點數存在 localStorage，任務按完成即可領點。
- `buildMetrics()` 只從 Base64 字串抽樣算 seed，再產生 sharp/light/balance/score；不是真實影像分析。
- 正式專案已有會員、點數、ECPay、EZPay、AI council 與原子扣點，不應重建第二套商業系統。

### 產出

- `docs/specs/face-analysis/README.md`
- `docs/specs/face-analysis/SPEC-01-face-foundation.md`
- `docs/specs/face-analysis/SPEC-02-face-capture-quality.md`
- `docs/specs/face-analysis/SPEC-03-face-analysis-report.md`
- `docs/specs/face-analysis/SPEC-04-face-history-admin.md`

### 關鍵決策

- 新路由 `/member-ai/face`。
- 免費品質檢測，成功完整報告扣 20 點。
- 真實視覺檢測、私有 Storage、24 小時刪圖、後端原子扣點與內容安全限制列為上線必要條件。
- 分四期按相依順序開發，不接受直接把原型 HTML／JS 搬入正式站。

### 驗證與狀態

- 五份 Markdown 共 478 行（含索引）。
- 僅新增文件，未執行 build/test。
- 工作樹原先只有 `docs/specs/` 未追蹤；交接更新後另包含 `CLAUDE.md`、`handoff.md`、`worklog.md`。
- 尚未 commit 或 push。

### 待辦

1. 使用者確認開始開發後執行 SPEC-01。
2. SPEC-01 完成且 RLS 測試通過後才進 SPEC-02。
3. 所有報告與扣點實作須遵循既有 council 的 charge-on-success 慣例。

## 2026-08-06（下午）｜天機四象 · 順轉人生改版上線

### 完成

- 易學決策報告改版四階段體驗（Landing/Input/Scanning/Report）並部署 production。
- 後端 structured JSON 契約 + migration 0014（已套用）；四象儀表板吃真實數值（共鳴度/信心指數）。
- 分享圖卡（html2canvas 9:16 PNG）。
- 修掃描頁完成不跳轉 bug（commit 729e7af）。
- 兩個 admin 帳號改無敵測試帳號（999,999 點/效期 2099）：306465@gmail.com、kingking0909@yahoo.com.tw。

### 關鍵決策

- 結構化數值由 LLM 終稿附 JSON block 產出（非前端硬 parse），解析失敗一律降級純文字、不影響扣點交付。
- 極簡輸入為主、34 專業欄位收進階摺疊區；consent 扣點紅線與 charge-on-success 完全保留。
- 掃描動畫為擬真進度（不改同步 POST 架構）。

### 驗證與狀態

- build/tsc 全綠、10 項單元測試過、production 首跑成功（共鳴度 87、扣 20 點、~2 分鐘）。
- 修正後完整流程待使用者實測回報。

### 待辦

1. 使用者實測：跳轉、儀表板視覺、手機分享圖卡。
2. 監控 council_runs.structured null 率。
3. 面相 SPEC 仍 staged 未 commit，等確認再開發。

---

## 2026-08-09｜排盤引擎 Phase 0 + 後台維護模組（報告內容／排盤流派）

### 本次完成

**一、修 SYSTEM_ARCHITECTURE.md 第 12 節的四項已知問題**

- 12.1 文件不同步：README 全文重寫（原本停在骨架期，說多數 API 是 501 佔位）；handoff.md 檔頭加導引、發票段落加 ⚠️ 更正框。
- 12.2 內容來源分散：發現 commit `f2c636d` 想在首頁露出「易學決策報告／AI 即時問答」兩張服務卡，但只改了不會被 serve 的 `content/`，**從未生效**，且價格寫 10 點（現行 20 點）。已用正確費率補進 `public/content/services.json`，並在 `cms-render.js` 加 `serviceCta()` 讓數位服務導向站內頁（原本 CTA 寫死 `/booking`，這才是它上不了線的技術原因）。
- 12.3 舊原型封存：`xunfeng-yixue-system` README 加封存聲明 + 本地 tag `archived-2026-08-09`（未 push）。
- 12.4 舊 API 相容層：**原判斷是錯的**。那六條不是等舊前端退場，而是現役前端一直在呼叫（member-auth.js / member-ai.js）。照原建議移除會當場打壞註冊、登入、會員資料、啟用碼、AI 問答。已把前端六處改成正規路徑，相容層保留兜快取的舊 JS 並註記退場條件。

**二、排盤引擎 Phase 0（`lib/yixue/`）**

- 採用 tyme4ts 1.5.2（MIT）做曆法原語；真太陽時、四柱組裝、流派分歧全部自建。
- Spike 推翻計畫假設：晚子時兩派日柱都能純讀取取得（`SixtyCycleHour.getDay()` vs `getLunarHour().getLunarDay().getSixtyCycle()`），不需自己重寫 JDN→干支。
- 節氣時刻對中央氣象署 2025 年五個節氣**分鐘級全數吻合**。
- 時柱自算五鼠遁，掃描 2025 年 1,152 個時刻與 tyme4ts 完全一致。
- 日柱在 1900–2100 共 24,120 天連續性無跳號。
- 單次四柱排盤 0.299ms。

**三、後台維護模組**

- `/admin/prompt-settings` 報告內容維護：四頁籤分欄位編輯（報告骨架／分身人設／品質門檻／兜底報告）。
- `/admin/school-settings` 排盤流派設定：四個決策做成單選卡片，**右側即時試算**並列「目前生效 vs 修改後」的四柱。
- 兩者皆草稿→發布兩段式，舊版封存，每份報告記下當時版本。

**四、排盤接進報告**

- prompt 不再把生日丟給 AI 自推四柱，改送程式排好的盤並標明「既定事實，不得自行改算」。
- 第二輪只帶摘要版（省約六成額外 token）。
- 表單新增出生地（縣市）與選填精確時分，放在進階折疊區。

### 關鍵決策

- **重構安全網**：動 prompt 前先把現行輸出凍結成 18 個 snapshot，重構後逐字元比對相同才繼續。這是在收費路徑上動刀的前提。
- **設定失效一律回退程式預設值**：DB 掛掉、沒有已發布版本、驗證失敗都回退，等同改版前行為。後台設定是加值，不該有能力讓產品下線。
- **流派用版本化而非即時可變**：改流派會讓所有盤的干支改變，`council_runs.school_version` 必須指得回當時算法。
- **名稱自己擁有不做簡繁轉換**：tyme4ts 輸出簡體（惊蛰／劫财／七杀／农历）。手寫簡繁對照表會漏字（實測漏了「闰」），改成用 index 對應自己的繁體表。
- **lib/yixue 維持純函式**（無 I/O、無 Date.now），讀 DB 的流派載入放在 `lib/school-settings/`。guard.test.ts 強制執行。

### 順手修掉的既有 bug

- `isLeapMonth` 前端有送、schema 有收，但 `YixuePayload` 型別漏宣告導致進 prompt 前被靜默丟棄——**農曆閏月出生的會員，報告一直少了閏月資訊**（同組年月日差約一個月，四柱完全不同）。

### 與交接文件不符的發現

- `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` 正式站 81 天前就設好了，但 handoff 與專案記憶都還寫「待補」並列為上線關卡。可劃掉。
- `COUNCIL_CREDIT_COST` 仍在正式站，但程式已寫死 20 點不讀它，屬可清殘留。
- 四個 `*_SYSTEM_PROMPT` 覆寫變數在 production / preview / development **都沒有設**，後台編輯會正常生效。

### 驗證與狀態

- tsc、build、73 項測試全綠（含 18 個 prompt baseline snapshot、Phase 0 曆法 30 項、橋接 15 項、架構護欄 5 項）。
- 三個 migration **已直接套用正式資料庫** `pvasgmmjrodukudbzuhp`：0015（prompt profiles + documents + storage bucket）、0016（council_runs.chart / school_version）、0017（school profiles）。皆為純新增，既有 22 筆報告與會員資料未動。
- 尚未部署。

### 待辦

見 handoff.md「2026-08-09 交接：轉 Codex 執行」章節。

## 2026-08-09｜老師純文字文件後台完成

### 本次完成

- 新增 `GET/POST /api/admin/documents`：管理員文件列表、`.txt`／`.md` 上傳、UTF-8／Big5 解碼、文字正規化、Storage 私有上傳與 DB metadata 寫入。
- 新增 `PATCH/DELETE /api/admin/documents/[id]`：改標題、分類、術別、切換是否納入 Prompt，以及同步刪除 Storage 與資料列。
- 啟用文件前由後端檢查 `DOCUMENT_CHAR_BUDGET=6000`；超過時拒絕，報告讀取端仍保留截斷兜底。
- 新增 `/admin/documents`：上傳、列表、分類、術別、改名、刪除、納入勾選與字數預算進度。
- 後台導覽新增「老師文件」；`adminFetch` 支援 FormData，不再錯誤固定 multipart 的 Content-Type。
- 新增 `lib/documents/text.test.ts`，涵蓋副檔名、UTF-8 BOM、零寬字元、Big5 與字數統計。

### 安全與一致性

- 原始檔只放私有 `yixue-documents` bucket；一般會員無寫入或讀取權限。
- 上傳 Storage 成功但 DB insert 失敗時會補償刪除檔案。
- 新文件預設 `include_in_prompt=false`，必須由管理員明確勾選。
- API 不接受 client 指定 storage path、created_by 或 extracted_text。

### 驗證

- `npx tsc --noEmit` 通過。
- `npm run test:unit`：6 files、77 tests 全數通過。
- `npm run build`：Compiled successfully；`/admin/documents` 與兩條 API route 均出現在 build manifest。

### 下一步

1. commit 本批次並推送功能分支。
2. 建立 Preview，請老師實測 `/admin/prompt-settings`、`/admin/school-settings`、`/admin/documents`。
3. 老師確認後才合併／部署易學功能。
4. 易學穩定後，以最新主線重建面相整合分支並重編 migration，避免 0015～0017 撞號。

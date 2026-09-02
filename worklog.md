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

1. 本批次已 commit `c0b19a2` 並推送功能分支。
2. Preview 已 READY：`https://mvp4z-j98nzlhg4-tjs-projects-435187fd.vercel.app`；請老師實測 `/admin/prompt-settings`、`/admin/school-settings`、`/admin/documents`。
3. 老師確認後才合併／部署易學功能。
4. 易學穩定後，以最新主線重建面相整合分支並重編 migration，避免 0015～0017 撞號。

## 2026-08-09｜面相安全整合與 Preview

### 完成

- 建立 `integration/face-analysis-on-yixue`，由最新易學 `main` 整合面相，不覆寫四術或共用扣點路徑。
- migration 改為與正式 Supabase history 一致的 timestamp 序列；面相排在既有易學 migration 之後。
- 以遠端 migration fetch 確認對應：`20260806065135`=structured、`20260809141108/141126`=prompt/documents+bucket、`143730`=chart、`144146`=school profiles。
- 唯讀確認 EZPay 欄位及 2026 方案點數已存在；baseline 可重跑。
- `supabase db push --dry-run` 成功後已受控套用正式 schema，全程沒有 migration repair。
- 遠端驗證：migration history 完全對齊；runs/events 皆 0；knowledge cards 28；anon 讀 base tables 401；方案點數不變。
- 最新 Preview deployment `dpl_9fsDzBLgzVcJXDbD8MSRpdxZTNUi` READY；CLI bypass smoke：公開頁 200、未授權 API 401、旗標關閉 POST 404。

### 下一步

1. 部署最新 Preview；功能旗標繼續關閉。
2. 執行具名 admin 知識庫 CRUD 與測試會員 owner/RLS E2E。
3. 確認 provider 與零保留政策後才小流量開啟。

## 2026-08-10｜受保護 Preview E2E

- 知識庫 CRUD／revision／export／archive 全通過；測試卡已清除，正式草稿維持 28。
- 會員 0 點建立、requestId 冪等、owner/cross-owner、欄位遮蔽、刪除冪等與零扣點全通過。
- authenticated 直讀 base table 為 403；短命帳號與所有關聯資料已清除，token 已 401，runs/events 為 0。
- 下一步：先做 fail-closed OpenAI quality/vision adapter；零保留資格確認前不得送真實照片或開正式旗標。

## 2026-08-10｜OpenAI 照片 provider adapter

- 新增 OpenAI Quality／Vision structured-output adapter，沿用既有 OpenAI key。
- `store:false`、明確 provider 選擇、零保留環境旗標與 strict schema 四層防護。
- report Responses 同步改為 `store:false`。
- unit 85/85、face 8/8、tsc、build 通過；沒有真實照片呼叫。
- 下一步：先確認組織零保留資格，再以合成測試圖執行受保護 Preview E2E。
- 官方文件確認 ZDR 無 API/key 自動探測方式；gate 加強為 ZDR boolean + mode + approved date，MAM 不放行人臉照片。

## 2026-08-10｜老師 ZDR 認證後台

- 新增具名認證資料表、admin API、`/admin/face-provider` 操作頁與撤銷閉環。
- 禁止 ADMIN_KEY 簽署，拒絕疑似 key/token，保存 verified_by/time 與 audit；不保存 OpenAI 登入資料。
- runtime 可讀有效認證作為 Quality/Vision ZDR gate，face feature flag 仍獨立。
- migration 已套用；空表、anon 401。unit 88/88、face 11/11、tsc、build 通過。

## 2026-08-13｜面相系統定調沈師體系、文獻總整理、rules v2

### 本次完成

- 檢討人臉辨識管線，確認品質層／Vision 層有真實臉部幾何與輪廓觀察，但舊 rules.ts 未使用形態特徵（只用可見度光線）——依使用者要求修正為形態導向。
- 讀完 F17 十二宮位 22 頁與望診健康 12 頁；6 個背景 agent 整理 283 頁筆記本為六份結構化稿（約 4,178 條規則、964 條 CRITICAL），產出 `面相老師文獻/283頁筆記整理/`（含 README_總覽）。
- 使用者定調：宮位體系以沈師版為權威。產出 SPEC-05 v0.2（十二宮×部位對應表、三倉年齡段、奴僕宮、細部位清單、安全分級）。
- 改寫 `lib/face-analysis/rules.ts`（沈師宮名／一宮多部位主輔／財帛宮三倉／形態特徵進 status 與 evidence／palace.parts／version 2.0）；同步 `report.ts` outputContract 與 `report.test.ts`。
- 決策存入長期記憶（xunfeng-face-shen-system）。

### 驗證

- tsc 通過；vitest 12 files / 94 tests 全綠。未跑 next build。變更未 commit、未部署；production 面相旗標維持關閉。

### 遺留

- 待 commit；rules v2 新測試、Vision v2 細部位、face_rule_profiles 後台、知識卡重核、合成圖穩定性測試——詳見 handoff 同日章節。
- SPEC-05 五題待老師確認（含筆記 p.88 疑似誤植）。

## 2026-08-13｜面相正式上線迭代與 Vision v3 個人化

### 本次工作

- 完成面相真人照片正式流程的連續修正與多次 production 部署。
- 新增合作對象評估勾選與合作項目描述；輸出合作結論、角色邊界、合作條件、相處模式、風險訊號與核對問題。
- 修正合作選項版面、名稱文字、頁面內即時相機、美肌／濾鏡／磨皮警告及自然照片確認。
- 新增斑、痣、疤、痕與照片氣色的 Vision／報告結構及前端重點區塊。
- 唯讀稽核正式資料庫最近 8 份完成 runs，確認舊 Vision 特徵高度同質化（89%～100%，3 組完全相同）。
- 實作 Vision v3：新增 5～12 項具體差異特徵及 5～8 項照片指紋，並把指紋帶入五大面向與核心結論。
- 精簡使用者報告頁：移除教材來源顯示及底部完整十二宮全文；後端仍保存分析依據。

### 重要判斷

- 報告相似的根因不是照片未送入模型，而是 Vision v2 的選項過粗，使多數正面照片集中在「中等／圓潤／對稱」，後續規則與固定報告骨架放大同質化。
- 修正策略採「上游增加照片差異資訊＋報告證據可追溯」，不是只調高 LLM temperature 或要求改寫文風。
- 十二宮與教材來源暫留後端作分析／稽核，前台只呈現使用者需要的重點，避免長文淹沒結論。

### 主要提交與部署

- `9d224cf feat(face): analyze visible surface features`
- `ddbe73f feat(face): personalize reports with vision fingerprints`
- `8089d6f fix(face): simplify report presentation`
- 最新 production deployment：`dpl_J3ukmjke9RMT9F9mAhC5gmSNAq4d`，alias `https://www.xunfeng.tw`，狀態 `READY`。

### 驗證

- Face tests：25 passed、2 skipped。
- TypeScript：通過。
- Next production build：通過（87 routes）。
- 真實報告模型 E2E：1/1 通過。
- 正式面相頁 `?v=31`：HTTP 200。

### 遺留事項

- 需以兩張不同真人照片產生全新 Vision v3 報告，驗收照片指紋與主要結論差異。
- 需依新 runs 做匿名相似度稽核；必要時再調整 Vision provider/model 或加入第二模型覆核。
- Safari／Chrome 桌機與手機相機仍需跨裝置人工驗收。

## 2026-08-19（跨 08-20）｜面相系統大修：流年、斑痣對應、教材規則資料庫化、會員版用語

### 起因

使用者用相機拍現況照實測報告，回報三個問題：
1. 報告內容攏統，像免費版 AI 回應
2. 九執流年、七十五流年法完全沒派上用場
3. 斑、痣、疤、痕沒有對應到部位提醒（自身健康、六親關係、財運）

後續又追加兩項：指紋段落沒接教材、會員報告不該出現「教材」與文獻出處。

### 重要判斷

- **攏統的根因不是 LLM 文風，是規則層沒有相理內容**。舊 rules.ts 只輸出三種 status
  ＋四個粗枚舉，沒有任何教材判讀進到報告，撰稿模型只能寫萬用話。
  再加上 REPORT_INSTRUCTIONS 17 行有 12 行是禁令，模型被推向最安全＝最空泛的寫法。
- **指紋是唯一沒有教材根據的一段**。distinctiveFeatures 原文直接穿透，而 teachings 比對的是
  regions/details 的粗枚舉，兩條路不相交。關鍵發現：distinctiveFeatures.feature 是 16 個
  結構化枚舉，粒度比八大區塊細得多（noseTip 就是準頭、就是流年 48），正好夠接流年。
- **判讀分工**：部位、宮位、流年、正反向條件全部查表且產出後由 server 蓋回；
  模型只負責「這次觀察接近相理合或相理不合」，且只能在教材提供的兩個條件之間選。
- **28 張知識卡不是判讀規則**。它們是部位索引（rule_condition 全為 {}），
  每張 editor_summary 都明寫「不直接輸出結論」。就算打開開關報告也不會變好。
  先前把這條通路斷掉講得比實際嚴重，已於對話中更正。
- **教材原文與會員說法分流**：會員看老師的說法，老師看教材的原文。
  健康主題會員版只給「部位＋所屬宮位＋建議健檢核對」，教材原文（含望診 CRITICAL）只進老師版。

### 產出

新增 lib/face-analysis/：flow-year.ts、surface-map.ts、teachings.ts、fingerprint-map.ts、
face-features.ts、teaching-rules.ts、audit.ts、review-state.ts、__fixtures__/vision.ts
＋對應測試（flow-year 14、teachings 17、audit 9、fingerprint-map 9、teaching-rules 8、
review-state 4、member-wording 6）。

後台：/admin/face-teachings（審核模式／表格模式／待老師確認事項）、
/admin/face-analysis/[id] 教材依據稽核鏈。

Migration：20260819101010_face_teaching_rules、20260819110000（reviewed_version）、
20260819120000_face_review_questions。三支皆已套用正式 Supabase。

### 逐批內容

1. **流年技法**（b8702ab）：七十五部位 1–99 歲逐歲表、九值流年法、併看法（以當陽為準）、
   三關四隘。舊版只有一句佔位字串。
2. **斑痣宮位對應**：14 部位 → 宮位／主題／教材流年歲數／出處。
3. **教材形態規則表**：37 條「部位×形態條件→教材說法」，每條標出處；
   部位不可判讀或信心度 <0.65 不套用。
4. **指紋接教材**（0568356）：16 個特徵枚舉接部位、宮位、流年、正反向條件。
5. **引用強制驗證＋稽核鏈**（8761138）：假引用剔除並記入 trace；
   後台可看 Vision 觀測 → 命中條件 → 教材條文與頁碼 → 報告是否引用。
6. **規則資料庫化**（4b8c555）：face_teaching_rules 一條一列，安全分級三階，
   三層回退，rule_id/kind 發布後不可改、已發布只能封存。67 條已匯入並發布。
7. **審核模式**（f78f405）：出處與教材原文並排、具名確認、進度 X/67；
   reviewed_version 讓內容一改核對狀態自動失效。
8. **待老師確認事項**（f622b87）：五題入庫，老師在後台具名回覆。
9. **逾時修正＋環境清理**（b99b6ac）：見下。
10. **會員版用語**（a9210bb）：移除教材與出處，加確定性淨化器。

### 意外抓到的正式站風險

清理殭屍變數時發現**時間預算不足**：Vision 45s ＋ 報告 75s = 120s，剛好吃光 maxDuration，
沒留給照片下載與扣點寫入。契約擴大後報告實測 6,100 tokens／73s，貼著 75s 上限，
本機驗證已撞到一次 FACE_REPORT_PROVIDER_TIMEOUT。正式站未爆是因最後一份完成報告在 8/17。
→ maxDuration 120→300、報告 abort 75s→110s。

環境：移除殭屍變數 FACE_REPORT_MODEL（deepseek-v4-pro，全 repo 無讀取）；
.env.local 的 FACE_REPORT_PROVIDER=deepseek 會讓本機直接丟 UNSUPPORTED，改 openai；
.env.example 的模型從 gpt-4.1-mini 更新為 gpt-4.1。
撰稿模型改由 FACE_REPORT_OPENAI_MODEL 或預設 gpt-4.1 決定，不再繼承聊天用的 OPENAI_MODEL。

### 驗證結果

- tsc 通過；test:unit 20 files / 169 passed、2 skipped（session 起始為 94）
- next build 通過
- 真實模型端對端多次：最終版規則版本 db:...:67、gpt-4.1、67.7s，
  教材／頁筆記／講義／p.數字 洩漏 0 筆
- 線上前端 bundle 比對：教材 0 次
- production 最終 deployment mvp4z-nqqri6rxw READY，www.xunfeng.tw 200

### 遺留事項

- 67 條規則的內容仍是從整理稿（agent 產出）抄的，中間隔兩層，未回原始 PDF 對帳。
  審核模式就是為此而做，但實際對帳需老師執行。
- 五題待老師回覆，全部 status=open。
- 67 條的 created_by 為 null（由 Claude 以 service role 匯入），
  decided_by 記為「系統匯入內建規則（由 Claude 代為執行，未經後台具名操作）」。
- 報告輸出 6,100 tokens 偏高；schema 內的 sources 與完整 palaces 前台不顯示，
  稽核已改讀 model_trace.teacherAudit，可考慮從輸出契約移除以省 token 與延遲。
- 未實測真人照片跑完整流程（使用者今日未回報新報告）。

## 2026-08-21（跨 08-22）｜面相「尚有未完成的分析任務」永久封鎖修正

使用者回報面相頁一直跳「有沒執行完的分析任務」，追問是 API token 用完還是系統 bug。
**是系統 bug**，與 token／點數／方案無關。

### 根因

`app/api/face-analysis/runs/route.ts` 的併發保護 count **沒有時間窗**（隔壁的
`recentCount` 有 `hourAgo`，這支沒有），算的是該帳號有史以來所有沒收尾的 run；
而 `created`／`uploaded`／`quality_rejected`／`analyzing` 四種狀態沒有任何收尾路徑
（`cleanup-face-images` 只刪圖不改 status），計數只會單調累加，到 3 就終身封鎖。

最常觸發的路徑是 `quality_rejected`：前端每換一張照片就重抽 `requestId`，
**照片品質沒過三次＝帳號永久鎖死**。

正式庫實證：會員 565e1b83 有 3 筆 quality_rejected 橫跨 08-14～08-21，
completed 12 筆、failed 1 筆，帳號本身完全正常。

### 修正（6f97e5d，已部署 production）

1. 併發判斷移除 `quality_rejected`，其餘三種加 30 分鐘時間窗，
   同一 `requestId` 的重送不擋自己；常數集中到 `lib/face-analysis/config.ts`。
2. 新增 `expired` 終態（migration `20260821120000_face_run_expiry`，含一次性收尾）。
3. `cleanup-face-images` 加 `sweepStaleRuns()`：created >30 分、uploaded／
   quality_rejected >24 小時 → expired；analyzing >15 分 → failed（ANALYSIS_TIMEOUT）。
   刻意不另開 cron——不確定 Vercel 方案的 cron 上限，加第三支有部署失敗風險。
4. 錯誤訊息改成講得出還要等多久；analyze／upload 碰到 expired 任務有各自說明。

錯誤碼分成 RUN_ABANDONED／RUN_ABANDONED_AFTER_QUALITY／保留 QUALITY_REJECTED，
否則後台品質通過率會被 expired 洗掉；`summarizeMetrics` 同步改用錯誤碼還原品質結果。

### 順帶修掉：supabase db push 完全罷工

本地 migration 版號與遠端歷史對不上，`db push` 直接拒絕執行。原因是
`face_teaching_rules_review_version`（遠端 20260819114645）與 `face_review_questions`
（遠端 20260819123902）先前是透過 MCP `apply_migration` 直接套的，版號由 MCP 自己生。
已將本地檔名改名對齊。**日後改 schema 固定走「寫 migration 檔 → supabase db push」，
不要用 MCP 直接套。**

### 驗證結果

- tsc 通過；test:unit 19 files / 169 passed、2 skipped；next build 通過
- migration 已套用正式庫；套用後該會員符合新併發條件的任務數為 0
- production deployment dpl_Gazt42X… READY，www.xunfeng.tw 已指向本版

### 遺留事項

- **使用者尚未在正式站實測**（我沒有會員 token，無法代跑）。下次開工第一件事。
- 排程收尾效果未實地驗證，需看 cron log 的 `stale_runs` 欄位。
- 上一輪待辦全部原封不動：真人照片實測報告、67 條回 PDF 對帳、五題待老師回覆、
  報告 tokens 偏高、既有 go-live gate。

## 2026-08-22 收工｜面相相簿上傳被 capture 封死

### 需求

使用者回報「面相的上傳圖片功能被閹掉」。

### 調查與判斷

- 上傳鏈路程式碼完整存在：`app/api/face-analysis/runs/[id]/upload/route.ts`、
  前端 `handleFile`／`useFile`／FormData POST 都在，功能沒有被刪。
- 真因是 `app/member-ai/face/page.tsx` 的 file input 帶了
  `capture={mode === "self" ? "user" : "environment"}`。手機瀏覽器只要看到
  `capture` 就直接開相機、不顯示相簿入口，上傳既有照片這條路等於被封死。
- 桌機忽略 `capture`，照樣開檔案選擇器，所以本機開發驗不出來——它因此一路存活。
- `git log -S 'capture='` 顯示此屬性自最初的 `ef93f1a` 就存在，非近期改動造成。
- 頁面本來就有「開啟即時相機」按鈕走 `getUserMedia`，拍照路徑已具備，
  `capture` 既多餘又與之打架。

### 產出（commit `2a51256`，已 push main）

- 移除 file input 的 `capture` 屬性。
- 按鈕文案「拍照或選擇照片」→「從相簿選擇照片」。
- 說明文字補上相簿上傳與可接受格式。
- 僅動 `app/member-ai/face/page.tsx`，未碰後端與 schema。

### 關鍵決策

- 只拿掉 `capture`，不改 `accept`。後端 `normalizeAndInspectFaceImage` 只支援
  JPEG／PNG／WebP；`accept` 維持這三種時，iOS 選 HEIC 會由 Safari 自動轉 JPEG，
  加 heic/heif 反而會讓 sharp 解不開的檔案上得去。
- 拍照與選圖分成兩個明確入口（getUserMedia vs file input），不再讓單一按鈕兩用。

### 驗證結果

- tsc 通過；vitest 19 files / 169 passed、2 skipped。
- push `5013916..2a51256`，Vercel 自動部署正式線。

### 遺留事項

- **手機實測相簿上傳尚未進行**（我無法代跑），下次開工第一件事。
- 08-21 run 封鎖修正的實測同樣還欠，建議同一次手機操作一併確認。
- 更早的待辦全部原封不動：真人照片實測報告、67 條回 PDF 對帳、五題待老師回覆、
  報告 tokens 偏高、既有 go-live gate。

## 2026-08-26 收工｜正式站刷卡能力與綠界導回設定查核（無程式改動）

### 需求

使用者兩題：(1)「確認一下網站能不能刷卡結帳？」(2)「核對一下綠界金流完成結帳之後會不會自動導回網站？」
兩題都是查核既有設定，不是開發任務。本次未改任何程式碼。

### 查核方法與證據

**A. 正式站活著**

- `/` 200、`/member-pricing` 200
- `/api/payments/ecpay/notify` 405（只收 POST）、`/api/payments/ecpay/return` GET 303
- `/api/orders/create` 無 token → 401；`/api/courses/checkout` 無 body → 400

**B. Vercel production env 確認為正式金流**（`vercel env pull` 取值核對）

- `ECPAY_ENV=production`、`ECPAY_MERCHANT_ID=3325455`（正式商店，非沙箱號）
- NOTIFY／RETURN／CLIENT_BACK 三個 URL 全為 `https://www.xunfeng.tw/...`，同 origin
- `EZPAY_INVOICE_ENV=production`、`EZPAY_INVOICE_MERCHANT_ID=337811304`
- 註：production env **沒有** `RESEND_API_KEY`，寄信 gate 仍未關

**C. 綠界正式商店是否真的開通信用卡**（本次最有價值的一項）

以 production keys 自行簽章、POST 到 `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`
建立一次收銀台 session（**只讀回 HTML，未送出付款、未扣款、未寫我方 DB**）：

- HTTP 200，商店名稱顯示「惠邦創意整合行銷有限公司」
- 開通付款方式：**信用卡、Apple Pay、網路ATM、ATM虛擬帳號、超商條碼、超商代碼、綠界Pay**
- 未出現沙箱時期的 `10200141`（未啟用付款方式）錯誤
- 程式端 `ChoosePayment: "ALL"`（`lib/payments/ecpay.ts:77`），故上述方式會全部呈現

**D. 完成付款後自動導回**

- 參數面：`lib/payments/ecpay.ts:74-76` 每筆結帳都帶
  `ReturnURL`（webhook）／`OrderResultURL`（自動導回，= `/api/payments/ecpay/return`）／
  `ClientBackURL`（返回商店按鈕；課程訂單另指向 `/courses#courseCheckout`，
  `app/api/courses/checkout/route.ts:113`）
- 正式站實測：對 return route POST 一筆**故意帶錯 CheckMacValue** 的假結果表單
  （該 handler 只做 select、不寫入），回

```
HTTP/2 303
location: https://www.xunfeng.tw/member?payment=pending&order=XFPROBE_NOTREAL
```

  導回正常，且驗章沒過時正確判為 `pending` 而非 `paid`（`return/route.ts:8`）。
- 分流與文案：會員方案 → `/member?payment=...`，橫幅「付款完成，方案已自動開通。」
  （`public/js/member-auth.js:75-92`）；課程 → `/courses?course_payment=...#courseCheckout`
  （`public/js/course-checkout.js:122-126`）。

### 結論

1. **正式站可以刷卡**：綠界正式商店已開通信用卡，設定與簽章皆正確。
2. **付款完成會自動導回**：靠 `OrderResultURL`，正式站實測 303 導回會員頁並顯示結果橫幅。
3. 邊界：自動導回由綠界 POST 觸發，使用者中途關分頁就不會導回，但 webhook 照常入帳不漏單；
   ATM／超商取號當下也會導回一次，顯示「等待確認」文案，屬正確行為。

### 關鍵決策

- 驗「有沒有開通信用卡」不必真的刷卡：建立收銀台 session 讀回 HTML 即可分辨
  「商店未開通付款方式」與「已開通」，零金流風險。此法可重複使用。
- 驗「會不會導回」用錯誤簽章的假 POST：既觸發完整 redirect 路徑，又因驗章失敗
  不會誤開通任何訂單，同時順帶驗到防偽邏輯。

### 安全註記

- `vercel env pull` 產生的 `prod.env` 含正式金鑰，核對完**已立即刪除**，`git status` 乾淨。

### 遺留事項

- **信用卡真實刷卡 E2E 仍未跑**（唯一還開著的金流 gate）：需真人小額刷一筆 basic，
  驗 `/admin/orders` 轉 `paid`、`payments.check_mac_valid=true`、`/member` 點數入帳、
  EZPay 是否開出正式發票。正式環境的 webhook 至今從未被真實扣款觸發過。
- 面相手機實測（相簿上傳 + run 不再封鎖 + 真人照片報告）仍欠，自 08-21／08-22 累積至今。
- 其餘待辦原封不動：67 條規則回 PDF 對帳、五題待老師回覆、報告 tokens 偏高、
  Resend 網域驗證與 prod key、ZDR 認證簽署。

## 2026-08-31（跨 09-01）收工｜金流實刷準備、面相報告永久化、業務推廣分潤

### 需求

使用者先問「金流正常收款嗎？」，查核後追加三件事：
1. 確認金流能否正常刷卡，建立一張 1 元訂單供本人實刷。
2. 面相模組要像易學報告一樣保存報告，會員登入後可查看／下載 PDF。
3. 設計業務分潤推廣連結，後台要看得到該業務專屬連結導入的訂單明細。

### 一、金流現況查核（先於三項需求）

管線是通的：`/` 200、`/member-pricing` 200、`/api/payments/ecpay/notify` 405、
`/api/orders/create` 405（只收 POST，符合預期）。8/26 查核的 production env 設定未變動。

但 DB 實際收款紀錄推翻了「正常收款」的直覺：

- orders 總共 14 筆，**最後一筆建立於 2026-06-02**，之後近 3 個月 0 筆
- `status='paid'` 只有 4 筆，**全部落在 5/19–5/25**，即正式金流 5/26 上線之前
  - 2 筆 NT$1 是測試腳本（`XFE2E…`／`XFINV…`），連 payments 紀錄都沒有
  - 2 筆 NT$1,980：一筆 `provider_trade_no=SIM1779544326`（模擬付款）、一筆 5/19 沙箱
- payments 表總共 2 筆，都是沙箱期；invoices 只有 1 張 `JU11019625`，金額 NT$1（5/25 測試）
- 正式商店 5/26 上線後只產生 3 筆訂單，全部 cancelled
- auth.users 共 10 人，最後註冊 2026-07-16，近 30 天 0 註冊

**結論：綠界 webhook 至今從未被任何一筆真實扣款觸發過。** 不是金流壞掉，是沒有流量。
真正未排除的風險是「錢刷了、點數沒進帳」這條路徑零實證。

### 二、面相報告永久化（需求 2）

查證後發現資料層本來就齊了：`face_analysis_runs` 有 18 筆 completed，
`report_structured` 與 `report_text` **全部保留**（最新 2026-08-30），
`getOwnedPublicRun` 的 `PUBLIC_RUN_FIELDS` 也早就回傳這兩個欄位。
缺的純粹是前端沒有可回訪的報告頁 —— 當次分析的 `report` 只存在 React state，重整即失。

- 新增 `app/member-ai/face/_report-view.tsx`：把 `StructuredReport` 型別、`ReportHighlights`
  與 5 個 label helper 從 `face/page.tsx` 抽出，當次分析與事後重看共用同一份顯示層，
  確保下載到的內容與當下所見一致。`face/page.tsx` 對應段落刪除改為 import。
- 新增 `app/member-ai/face/reports/[id]/page.tsx`：獨立報告頁，比照易學
  `/member/reports/[id]` 的作法（fetch 已保存的 run → `window.print()` 產 PDF）。
  未登入導 `/login?next=...`；`deleted`／`expired`／無內容各有對應文案；另提供「下載文字」。
- 新增同目錄 `report.css`：列印時把 `html/body/.face-panel` 底色壓白。
  這是照 `decision.css:168` 的既有註解處理 —— 深色底若被印出來會變成整片黑塊。
- 列印前以 JS 展開所有 `<details>`，否則「老師怎麼看這個部位」會整段從 PDF 消失。
  （純 CSS 無法可靠地強制展開未 open 的 details。）
- `face/history/page.tsx`：「查看報告」改為連往完整報告頁，原側欄改名「快速預覽」並加開啟連結。
- `face/page.tsx` 當次報告區加「開啟報告永久連結」與「已保存在您的帳號」說明。

### 三、1 元刷卡測試方案（需求 1）

`app/api/orders/create` 的金額一律取自 `plans.price`，因此做法是**加一組隱藏方案**，
而不是去改任何現有方案的價格（改價會讓真客人用 NT$1 買到 basic）。

- DB 直接 insert（使用者明示授權）：`e2e_card_test` / 刷卡測試方案（內部）/ NT$1 / 1 點 / 1 天，
  id `a7b9a5bd-9ae1-4ff2-8215-baa74e2fce9f`。SQL 留存在 `supabase/manual/2026-08-31_card_test_plan.sql`
  （刻意不進 migrations：這是臨時測試資料，驗完就停用，不該跟 schema 一起重跑）。
- `public/js/member-pricing.js`：原本就只渲染 `PLAN_PRESETS` 列出的 basic/pro/vip，
  新增 `?plan=CODE` 時才額外要出並顯示該方案。
- **建完後 curl 正式站發現破口**：`/api/plans` 的 JSON 會裸露這組內部方案（UI 有濾但 API 沒有）。
  已改 `app/api/plans/route.ts` 過濾 `^e2e_` 開頭的 code，只有 `?include=<code>` 指名才回傳；
  `member-pricing.js` 在有 `?plan=` 時自動帶上 `include`。

刷卡網址（部署後生效）：`https://www.xunfeng.tw/member-pricing?plan=e2e_card_test`

### 四、業務推廣分潤（需求 3）

- migration `supabase/migrations/20260831120000_referral_partners.sql`，**已由使用者
  `npx supabase db push` 套用到正式庫並驗證**：
  - `referral_partners`（code 不分大小寫唯一、commission_rate 0–1、is_active、updated_at trigger、
    RLS 啟用、只授權 service_role）
  - `orders` 加 `referral_partner_id` / `referral_code` / `referral_rate`
  - `profiles` 加 `referral_code`（看得出業務帶進多少註冊，即使還沒購買）
- `components/ReferralCapture.tsx` 掛進 `app/layout.tsx`（root，任何頁面都生效）：
  `?ref=CODE` → 90 天 cookie `xf_ref`，last-touch 覆蓋，格式不符直接忽略。
- `lib/referral/attribution.ts`：`readReferralCode`（cookie + 格式驗證）、
  `resolveReferral`（查 partner，停用或查無一律回 null）、`referralFieldsForRequest`。
- `app/api/orders/create` 與 `app/api/courses/checkout` 在 insert 訂單時 spread 歸因欄位。
- `app/api/auth/register` 註冊時把 referral code 蓋到 profile（失敗不阻斷註冊）。
- `app/api/admin/referrals/route.ts`：GET 列表（含統計）／GET `?partner=` 訂單明細／POST 建立／PATCH 更新。
- `app/admin/referrals/page.tsx` + `_shell.tsx` nav 加「業務推廣分潤」；
  `admin.css` 補 `.admin-card`、`.admin-form-wide` 等樣式。

### 重要判斷

- **分潤比例存「成單當下的快照」**（`orders.referral_rate`），不是每次讀 partner 現值。
  否則日後調整比例會回頭改寫已成立訂單的應付金額，帳會對不起來。
- **推廣碼無效絕不擋付款**：`resolveReferral` 任何異常都回 null，訂單照常成立只是不歸戶。
  金流路徑不該被行銷功能拖累。
- **不改現有方案價格來做 1 元測試**，改用隱藏方案，避免真客人撿到 NT$1 的 basic。
- 修掉自己寫出的 bug：推廣碼允許底線，而 `_` 在 SQL LIKE 是單字元萬用字元，
  `AL_X` 會誤中 `ALEX`。已加 `escapeLikePattern`，`lib/referral/attribution.ts` 與
  admin API 的兩處 `ilike` 都套用。

### 驗證結果

- `npx tsc --noEmit` exit 0（改動後共跑 4 次，全綠）。
- migration 套用後以 SQL 核對正式庫：`referral_partners` 9 欄齊、`orders` 3 個歸因欄位齊、
  `profiles.referral_code` 在、RLS = true、trigger `trg_referral_partners_updated_at` 存在。
- `curl https://www.xunfeng.tw/api/plans` 確認過內部方案的裸露問題（修正尚未部署，見遺留事項）。
- **`npm run build` 未執行**：auto mode classifier 擋下，本次無法驗證 Next build 與部署。

### 遺留事項

1. `npm run build` 未跑、**本次所有程式碼都尚未部署**，正式站跑的仍是 `c694d0b`。
   `/api/plans` 的內部方案裸露修正也還沒上線（目前 JSON 仍看得到 `e2e_card_test`）。
2. 信用卡真實刷卡 E2E 仍未做（本次只是把可刷的路鋪好）。
3. 面相手機實測（08-21／08-22 累積至今）仍欠。
4. 分潤功能全部只有 typecheck，未經任何實跑：建立夥伴、cookie 歸因、後台明細都沒實測過。
5. 測試方案 `e2e_card_test` 目前 is_active=true，驗完必須停用。

---

## 2026-09-01｜後台「網站內容」CMS：老師服務／案例課程可自行編輯上架

### 需求

「後台的老師服務以及案例課程這兩個類別要有管理者自行編輯跟修改與上架課程的功能。」

對應到前台就是 `/services`（老師服務）、`/cases` + `/courses`（案例課程）三頁。

### 一、現況盤點與關鍵判斷

三頁的內容原本寫死在 `content/*.json`，由 `public/js/cms-render.js` 在瀏覽器端 fetch
`content/xxx.json` 填進 `#cmsPricing`／`#cmsCases`／`#cmsCourses`。
`public/content/` 是給瀏覽器讀的那份，`content/` 是 server 端那份，兩份內容相同。

**關鍵判斷：不能沿用 JSON 當可寫入的資料源。** Vercel runtime 的檔案系統唯讀，
後台按下儲存不可能寫回 `content/*.json`。所以內容搬進 Supabase，
JSON 降級成 fallback —— DB 掛掉、環境變數沒帶到、或資料表還沒建時，
前台仍顯示搬遷當下的內容而不是一片空白。

另一個判斷：`app/(public)/courses/page.tsx` 裡有一段寫死的掌中訣推廣區
（`#zzjStaticFallback`），原本只在「動態 promo 有渲染出來」時才被 JS 移除。
如果照舊，管理者在後台把主打課程「下架」之後，前台還是會看到那張寫死的舊卡。
所以改成：只要 `/api/site-content` 有回內容，就無條件移除它，DB 成為唯一真相。

`lib/site/services.ts` 的 `readServices()` 全站沒有人呼叫（死碼），
改成轉呼叫新的 `lib/site/content.ts`，不留第二份真相。

### 二、資料層

migration `supabase/migrations/20260901120000_site_content_cms.sql`：

- `site_services`（title／category／price／note／description／href）
- `site_cases`（title／category／summary／body／image）
- `site_courses`（title／audience／description／image ＋ **本次新增** schedule／location／
  price_text／href —— 「上架課程」真正需要寫的資訊）
- `site_course_promo`：單列表，`id text primary key default 'default' check (id = 'default')`，
  刻意鎖死，避免後台不小心生出第二個主打課程
- 四張表共用 `is_published` + `sort_order`，以及 `touch_site_content_updated_at()` trigger
- RLS 全開、`revoke all from anon, authenticated`、只 grant service_role
- `site-media` public bucket（10MB，jpg/png/webp/gif）。public 只影響「讀」；
  沒有建立任何 `storage.objects` policy，所以寫入只可能來自 service_role
- seed 區段用 `insert ... select ... where not exists`：只在表為空時寫入，
  重跑 migration 不會覆蓋管理者後來在後台改過的內容

seed SQL 是用腳本從 `content/*.json` 產生的，不手打中文，避免轉錄錯字。

### 三、程式層

- `lib/site/content.ts`（新）：唯一資料源。`readPublishedContent`（前台，只回已上架）、
  `readAllContent`（後台，含未上架）、`readCoursePromo`、欄位白名單、
  promo 的 snake_case ↔ camelCase 轉換。42P01 視為「還沒搬遷」而非壞掉。
- `app/api/site-content/route.ts`（新）：前台公開 GET，`s-maxage=30, swr=300`。
  出錯回 `ok:false` + 空陣列（HTTP 200），讓前端自己退回 JSON，不讓前台整頁空白。
- `app/api/admin/site-content/route.ts`（新）：GET／POST／PATCH／DELETE。
  `?type=services|cases|courses`，`type=promo` 走 upsert。
  POST 一律排到最後（`max(sort_order) + 10`）且**預設 `is_published=false`**，
  避免新建當下就見客。PATCH 支援 `move: up|down`，兩筆 sort_order 相同時用索引重算，
  否則對調後順序不會變。全部寫 `admin_audit_logs`。
- `app/api/admin/site-content/media/route.ts`（新）：圖片上傳，回公開網址。
  bucket 不存在時回可讀的中文提示而不是原始錯誤。
- `app/admin/_content-editor.tsx`／`_promo-editor.tsx`（新）：共用元件。
  `app/admin/site-services/page.tsx`、`app/admin/site-cases/page.tsx`（新，三分頁）。
  `_shell.tsx` 加 nav group「網站內容」。
- `public/js/cms-render.js`：`loadManagedContent()` 先打 `/api/site-content`，
  沒東西才退回四支 JSON；課程卡渲染新欄位（留空不顯示）；
  `fromApi && coursePromo` 時移除 `#zzjStaticFallback`。

### 四、驗證

- `npm run build` ✅（順帶解除 08-31 待辦第 1 項：build 是部署的前置關卡）
- `npx tsc --noEmit` exit 0 ✅ ／ `npm run test:unit` 169 passed、2 skipped ✅
- 套 migration **之前**先驗 fallback：`/api/site-content` 正常吐 JSON 內容（services 9／cases 4／
  courses 4／promo 掌中訣），確認搬遷失敗也不會開天窗
- migration 套進正式庫 `pvasgmmjrodukudbzuhp`（結構走 MCP `apply_migration`；
  seed 走一次性 node 腳本讀 `content/*.json` 寫入，語意與 migration 的 seed 相同，
  避免把 15KB 中文重打一遍）。SQL 核對：9／4／4／1 筆，全部上架
- 本機 dev + 臨時 `ADMIN_KEY` 打完整 CRUD：建立→**前台看不到**→上架→前台出現→
  上移順序正確→刪除→列表復原；圖片上傳後公開網址 `curl` 200
- 驗證用的測試課程與測試圖檔都已刪除，正式庫與 bucket 沒留殘料

### 五、遺留

- **未 commit、未部署。** 線上仍是舊行為（讀 JSON），無風險但新後台也還不能用。
- 後台 React 介面沒有用真的 admin 帳號在瀏覽器點過（API 層是 curl 實測的）。
  部署後要實點：三個分頁、圖片上傳、主打課程「儲存並下架」後 `/courses` 那張大卡是否消失。
- 部署後 `content/*.json` 只剩 fallback 用途；兩份 JSON 刻意保留不動當保命內容。

---

## 2026-09-02｜部署上線：8/31 與 9/01 兩批一起進正式站

### 起因

使用者說「我登入後台看不到老師可編輯服務跟上架課程的選項」，附網址與帳號 `306465@gmail.com`。

先排除權限：SQL 查 `profiles` → 該帳號 `role=admin`，不是權限問題。
再查正式站：`https://www.xunfeng.tw/api/site-content` 回 **404**，`git log` 最新仍是 8/26 的 `c694d0b`。
結論是**程式碼從未部署**，9/01 做的東西全都只在本機。

### 判斷

工作樹同時堆著 8/31 那批（分潤、面相報告、`/api/plans` 過濾）與 9/01 的 CMS。
兩批共用 `_shell.tsx` 與 `admin.css`，硬拆 hunk 的話容易拆出「nav 有連結但頁面不存在」的死連結。
問過使用者後裁示兩批一起上；順帶也把 8/31 待辦裡 `/api/plans` 裸露 `e2e_card_test` 的問題關掉。

### 執行

- 重跑 `npm run build` 確認仍綠
- 兩個 commit（共用的 UI 檔放在第二個 commit）：
  - `e6590bc` feat(referrals,face)
  - `0782bbd` feat(admin) 網站內容 CMS
- `git push origin main` → Vercel 自動部署，約 75 秒後 `/api/site-content` 由 404 轉 200

### 驗證（全部在正式站上做）

- `/api/site-content` 200：服務 9／案例 4／課程 4／主打「掌中訣」active
- `/admin/site-services`、`/admin/site-cases` 200；`/api/admin/site-content` 未登入 401
- 用瀏覽器實跑三頁，DOM 直接數：
  - `/courses`：`.course-promo-card` **只有 1 張**、`#zzjStaticFallback` 已消失、課程卡 4 張
    —— 這是最擔心的點（後台下架後前台仍顯示寫死的舊卡），確認正常
  - `/services`：9 張價格卡；`/cases`：4 張案例卡 + 7 張照片
- `/api/plans` 只回 basic／pro／vip

### 遺留

- 後台介面仍未用真人帳號實際點過（本機是用 `X-Admin-Key` 驗 API 層）。
  請實跑「新增→上傳圖片→上架→前台確認」與主打課程「儲存並下架」。
- 分潤零實跑、信用卡真刷未做、`e2e_card_test` 仍 active 需驗後停用。

---

## 2026-09-02（第二次）｜後台側邊欄改可折疊、區塊依使用頻率重排

### 需求

「側邊欄的網站內容、顧問服務要往上移到營運總覽底下，四象跟面相是屬於系統維護的模組，
可以放在最底下，每個區塊都要能折疊展開，目前是陳列式的展開，畫面會顯得比較凌亂。」

### 做法

- 區塊順序：營運總覽 → 網站內容 → 顧問服務 → 四象問天機 → 面相系統
- 標題本身即折疊開關。**預設只展開「目前所在的那一區」**，這是解決凌亂的關鍵：
  收合態整個側邊欄只剩 5 行，不是 22 行
- 使用者自己的展開／收合存 localStorage（`xunfeng_admin_nav_open`），換頁保留；
  但「目前所在的那一區」一律強制展開，避免點進去卻看不到自己在哪
- 收合但含當前頁時，標題旁一顆綠點；標題右側顯示該區連結數
- 展開的項目往內縮 + 左側導引線，看得出層級

### 驗證（沒有密碼時怎麼驗介面）

後台要登入才看得到，而我不該去拿使用者的密碼、也不該用 service role 幫他簽一個 session。
改用等效做法：把**真實的 `admin.css`** 與同構的 nav DOM 兜成一個獨立 HTML，
起本機 http server 用瀏覽器實跑，驗視覺與互動。

- `aria-expanded` 陣列在點擊前後由 `["true","true",…]` → `["true","false",…]`，
  `.admin-nav-group.open` 數量正確，收合後 `.admin-nav-dot` 出現
- 截圖確認：收合態乾淨、展開態有導引線、caret 有旋轉
- 部署後再比對正式站產物：CSS hash `71bb43b802e23029` 與本機 build 相同且含 `admin-nav-toggle`；
  `layout-8cf323e4ad9836aa.js` 內區塊順序與 localStorage key 都正確

### 遺留

仍未用真人 admin 帳號在正式站實際點過。請登入看一眼側邊欄，
並實跑「網站內容」的新增→上傳圖片→上架流程。

---

## 2026-09-02（第三次）｜結帳時「登入已過期」——會員買不到方案的 bug

### 回報

「訪客從推廣連結要購買 980 的方案，在輸入基本資料之後會跳出『登入已過期，請重新登入』」、
「訪客無法從推廣連結結帳」。

### 先查證，不要猜

先確認錯誤字串的唯一來源：`lib/auth/member.ts:83`，
`requireBearerProfile` 裡 `admin.auth.getUser(token)` 失敗時丟的。所以是 token 被伺服器拒絕。

再拉正式站 runtime log（Vercel MCP）：
- `00:57:51 POST /api/auth/login 200`
- `03:34–03:46 GET /api/member/me 401` 連續多筆，**期間沒有任何 login/register**
- `03:36:49`、`03:37:20` `POST /api/orders/create 401`

登入到結帳中間 2 小時 39 分。這不是推測了：token 早就過期。

### 根因

Supabase access token TTL 1 小時。`authResponse()` 明明有回 `refresh_token`，
但 grep 全專案 —— **沒有任何一行程式碼存過它**。前台只存 access token，
而且把「localStorage 有 token」直接當成「已登入」
（`member-pricing.js` 的 `handlePurchase` 只檢查 `token()` 非空）。

於是過期後畫面照常顯示登入中，使用者一路填完發票資料、按下結帳才 401。
不只結帳：面相、四象、會員中心在登入滿一小時後全都會 401。

### 修法上的取捨

有十幾個地方直接 `fetch(..., {Authorization: Bearer token})`（面相 4 處、四象 2 處、
會員頁、報告頁、admin shell…）。一個一個改成帶重送邏輯，風險與工作量都高。

改採兩層：
1. **`MemberSessionKeeper`（掛 root layout）**在背景把 localStorage 裡的 token
   維持在有效狀態 —— 既有頁面一行都不用改就受惠。
2. **`XFSession.fetch`（前台共用層）**在真的撞到 401 時換發並重送一次，當作第二道保險；
   結帳這條關鍵路徑另外在「開發票表單之前」先 `ensure()`，
   讓使用者在填表前就知道要重新登入，而不是填完才失敗。

### 產出

- `app/api/auth/refresh/route.ts`（新）
- `public/js/member-session.js`（新）、`components/MemberSessionKeeper.tsx`（新）
- `member-auth.js` 登入／註冊改存兩顆 token；`/login` 補上 `?reason=expired` 提示
  （順手發現 `showPaymentResult` 找的 `paymentBanner` 元素**全站不存在**，
  而且只在 `/member` 被呼叫，等於一直是死碼）
- `member-pricing.js` 加開表單前的 session 守門，並區分訪客／過期兩種提示文案
- `member-ai.js` 改走共用層

### 驗證（沒有密碼時怎麼驗登入流程）

不能也不該拿使用者的密碼，所以：
- 端點本身用 curl 真的打（空 body 400、壞 token 401），本機與正式站都驗
- 換發重送邏輯用 stub 驗：實際呼叫序列是
  `orders/create(Bearer stale)` → `auth/refresh` → `orders/create(Bearer fresh)`，成功且兩顆 token 換新
- 登入寫入用 stub 回假 session 驗：access 與 refresh **兩顆都進了 localStorage**
- `MemberSessionKeeper`：塞一顆 5 分鐘後到期的 token，開頁確實主動換發；換不到就清憑證
- 過期會員按「立即購買」→ 發票表單不再開啟，直接導登入頁並帶 `next`
- 訪客按「立即購買」→ 導登入頁但不顯示「已過期」
- 正式站部署後用瀏覽器再跑一次過期情境，提示文案與導向都正確

### 遺留

- **完整「登入 → 換發 → 結帳成功」沒有用真帳號跑過**，請本人實測一次。
- 既有已登入使用者手上沒有 refresh token，下一個動作仍會被要求重新登入一次，之後才會穩定。
- 24 小時內 register 是 0 筆 —— 訪客註冊後購買這條路從來沒有真人跑過。

---

## 2026-09-02（第四次）｜實測訪客推廣連結購買路徑

### 需求

「確認一下，訪客可以透過推廣連結完成購買嗎？」

### 做法：逐段實跑，不用程式碼推論

用正式站上真實存在的推廣碼 `ran81127`（賴仁豪，20%，03:32 建立），在瀏覽器上一段一段驗：

1. `/?ref=ran81127` → `ReferralCapture` 確實寫入 `xf_ref=ran81127`（90 天、SameSite=Lax、Secure）
2. 走到 `/member-pricing`，cookie 還在，三張方案卡正常
3. 訪客（清空 localStorage）按「立即購買」→ 導到 `/login?next=%2Fmember-pricing`，
   **且不顯示「登入已過期」**（第三次修正時特別把訪客與過期會員分開，這裡確認生效）
4. `/login` 上 cookie 仍在；按「建立新會員」切出註冊表單，`next` 參數保留
5. 註冊 API：格式錯誤 400；已存在的 Email 409（用管理員自己的 Email 測，**沒有建立任何帳號**，
   事後查 profiles 仍是 10 筆、最新 2026-07-16）
6. `orders/create` 讀 cookie → `resolveReferral` → 寫進 orders 的三個歸因欄位（程式路徑確認）

### 驗證途中發現並修掉的兩個坑

1. **重複註冊吐英文**：Supabase 原文 `A user with this email address has already been registered`
   直接回給使用者（422）。正在買方案的人看不懂也不知道下一步。
   改成中文並指路「請直接登入／忘記密碼」，回 409。
2. **發票抬頭空白**：`handlePurchase` 用 `ensure()` 拿到 member 後沒有餵回 `cachedMember`，
   剛換發完那一刻 `getMember()` 可能回先前失敗留下的空物件，抬頭與 Email 得自己重打。已修。

### 結論的分寸

除了「真的送出註冊」與「真的刷卡」兩步，其餘每段都在正式站跑通。
這兩步我做不到也不該做（建帳號要輸密碼、刷卡要真的付錢），
所以只能說「**路徑上找不到已知的阻擋點**」，不能說「已確認訪客買得到」。

至今 register 在 24 小時內仍是 0 筆 —— 這條路從來沒有真人走過。

### 遺留

- 請本人用**全新 Email** 實跑全程（推廣連結 → 註冊 → 購買 → 綠界 → 回站看點數），
  建議先用 `?plan=e2e_card_test` 的 NT$1 方案。
- 註冊成功後會回到 `/member-pricing`，但**要再按一次「立即購買」**，目前不會自動接續結帳。
  若要更順可以在 `?next=` 帶方案代碼回來自動開發票表單，尚未做。

---

## 2026-09-02（第五次）｜推廣連結先導註冊、註冊即終身綁定推廣人

### 需求

「點開推廣連結要先引導完成會員註冊，這樣才能綁在這個推廣人的帳號底下，
註冊方式可以簡化為手機註冊+email，這樣從推廣者進入的會員消費都可以認列在這個推廣者的帳號底下。」

### 先問清楚兩個會改變作法的分歧

「手機註冊+email」可以是「欄位變少但仍設密碼」，也可以是「簡訊 OTP 免密碼」——
後者要接簡訊商、要錢、要設定 Supabase Phone Auth，工作量差一個量級。
「先引導註冊」也有「置頂引導條 / 強制導頁 / 專屬落地頁」三種強度。

使用者裁示：**欄位簡化保留密碼** ＋ **直接強制導到註冊頁**。

### 核心：歸因從 cookie 改成「註冊綁定優先」

這才是需求真正要的東西。原本只看 `?ref=` cookie（90 天 last-touch），
清 cookie、換裝置、或中途點到別人的連結，業務就白帶了 ——
「我帶進來的人，他之後的消費都算我的」這個承諾兌現不了。

新增 `referralFieldsForOrder(admin, request, profileId)`：
1. `profiles.referral_code`（註冊當下綁的那位）→ 終身歸戶
2. 沒有才退回 cookie（給註冊時還沒綁定的既有會員）

`orders/create` 改用它。`courses/checkout` 沒有會員身分，維持只看 cookie 的舊函式。

### 強制導向的兩個坑（實作時特別處理）

1. **無窮迴圈**：`next` 若把 query 一起帶上，註冊完導回原頁又會看到 `?ref=` 再被攔一次。
   所以 `next` 只帶 pathname。
2. **不該攔的人**：已登入者（早就綁過了）、`/login`、`/reset-password`、
   `/admin`、`/admin-login`、`/thanks` 全部排除。

### 註冊表單

- 只剩 手機 / Email / 密碼，拿掉姓名
- 手機必填並正規化：`+886 912-345-678`、`0912-345-678` 都會變成 `0912345678`
- cookie 被擋時，註冊頁把網址上的 `?ref=` 一併送進 API 當備援
- 新增公開 `GET /api/referral/lookup?code=`，**只回名字**——這支完全公開，
  任何人都能猜代碼來打，所以絕不能吐分潤比例、聯絡方式或內部 id
- 註冊頁顯示「您是由 賴仁豪 推薦加入，完成註冊後即綁定這位推廣夥伴。」

### 驗證

- 正式站 lookup：正確代碼回名字；不存在與注入字串都回 null
- 註冊手機驗證：空 400、`1234` 400、`+886 912-345-678` 正規化通過
  （停在 409 已註冊，沒有建立任何帳號）
- 瀏覽器實跑正式站 `?ref=ran81127`：自動導到註冊頁、cookie 寫入、
  欄位只剩三個、推薦人 banner 正確顯示
- 已登入者帶 `?ref=` 不會被導走
- tsc / build / 169 tests 全綠

### 遺留

- **「註冊 → 下單 → 歸到該推廣人」沒有真人跑過**，因為我不能建帳號。
  請用全新 Email 從推廣連結註冊，下一筆單，去 `/admin/referrals` 看有沒有歸戶。
- 不再收姓名 → 發票抬頭不會自動帶入、後台姓名欄位會空，改以 Email／手機辨識。
- 強制導向會讓所有未登入訪客看不到首頁內容，跳出率若太高，
  改回「置頂引導條」只需改 `ReferralCapture` 一個分支。

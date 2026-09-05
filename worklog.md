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

---

## 2026-09-02（第六次）｜下單路徑伺服器端實測、推薦人文案調整

### 一、「到底能不能下單」——改用實測回答

使用者連問兩次，前幾次我只能給「找不到已知阻擋點」這種半吊子答案，
因為卡在「不能建帳號 → 不能取得 session → 不能打 orders/create」。

換個方式：**跳過 bearer 驗證，把 orders/create 的伺服器端流程原封不動跑一遍**。
寫了一支一次性 vitest（放 `lib/_verify/order-path.test.ts`，驗完刪除），打正式資料庫：

1. 980 基礎方案查得到、`is_active`、TWD ✅
2. 推廣碼 `ran81127` 啟用中、`commission_rate = 0.2` ✅
3. **訂單真的 insert 成功**，三個歸因欄位正確寫入，980 × 20% = 196 元 ✅
4. 綠界 `createCheckoutParams` 產出 64 碼 hex `CheckMacValue`、action URL 為 https ✅

驗證用訂單（`VERIFY` 前綴）測試裡就刪掉，事後再用 SQL 確認 0 筆殘留。

**這才是能給使用者的答案：除了「按下建立帳號」那一下，每一段都驗過而且通過。**

教訓：碰到「我沒有憑證所以驗不了」的時候，先想「有沒有辦法把那一段隔離掉單獨驗」，
而不是直接把不確定丟回給使用者。

### 二、文案

「完成註冊後即綁定這位推廣夥伴」→「趕快來完成註冊吧」。
前者在講系統內部行為，訪客不在乎；後者是行動呼籲。

### 三、驗證

- 正式站 chunk 比對：新文案 1 次、舊文案 0 次
- 瀏覽器實跑：500ms 內導到註冊頁、cookie 寫入、banner 文案正確、欄位只剩三個
- 中間有一次取樣顯示沒導向，重測兩次都正常且部署產物含導向邏輯，
  判定是前一次測試殘留的取樣時序問題

### 四、遺留

仍然只差真人按下「建立帳號」。請用全新 Email 從 `?ref=ran81127` 註冊，
走到綠界付款頁即可（不必真的刷），然後去 `/admin/referrals` 看歸戶。

---

## 2026-09-02 收工紀錄

本日共六批工作、10 個 commit，全部已 push 並部署，`main` = `origin/main` = `07fda5c`。
逐批細節見上方各節，這裡只留三件值得帶到下次的判斷。

### 一、最有價值的一次除錯：結帳「登入已過期」

使用者的描述是「填完基本資料後跳登入已過期」。**沒有從描述去猜，而是先確認
錯誤字串的唯一來源（`lib/auth/member.ts:83`），再去撈正式站 log 對時間軸**：
登入 00:57:51、結帳 03:36:49，中間 2 小時 39 分沒有任何 login。根因當場確定。

修法上刻意避開「改十幾個 fetch 呼叫點」的大重構，改成在 root layout 掛一個
背景保鮮元件，讓既有頁面一行都不用動。**選擇低風險的施力點，比把每個地方都改對更重要。**

### 二、被連問兩次「到底能不能下單」之後學到的事

前兩次我只能回「找不到已知阻擋點」，因為卡在「不能建帳號 → 不能拿 session →
不能打 orders/create」。第三次才想到：**把那一段隔離掉單獨驗** ——
寫一支一次性 vitest，跳過 bearer 驗證、直接把伺服器端流程對正式庫跑一遍，
訂單真的 insert、歸因欄位真的寫入、分潤真的算得出 196、綠界簽章真的產得出來。

**碰到「我沒有憑證所以驗不了」時，先問「能不能把不能驗的那一步隔離掉」，
而不是把不確定原封不動丟回給使用者。**

### 三、今天有兩次「使用者以為壞了，其實是沒部署」

第一次是後台看不到「網站內容」選單（程式碼躺在本機沒 push）。
之後改成每次做完就 commit + push + 等部署 + 用正式站產物比對（chunk hash / 內容 grep）確認，
才回報完成。這個習慣要維持。

### 四、遺留

**只差「真人按下建立帳號」。** 下次開工第一件事：用全新 Email 從
`https://www.xunfeng.tw/?ref=ran81127` 註冊，走到綠界付款頁即可（不必真的刷），
然後到 `/admin/referrals` 確認訂單歸到賴仁豪名下。

---

## 2026-09-04｜課程後台修復與主打課程頁改善

### 本次工作

1. 處理老師回報「後台課程上架無法編輯課程日期」：
   - 查明後台課程卡的 `schedule` 只是顯示文案，實際結帳日期來自另一張 `course_products`，且原本沒有管理介面。
   - 新增管理 API 與「報名課程設定」介面。
   - 前台報名摘要改為從結帳 API 同步真正的日期、時間、地點與價格。
2. 處理後台左側功能區塊名稱過小：
   - 確認原設定只有 10px，調整為 15px，提高對比與點擊範圍。
3. 重設主打課程推廣頁：
   - 由單一長表單改為四步驟工作流程。
   - 新增狀態摘要、即時內容／海報摘要與固定操作區。
4. 處理老師反應頁面文字仍偏小：
   - 區塊標題 20px、欄位名稱 15px、輸入文字 16px、說明 13px、按鈕 15px。
   - 報名課程設定與主打推廣表單一併調整。

### 重要判斷

- 課程卡顯示資料與實際結帳商品資料原本分離，不能只修改 `schedule`；必須讓後台直接修改 `course_products`，前台也讀同一資料源。
- 主打課程頁的主要問題是資訊架構，而非單純裝飾不足，因此優先建立操作層級與流程，再提高字級。
- 報名系統目前只有一個固定商品代碼；本次維持低風險單課程模式，不擴張成多商品 CMS。

### 產出與提交

- `536d63d fix(courses): allow editing registration date`
- `cc2fc24 fix(admin): enlarge sidebar section labels`
- `c7ff948 feat(admin): redesign course promotion editor`
- `185c294 fix(admin): improve course promotion readability`

### 驗證

- TypeScript：通過。
- 單元測試：169 passed、2 skipped。
- Production build：每批均通過。
- 第一批 Vercel deployment：Ready。
- 正式課程頁資料同步標記與正式側邊欄 15px CSS 曾完成線上比對。
- 後兩批 UI 的 Vercel 狀態查詢因權限審查服務回 404，無法完成正式站二次核對；Git push 與本機 build 均成功。

### 遺留事項

- 真人登入後台驗收四步驟主打課程介面及放大後的字級。
- 修改一次真實課程日期，確認前台與結帳同步。
- 若未來要同時販售多門課，需另做多課程商品管理。
- 既有推廣歸因真人驗收、信用卡真刷與正式服務設定仍待完成。

## 2026-09-04（晚）｜課程上架：海報上傳失敗與影片無法更新

### 問題

使用者回報後台「主打課程推廣」不能上傳圖片、也沒辦法更新影片。

### 調查

- 正式庫 `admin_audit_logs`：9/3 11:03 一張 2.9MB PNG 有成功，之後沒有任何成功上傳紀錄。
- 舊上傳路徑 `POST /api/admin/site-content/media` 把整個檔案送進 Vercel function；
  Vercel serverless request body 上限 4.5MB，UI 卻寫 10MB。超過 4.5MB 的海報在進 function 之前
  就被 Vercel 擋掉（回 HTML 的 413），前端只看到「上傳失敗」，也不會留下任何 runtime log。
- 影片欄位原本只有「mp4 檔網址」文字框，根本沒有上傳功能；前台 `cms-render.js`
  也只用 `<video type="video/mp4">`，貼 YouTube 連結不會播。
- 順帶發現本地 `20260901120000_site_content_cms.sql` 與遠端版號 `20260901154318` 不一致
  （又是 MCP `apply_migration` 直接套的），`supabase db push` 會拒絕；已把本地檔名改名對齊。

### 修正

- 新增 `POST /api/admin/site-content/media/sign`：後台換一個 Supabase signed upload URL，
  瀏覽器用 XHR 直接 PUT 到 Storage，不再經過 Vercel。圖片限 10MB、影片限 200MB。
- `_content-editor.tsx` 的 `ImageField` 改為通用 `MediaField(kind: image | video)`，含上傳進度條、
  影片預覽；`ImageField` 保留為 wrapper，案例／服務／課程列表不用改。
- 主打課程推廣「宣傳影片 1／2」改為可直接上傳 MP4 / WebM / MOV，或貼 YouTube / Vimeo / mp4 網址。
- 前台 `cms-render.js` 新增 `renderPromoVideo`：YouTube / Vimeo 用 iframe 嵌入，檔案依副檔名給正確 MIME。
- migration `20260904120000_site_media_video.sql`：`site-media` bucket 放寬到 200MB 並允許
  video/mp4、video/webm、video/quicktime。以 `supabase db push` 套用正式庫（沒有用 MCP）。
- 舊的 `/media` route 保留，只更新 migration 檔名提示。

### 驗證

- `npx tsc --noEmit`、`npm run test:unit`（169 passed、2 skipped）、`npm run build`、`git diff --check` 全通過。
- 正式 Storage 直傳 E2E（service_role 簽 URL → 純 PUT）：1KB PNG、64KB MP4、6MB MP4 皆 200，
  公開網址 HEAD 200 且 content-type 正確；不帶 apikey 也能上傳。測試物件已刪除。
- 正式庫 bucket 查詢：`file_size_limit=209715200`、mime 含三種影片格式。
- Vercel `dpl_2uE9tEFywTAf4jpmfTjjgRSaa9Xw` READY，alias 含 `www.xunfeng.tw`。
- 正式站：`POST /media/sign` 未登入回 401 JSON（route 已上線）；`cms-render.js` 含新 renderer；
  正式 CSS 含 `.promo-video-embed`。

### 遺留

- 尚未以真人 admin 帳號在正式後台實際點「上傳影片」跑一次；storage 端與 route 端各自驗過，
  但瀏覽器端整條 XHR 流程還沒真機驗收。
- ~~Supabase 全域上傳上限~~ 已處理：實測 55MB PUT 回 413 `EntityTooLarge`（全域預設 50MB）；
  以 Management API `PATCH /v1/projects/{ref}/config/storage` 把 `fileSizeLimit` 調到 209715200（200MB），
  之後 55MB、150MB 直傳皆 200。此設定不在 migration 內，重建專案時要記得再調。
- 真人後台驗收：Chrome 自動化被權限分類器擋下，無法代操；需使用者本人登入後台實際上傳一次。
- iPhone 直出的 .mov（HEVC）在 Chrome 不一定能播，建議老師上傳 MP4（H.264）。

Commit：`1930692 fix(admin): upload posters and videos directly to storage`

### 真人驗收回報（21:56）

使用者上傳一張圖並儲存，30 秒後前台沒出現。查證：13:56:03 `media_sign` 210KB JPG 成功、
13:56:11 `promo_update` 成功，圖片存在 `video_cover`（影片封面）欄位，不是海報欄位。
`video_cover` 只當 `<video poster>` 用，宣傳影片 1、2 皆空，所以前台沒有任何地方會顯示。
9/3 那張 2.9MB PNG 也是同樣狀況。上傳鏈路本身沒有問題。

處置：標籤改為「影片預覽圖（只在有宣傳影片時顯示）」、加說明、欄位移到影片欄位之後，
後台在「有預覽圖但沒有影片」時顯示警告。海報 1 標籤加註「前台輪播第一張」。

## 2026-09-04（持續開發 Loop）｜課程資料安全同步與歸因回歸

### 本次工作與重要判斷

- 用 Playwright 重跑正式課程頁時發現：頁面先出現過期的 115 年第一期，API 回來後才變成第二期。因為這會在慢網路誤導學員，不再以過期假資料當 fallback。
- 首屏改為讀取狀態，結帳按鈕在 API 成功前鎖定；失敗時維持鎖定並顯示清楚錯誤。
- 新增推廣歸因測試後抓到破損 `%` cookie 會讓 `decodeURIComponent` 例外，改為安全視為無歸因，因為錯誤推廣碼絕不能阻斷下單。

### 產出檔案

- 課程首屏與結帳防護：`app/(public)/courses/page.tsx`、`public/js/course-checkout.js`。
- 歸因防護與測試：`lib/referral/attribution.ts`、`lib/referral/attribution.test.ts`。
- 課程回歸測試：`lib/site/course-checkout-regression.test.ts`。
- HTML 報告：`docs/reports/2026-09-04-continuous-development-verification.html`。
- 瀏覽器證據：`output/playwright/`。

### 驗證與遺留

- 176 tests passed、2 skipped；TypeScript、production build（101 頁）、`git diff --check` 全數通過。
- 正式站課程、手機版、推廣導流、cookie 與後台保護皆實際以瀏覽器驗過。
- 本機 production build 用 API 503 故障注入驗證鎖定路徑，再移除 mock 驗證正常解鎖路徑。
- 仍有需管理員帳號／新 Email／真實金流的營運 E2E，本輪沒有擅自建帳號、更動正式資料或產生費用。
- Commit `063d18a` 已 push；Vercel `dpl_Au7hG5XjbtbxUDfEJfJDDi3e39Jb` Ready 且別名含 `www.xunfeng.tw`。正式 HTML 已無過期 6/21 內容，當期 API 仍正確回傳 2026-10-17。

## 2026-09-04（深夜）｜/courses 改為 Landing Page、後台新增「課程上架」

### 需求

使用者：「課程上架的介面很奇怪，不是一般課程的上架介面；前端課程報名頁也沒有 Landing Page 的視覺效果，
比較像專欄文章。」要求呼叫帳號內的 agent 解決。

### 分工

- `course-planner` agent：產出 Landing Page 十區段資訊架構與後台七分頁欄位規格（`scratchpad/landing/ia-spec.md`）。
- `copywriter` agent：產出各區段預設文案（只用已知事實，無杜撰數字或見證）（`scratchpad/landing/copy.md`）。
- 主線：資料模型、前後台實作、樣式、本機截圖驗收。

### 實作

- **DB**：`20260904150000_course_landing_fields.sql` 在 `site_course_promo` 新增 hero_stats、pain_title/points、
  outcome_title/outcomes、curriculum_title、curriculum(jsonb)、instructor_*、info_note、faqs(jsonb)、
  testimonials(jsonb)、guarantee_text、seats_text、sticky_cta_hint；jsonb 加 array 型別約束；
  seed 只填空白欄位，`register_url` 由 `#courseCheckout` 改 `#register`。已 `supabase db push`。
- **lib**：`lib/site/content.ts` 擴充 CoursePromo 型別、PROMO_FIELDS、`sanitizePromoList`（jsonb 清單白名單與長度上限）；
  新增 `lib/site/course-product.ts`（讀報名商品＋日期／時間／價格／倒數格式化）。
- **API**：`PATCH /api/admin/site-content` promo 支援三個 jsonb 清單欄位。
- **前台** `app/(public)/courses/page.tsx`：改為 server component（`revalidate = 30`）直接讀 DB 渲染，
  不再依賴 cms-render.js 注入；移除三段 force-hide／remove-fallback hack。區段：固定報名列（捲過 Hero 出現、
  進報名表隱藏）、Hero、痛點、學完你能、大綱時間軸、影片、講師（含兩張演講照）、見證、課程資訊四格（地點可開地圖）、
  FAQ（details）、注意事項、既有報名表（欄位 id 原封不動）、其他課程講座頁尾清單。
  本頁隱藏全站 `.xf-mobile-cta` / `.floating-ai`，避免與報名列打架。
- **後台**：新增 `/admin/course-launch`（`_course-landing-editor.tsx`）七步驟編輯器，含清單編輯器
  （上移／下移／刪除）、右側「前台區段檢查」、預覽前台連結；`CourseProductEditor` 支援 embedded 內嵌為 STEP 1。
  側欄「網站內容」新增「課程上架」；`/admin/site-cases` 移除主打課程分頁。刪除 `_promo-editor.tsx`。
- **CSS**：`styles/site.css` 追加 `.cl-*` 區塊（mobile first）；`admin.css` 追加步驟導覽與清單編輯器樣式。

### 驗證

- tsc、`npm run build`（/courses 為 ISR 30s）、`test:unit` 176 passed / 2 skipped、`git diff --check` 通過。
- 本機 `next start` 對正式 DB 截圖：桌機 1280 與手機 390 全頁各區段正常；固定報名列在 Hero 與報名表區自動隱藏、
  中段顯示；手機不再出現「開始問天機」列。
- 正式庫 seed 確認：curriculum 5 單元、faqs 6 題、instructor 已填、register_url=#register。

### 正式站核對

- 部署 READY 後以 headless Chromium 截圖核對：桌機 Hero／大綱／講師與手機版皆正常；`/admin/course-launch` 回 200。
- 手機固定報名列的文字被全站 `.btn { width:100% }` 擠成 0 寬，補 `.cl-sticky .btn { width:auto !important }` 後正式站量測 info 219px／btn 105px。

### 遺留

- 學員見證目前空白（不杜撰），老師取得同意後可在「講師與信任」步驟自行新增。
- 仍是單一商品 `zhangzhongjue-115-01`；多課程需另做商品管理。

### 真人驗收回報（後台）

使用者：課程大綱單元與 STEP 5 FAQ 的輸入欄位被擠到變形。
原因：`.admin-form-grid` 只讓 `label.admin-form-wide` 橫跨整列，清單編輯器包在 `div.admin-form-wide`，
整個編輯器被塞進一格 180px 欄位。已改為任何直屬 `.admin-form-wide` 子項都橫跨，格線子項補 `min-width:0`，
清單列內的格線改 220px 起跳。Commit `4995af0`，正式站 CSS bundle 已確認含修正。

### 真人驗收回報（報名區）

使用者：報名區「課程報名／115年第二期｜綠界付款保留名額／說明文字」互相壓字，整區難讀，報名按鈕不明顯。
原因：沿用全站 `.section-head` 左右並排＋`.section-title .title-line { white-space: nowrap }`，長副標直接壓到右側說明。

重排（page.tsx + site.css）：
- 標題改單欄：課程報名／期別＋日期／三步驟（填資料→綠界付款→名額保留）。
- 表單為主欄（1.3fr）、摘要卡側欄 sticky；表單分四個編號區塊：報名身份、基本資料、學習背景（選填）、發票資訊。
- 結帳區塊：「本次應付」＋金色大按鈕，按鈕文字直接寫金額（course-checkout.js `syncPrice` 同步）。
- 所有表單 id、name、欄位順序不變，綠界流程未動。

交給 Codex（`codex exec`，附書面計畫）處理三個細節：金色按鈕被後載入的 member.css `.btn` 蓋掉→提高特異度
`.cl-register .cl-form .cl-submit`；640px 以下應付金額直排 22px 不折行；959px 以下摘要卡 `order:-1` 移到表單前，
手機隱藏信任清單與 LINE 連結。Codex 第一次因 `codex exec` 在非 TTY 下等 stdin 而卡住，改加 `< /dev/null` 重跑成功。

驗證：tsc、build 通過；本機截圖桌機／手機：按鈕 computed 為金色漸層＋深色字、文字「前往綠界結帳｜NT$ 6,000」。

### 真人驗收回報（海報未出現）

使用者：上傳的課程圖片沒有出現在報名頁。查證：Storage 只有兩張上傳（9/3 PNG「為什麼古代軍師掐指一算」、
9/4 JPG「五術掌訣實修班」），兩張都被存進 `video_cover`；新版「課程上架」上線後沒有任何 media_sign 或
promo_update 紀錄，代表使用者還沒在新後台重新上傳。直接以 SQL 把兩張改為 poster_main／poster_second，
原「掌中訣開班授課」QR 海報退到 poster_third，清空 video_cover。ISR 約 10 秒後正式站 Hero 已顯示三張輪播。

### 真人驗收回報（海報沒有完整呈現）

- 現況：Hero 海報框固定 3:4，手機再套 46vh 上限，海報縮成一小張且底部被切換圓點蓋住；一次只看到一張。
- 改法：舞台高度改由「目前顯示那張」決定（其他張絕對定位疊底），不裁切、不留黑邊；圓點改成三張縮圖放海報下方，
  一眼看到全部、點縮圖切換；拿掉手機高度上限與舊 `.promo-poster-carousel` 的 max-height。
- 本機驗證時發現 `next build` 會沿用 `.next/cache/fetch-cache` 的舊資料，看到舊海報；清掉再 build 即正常。
  正式站 ISR 沒有此問題（改 DB 後 10 秒內更新）。

### 需求：第二區塊改為「多圖少字」

- 新增 `gallery` jsonb（migration `20260904170000_course_gallery.sql`，已 push）。
- 前台 Hero 下方新增「課程圖片牆」：海報 1～3 自動排前，再接後台上傳的課程圖片（最多 12 張，可加一句說明）；
  1～4 張等寬完整顯示，5 張以上第一張放大拼貼；點圖放大（自製 lightbox，Esc／點背景關閉）。
- 痛點區往後移，只留四張短句卡片；`body` 長段落前台不再顯示，後台欄位標示「目前前台不顯示」。
- 後台 STEP 6 改名「海報、圖片與影片」，加入圖片牆清單編輯器（每列可直接上傳）；區段檢查表加「課程圖片牆」。

### 修正：課程介紹圖不是輪播、不是圖片牆

使用者指正：一般課程頁的介紹圖不會掛在 Hero 底下用輪播。改為：Hero 右側只放一張主視覺（海報 1），
Hero 下方「課程介紹圖」一張接一張往下滿版堆疊（海報 2、3 → 後台介紹圖清單），不裁切、不輪播、不放大燈箱。
移除 carousel／lightbox script 與縮圖列；後台 STEP 6 欄位改名「主視覺／課程介紹圖 1、2／更多課程介紹圖」。

### 需求：STEP 6 圖片可拖曳排序

- 後台 STEP 6 改為單一「圖片順序」清單（`ImageOrderEditor`）：第 1 張＝Hero 主視覺、其餘依序為課程介紹圖；
  桌機拖曳「⋮⋮」換位（原生 HTML5 DnD），手機用 ▲▼；每列可直接上傳、加一句說明、刪除。
- 儲存時整串寫進 `gallery`，並同步前三張到 poster_main/second/third（向下相容、固定報名列預覽）。
- 前台 `gallery` 有內容即以它為完整順序（第 1 張 Hero、其餘介紹圖）；gallery 空的舊資料才退回海報 1～3。

### 收工（23:5x）

- 收工驗證：tsc 通過；test:unit 一個失敗——`course-checkout-regression.test.ts`（另一個開發迴圈 `063d18a` 加的）
  斷言舊字串 `button.textContent = "前往綠界結帳"`，本 session 已改為解鎖後由 `syncPrice` 寫入含金額文字；
  行為不變，更新斷言後 176 passed／2 skipped。
- `handoff.md` 覆寫為單一最新摘要，另一 session 的交接原文移到附錄。
- 發現同一 repo 有另一個 Claude session（navide pane）並行提交；接手前先 `git pull`。

## 2026-09-05｜註冊贈點防刷：同一支手機只發一次

### 起因

使用者提出：會員方案是完成註冊就送點數，發現有人用同樣手機號碼、不同 email 重複註冊賺點。

### 先查資料再談對策

正式庫 16 個 profile，重複手機 3 組，但拆開看只有 1 組是真的：

| 手機尾碼 | 狀況 |
|---|---|
| `...916` | 自己的 admin（306465）＋ 一個 member 測試帳號 |
| `e2e...` | e2e 測試帳號 ×2 |
| `...098` | 真實案例：6/16 註冊用掉 20 點，**7/16（trial 到期當天）**換 email 再領 30 點 |

關鍵不是「有人在囤點」，而是**他想再看一次報告**。而制度上第二次只有兩條路：付 980，或換 email。

### 制度在逼人刷

- 贈點 30 點；單次消費 20 點（`lib/auth/tier.ts:18`、`lib/auth/face-tier.ts:1`）
- 所以免費額度＝**1 次報告 ＋ 10 點死點**，那 10 點做不了任何事
- basic 980 元／106 點 → 1 點約 9.25 元，30 點約值 **277 元**，只換一個 email
- `profiles.phone` 是裸 `text`（`0001_init.sql:8`），無 unique、且**從未驗證**。
  抓到的這位其實沒在躲——他老實填了同一支號碼

分成 P0 防刷、P1 產品面（真解）、P2 SMS OTP 三層，今天只做 P0 ＋ 提出 P1。

### 協作工具確認

使用者要求先確認能不能調用 Codex 與 agy：

- **Codex 可用**：`codex-cli 0.153.2`，model `gpt-5.6-sol`，實跑通過。
  兩個非致命警告：Cloudflare MCP 的 OAuth token 過期；skill 太多導致描述被截斷。
- **agy 起不來**：`~/.local/bin/agy`，登入是活的（`agy models` 抓得到清單），
  但送 prompt 就死在 `calling model: invalid project ID: "G-Anti"`。
  換 model、`--new-project` 都一樣；`~/.navide`、shell profiles、gcloud config 都找不到這個字串，
  代表綁在帳號／伺服器端，本機改不到。使用者裁示「agy 之後再處理」。
- 背景跑 codex 時要 `< /dev/null`，否則它會卡在 `Reading additional input from stdin...`。

### 第一版（SELECT 檢查）與 Codex 的打臉

第一版寫 `hasPhoneClaimedTrial()`，查同手機的其他 profile 有沒有 `trial_signup` 交易。
派 Codex 做獨立繞道審查，回報兩個**真缺陷**：

1. **併發雙領**：先查後寫、無鎖無唯一約束。同手機不同 email 同時送兩個註冊，兩邊都通過檢查。
2. **半完成寫入**：entitlement 先建、交易後寫。第二步失敗 → 人有 30 點但系統沒有領過的證據，下次還能再領。

也就是第一版**沒有真正達成「同手機只發一次」**。這是交付缺陷不是理論風險，所以重寫。

Codex 同時確認的好消息：

- 全專案只有 `/api/auth/register` 會寫出 `source = trial_signup`（`/api/register` 只是 re-export）。
  登入、refresh、`requireBearerProfile` 補建 profile、課程結帳、啟用碼、付款、後台調點都不會拿到註冊 trial。
- Supabase 端沒有自動建 profile 或自動發點的 trigger。
- `normalizeTaiwanMobile` 的 unicode 變形（全形數字、零寬空白、`+886(0)`、中點…）全部會被
  registerSchema 拒絕，無法製造出第二個有效的正規化字串。

### 第二版：把不變條件放進 DB

`supabase/migrations/20260905100000_trial_phone_claims.sql`

- `trial_phone_claims`：以正規化手機為 primary key，**PK 本身就是併發鎖**。
  `profile_id` 用 `on delete set null` 而非 cascade——刪帳號不該能重領。
  RLS 開啟且不給任何 policy，只有 service_role 碰得到。
- 回填既有 `trial_signup` 紀錄，否則新規則上線後舊帳號的手機還能再領一次。
- `grant_signup_trial(profile, phone, credits, days)` RPC：認領＋建 entitlement＋寫交易
  在同一個 transaction，要嘛全成要嘛全退。手機正規化不過回 `invalid_phone`，**不是照發**
  （對 277 元的贈品，無法確認資格時的正確行為是不發）。

TS 端 `grantTrialIfEligible()` 退化成薄包裝，只負責正規化手機與翻譯回傳值。

### 驗證（本機 Postgres，無 Docker 所以沒用 supabase start）

開暫時庫 `xf_trial_test` 建最小 schema，真的把 migration 跑起來：

- 循序：全新手機 granted／同手機換 email `phone_already_claimed`／同 profile 重複 `already_granted`／
  空字串與 null 都回 `invalid_phone`
- **併發**：A 開 transaction 領點但不 commit，B 中途插入 →
  B 被鎖 **2192ms** 後回 `phone_already_claimed`，該手機總共只發 1 份。
  這正是第一版會雙發的情境
- **原子性**：用 trigger 強制最後一步失敗 → 認領表／entitlement／交易**三張表零殘留**，
  且該手機沒被誤鎖，移除 trigger 後仍能正常領
- 測試庫已 drop

正式庫 dry-run：回填會鎖 10 支手機。新規則若早就上線，16 個 profile 中
**只會擋掉 1 個，就是那個真實濫用案例，零誤傷**。

`npx tsc --noEmit` 通過；`npx vitest run` 22 files / 184 passed、2 skipped。

### 一併修掉的謊話

`public/js/member-auth.js` 原本寫死「註冊成功，已贈送 30 點免費體驗」。
不發點的情況下這句話是騙人的，改成用後端回的 `notice`，
而且沒拿到點時導向 `/member-pricing` 而不是 `/member-ai`（進去也沒點可用）。
歡迎信同理：`sendRegistrationEmail` 收到 `undefined` 會整段略過贈點區塊。
Admin 通知信會標示「疑似換 Email 重複註冊，請留意」。

### 遺留

- **`supabase db push` 尚未執行**，功能還沒生效；未 commit、未部署。
- Codex 另指出 `app/api/courses/checkout/route.ts:15,166` 建 profile 時電話沒正規化，
  會在 `profiles.phone` 留非正規化字串。不影響本控制（課程 profile 不會有 `trial_signup`，
  且日後同 email 註冊時 upsert 會覆蓋），屬資料衛生，建議之後統一。
- P1 產品面沒動：中間價位單次加購、10 點死點的出口、trial 到期前後的信。
  這三件才是真解——6/16 那位是想再買的人，被當成資安事件處理了。

### 收尾：migration 已上正式庫

使用者裁示用 MCP 直接套（非 `supabase db push`）。`apply_migration` 成功後查核：

- 回填 10 列，全部對得到 profile，無格式異常
- RLS 啟用、0 個 policy（前端完全讀不到）
- `grant_signup_trial` 為 security definer；`anon`／`authenticated` 不可執行，`service_role` 可執行
- 正式庫實測拒絕路徑：已認領手機 → `phone_already_claimed`；`0912·345·678` 與 null → `invalid_phone`；
  0 點 → `invalid_grant_params`。探測後認領筆數仍為 10，無副作用

程式尚未 commit／部署。DB 先就緒不會有空窗風險——舊程式不認識這個 RPC，行為與先前相同。

使用者同時拍板 P1 三項都要做：單次報告加購（199～299）、10 點死點的出口、trial 到期前後的信。

## 2026-09-05（下午）｜結帳流程與面相模組稽核

使用者裁示：單次加購訂 **199 元**；**保留 30 點的死點**（刻意的沉沒成本設計，
讓會員覺得「還有點沒用完很可惜」而轉付費）。並要求檢查兩件事。

### 檢查一：會員方案結帳流程

Codex 走查全鏈，我自己複驗最嚴重的兩條。

**阻斷級（已用正式資料佐證）**

1. **付款成功可能永久不開通，綠界重送也救不回**（`app/api/payments/ecpay/notify/route.ts:59`）
   - 早退 `if (currentOrder.status === "paid") return ecpayText("1|OK")` 擋在補開通邏輯
     （113–121 行的 `source_order_id` 冪等檢查）**之前**
   - 訂單先在 63 行標 `paid`，entitlement 才在 121 行建立。中間掛掉 → 500 → 綠界重送 → 早退 → 永遠不開通
   - **正式資料：5 筆已付款訂單有 2 筆沒開通**。所幸兩筆都是 1 元 e2e／invoice 測試單
     （`XFINV9683892823`、`XFE2E9682771251`，無 provider_trade_no），真實付費的 980／1980 都正常開通。
     尚未傷到真客戶，但程式路徑已複驗為真
2. **重複購買不是續訂**：每次付款新增獨立 entitlement，點數不疊加、效期從付款當下重算
   （`notify/route.ts:121-131`）。而讀取端一律只取「到期日最晚」那一筆
   （`lib/auth/member.ts:240`、`ai/chat/route.ts:37`、`ai/council/route.ts:68`）→ 舊點數實質消失。
   方案頁卻寫「NT$980 / 月」（`public/js/member-pricing.js:58`），但綠界參數是單次 AIO、沒有定期定額
3. **付款回站完全不顯示結果**：`/api/payments/ecpay/return` 導向 `/member?payment=paid&order=...`，
   但 `app/(public)/member/page.tsx` **完全沒有讀 `payment` 或 `order`**（grep 零命中）。
   舊版 `member-auth.js:94` 有那三段文案，新版 React 頁沒載入
4. notify 只核對金額，未核對 `MerchantID`、currency、TradeNo 一致性
5. 內部測試方案可公開購買：`/api/plans?include=` 放行 `e2e_` 開頭方案，
   而 `orders/create` 只檢查 `is_active=true`（`app/api/orders/create/route.ts:15-24`），沒擋內部方案。
   `e2e_card_test`（1 元）目前在正式庫仍 is_active=true

**摩擦級**：未登入按購買不保留選定方案（`member-pricing.js:337` 的 next 沒帶 planCode）；
ATM／超商沒有繳費資訊與期限；關掉綠界後站內查不到 pending 訂單（正式庫現有 1 筆 980 的
`as9122***` 掛單，2026-09-04 建立未完成）；同方案可無限重複建單；
點數不足的錯誤訊息沒有購買按鈕；新版會員中心 token 過期不自動 refresh。

**小瑕疵**：方案頁出現「偽 GPT 聊天用」字樣（`member-pricing.js:84`）；
點數被寫成「可用次數」（`member-auth.js:173`、`member-ai.js:27`）與實際計價不符；
底層英文錯誤會直接顯示給使用者。

### 檢查二：面相模組是否真的用面相學理

**結論：架構是對的，AI 沒有自由發揮的空間。** 三層拆開：

1. **視覺層**（`lib/face-analysis/vision.ts`）：`faceVisionResultSchema` 是 `.strict()`，
   只准回傳可見幾何（contour／relativeWidth／relativeHeight／symmetry／visibility／illumination）。
   健康、人格、年齡欄位在 schema 層就被拒絕，模型無法夾帶推論。
   `vision-http.ts:60` 沒有合成／假資料 fallback，未設定 provider 直接 throw
2. **規則層**（`applyFaceRules`）：確定性比對。教材規則來自 DB `face_teaching_rules`
   （正式庫 **67 條 published**），老師可在後台增刪改。DB 空了才回退程式碼內建約 40 條
   （`teaching-rules.ts:155`）
3. **撰稿層**（`report.ts`）：**LLM 拿不到照片**，只拿 `rules` 結構化結果。
   instructions 明寫「不得重新分析照片，也不得加入輸入沒有的事實」，
   命中的條文必須寫進對應宮位並記 `citedTeachings`

安全分級（`teaching-rules.ts:15-19`）：standard 進會員報告／high 用改寫過的 member_text／
critical 只給老師版。教材原文與望診健康只存在 `model_trace.teacherAudit`，
不在 `PUBLIC_RUN_FIELDS`，會員 API 讀不到也不會送進撰稿模型。

**實跑佐證**（18 份 completed）：

| 期間 | 命中教材條文 | 說明 |
|---|---|---|
| 2026-08-19～08-30（5 份） | 7～10 條 | 規則上線後，都有流年與斑痣對應 |
| 2026-08-13～08-17（13 份） | 0 條 | `face_teaching_rules_version` 為 null，規則功能上線前的舊報告 |

**兩個要修的缺口**

1. **知識卡通道 100% 休眠**：`knowledge.ts:7` 過濾
   `status='published' AND auto_report=true AND safety_level='standard'`，
   但正式庫 28 張全部 `auto_report=false`，safety_level 是 high(15)／critical(13)，
   **沒有一張 standard** → 查詢永遠回空。18 份報告的 `knowledge_sources_used` 全是 0。
   （分級本身合理——含望診健康——但等於這條通道從未啟用）
2. **沒有硬性閘門**：教材命中 0 條時報告仍會產出，只靠 prompt 指示
   （`report.ts:25`、`report.ts:418`）要模型自己說「沒有命中老師條文」。
   `analyze/route.ts` 從頭到尾沒有 `teachings.length` 的檢查。
   歷史那 13 份 0 命中的報告就是這條路的產物

### 修復實作（1～5 全做）

使用者裁示「做 1~5」。

**1. 付款開通原子化 + 可補救**（migration `20260905120000_paid_entitlement_atomic.sql`）

新增 `commit_paid_entitlement` RPC，把「建 entitlement ＋ 寫點數交易 ＋ 續訂結轉」收進單一 transaction，
以 `source_order_id` 冪等。route 端拿掉 `notify/route.ts:59` 的早退，改成 `alreadyPaid` 旗標
——訂單已是 paid 時仍會往下走，讓綠界重送能把缺的開通補上。

**2. 續訂規則**：剩餘點數疊加、效期從 `max(現有到期日, now)` 往後延，舊 entitlement 歸零並標記 expired，
點數轉移在 `credit_transactions` 留 `plan_renewal_carryover` 紀錄。
併發用 `pg_advisory_xact_lock(user_id)`——新會員在 member_entitlements 沒有列可鎖，
用 `select for update` 會讓兩張並行訂單各自算錯結轉。

本機 Postgres 實測（暫時庫 `xf_pay_test`，測完 drop）：

| 情境 | 結果 |
|---|---|
| 首購 basic | provisioned=t，106 點／30 天 |
| 綠界重送同一張單 | provisioned=f，entitlement 仍為 1 張 |
| 剩 26 點時再買 basic | 132 點（106+26），到期日 10-05 → 11-04（不是從今天重算），舊的歸零 expired，合計無重複計算 |
| 同會員兩張訂單並行 | 序列化，第二張結轉第一張的 106 → 212，只剩 1 張 active |

正式庫已 `apply_migration`，並用真實已開通訂單 `XF20260902053337F066` 驗證冪等分支：
`provisioned=false`、entitlement 與 credit_transactions 筆數皆未變。

**3. 付款結果頁 + 訂單追蹤**

- 新增 `app/api/member/orders/route.ts`：會員查自己的訂單，`activated` 以 entitlement 是否存在為準
  （不能只看 `orders.status`，「已付款但沒開通」正是要讓人看見的狀態）
- `app/(public)/member/page.tsx`：讀 `?payment=` 與 `?order=`，輪詢 10 次 × 2 秒直到開通；
  讀完就 `replaceState` 清掉網址參數。逾時不說失敗，改說 ATM／超商要等繳費、信用卡稍後重整
- 同頁列出未完成訂單（pending，或 paid 但未開通），解掉「關掉綠界後站內查不到那張單」
- `styles/member.css` 補 `.my-payment-banner`、`.my-open-orders`

**4. 面相硬性閘門**（`analyze/route.ts:109`）

`rules.teachings.length === 0 && rules.photoFingerprint.length === 0` 時直接擋下，
不出報告也不扣點，寫 `analysis_blocked_no_doctrine` 事件。
原本只有 prompt 指示（`report.ts:25`、`report.ts:418`）是軟約束，擋不住純 AI 推理的報告。
順手擴充 `safeErrorCode`：支援帶 `code` 屬性的錯誤，使用者看中文、稽核記英文代碼
（原本 `FACE_REPORT_PROVIDER_TIMEOUT` 這類字串會直接顯示給使用者）。

**知識卡沒有動。** 28 張全是 `auto_report=false`／safety_level high 或 critical，
裡面含望診健康。把安全旗標翻成 standard 等於把健康敘述推進會員報告，
這要老師自己審過才能決定，不是我該代勞的。

**5. 文案與內部方案**

- `member-pricing.js:86`「偽 GPT 聊天用」→「AI 即時問答用」
- `member-auth.js:177`「可用次數」→「可用點數」；`member-ai.js` 兩處「剩餘 N 次」→「剩餘 N 點」
  （報告 20 點、聊天按字數，寫「次」會讓人誤判可用量）
- `orders/create/route.ts` 擋掉 `e2e_` 內部方案。但 handoff 有「NT$1 真刷測試」待辦，
  所以留 `ALLOW_INTERNAL_PLAN_CHECKOUT=true` 環境變數當明確開關（預設 false，已寫進 `.env.example`），
  放行時會 `console.warn`
- CLAUDE.md 點數表標註「偽 GPT」是內部代號、不得出現在前台

### 驗證

`npx tsc --noEmit` 通過；`npx vitest run` 22 files / 184 passed、2 skipped；`npx next build` 通過。

### 遺留

- 正式庫仍有 2 筆「已付款未開通」的 1 元 e2e／invoice 測試單（2026-05-25）。
  程式已修好，但綠界不會再重送這麼舊的單。是測試資料，未處理
- `as9122***` 2026-09-04 建立的 980 pending 訂單仍在，現在會出現在該會員的「未完成訂單」清單裡
- 未 commit、未部署

## 2026-09-05（傍晚）｜199 單次加購上線、後台刷退可行性評估

### 199 元單次報告加購

`supabase/migrations/20260905140000_single_report_addon.sql`

- `plans` 加 `is_addon` 欄位；新增 `single_report`（NT$199 / 20 點 / 30 天 / is_addon=true）
- **關鍵設計：加購不延長效期。** 直接沿用上午做的續訂結轉邏輯的話，
  199 元會變成「多送 30 天訂閱效期」，那不是加購該有的行為。
  `commit_paid_entitlement` 加 `p_is_addon`：有有效方案 → 點數併進去、到期日不動；
  沒有方案 → 才用 duration_days 給自己 30 天
- **踩到的坑**：加帶預設值的參數會產生「另一個」函式而不是取代，
  6 參數與 7 參數並存會讓呼叫變成 `function is not unique`。
  migration 裡先 `drop function ...(uuid,uuid,uuid,integer,integer,text)` 再建，
  正式庫已確認 `pg_proc` 只有 1 個 `commit_paid_entitlement`
- **定價檢查**：199/20 ≈ 9.95 元/點，比 basic 的 980/106 ≈ 9.25 元/點還貴一點，
  所以不會侵蝕月方案，只是給輕度使用者的入口

程式端：

- `lib/auth/tier.ts` 與 `lib/auth/face-tier.ts` 都是**寫死的允許清單**，
  沒把 `single_report` 加進去會變成「買了不能用」。兩處都補了
- `lib/payments/orders.ts` 的 `Plan` 型別加 `is_addon`；notify 查詢帶 `is_addon` 並傳進 RPC
- `/api/plans` 回傳 `is_addon`，排序改成 `is_addon asc, price asc`
  （加購排在月方案後面，不該搶在主要方案前面當錨點）
- `member-pricing.js` 加 preset（`points: null` 讓報告／聊天拆解的防呆守衛自動跳過）、
  按鈕文字「單次加購」、點數列說明「已有方案時沿用原到期日」
- **順手修了「/ 月」**：綠界走單次 AIO 沒有定期定額，寫「/ 月」會讓人以為每月自動扣款。
  改成 `/ 30 天`，加購則是 `/ 單次`。這原本在 Codex 稽核的「未處理」清單裡，
  但加購一定不能寫「/月」，順手一起改掉

本機實測（暫時庫 `xf_addon_test`，測完 drop）：

| 情境 | 結果 |
|---|---|
| 有 basic（106 點，到期 10-05）加購 | 126 點，到期仍 10-05 ✓ |
| 沒有方案直接買加購 | 20 點，到期 = 今天 +30 天 ✓ |
| 對照：再買一次 basic | 232 點，到期 10-05 → 11-04（照常延長）✓ |

正式庫已 `apply_migration`，`tsc` / `vitest` 184 passed / `next build` 全過。

### 後台刷退可行性評估（研究，未實作）

**結論：技術上做得到，但有一個很硬的風險 —— 綠界這支 API 沒有測試環境。**

綠界信用卡請退款 API（`https://ecpayment.ecpay.com.tw/1.0.0/Credit/DoAction`）：

- Action：`C` 關帳（已授權）／`R` 退刷（要關帳、已關帳）／`E` 取消關帳（要關帳）／`N` 放棄（已授權）
- **加密機制與現有程式完全不同**：不是 CheckMacValue(SHA-256)，而是
  JSON POST + `RqHeader.Timestamp`（10 分鐘內有效）+ `Data` 欄位做
  **AES-128-CBC / PKCS7，key=HashKey、iv=HashIV，先 URLEncode 再加密再 Base64**。
  現有 `lib/payments/ecpay.ts:8` 的 `createCheckMacValue()` **不能重用**，要另寫 adapter
- **測試環境不可用**（綠界明載「因無法提供實際授權，故無法使用此 API」）→ 第一次驗證只能拿正式環境的真實交易做
- 21 天內要完成關帳，超過就不能用 API 關帳；90 天後系統自動放棄
- 綠界帳戶餘額不足無法退刷
- 分期與紅利折抵交易必須全額退刷，只有一般交易可部分退款
- 這支是信用卡專用，ATM／超商退款不走這裡

現有程式面（Codex 盤點）：

- `app/admin/orders/` 與 `[id]/` 是**純查詢介面**，沒有任何寫入動作。
  列表的「已退款」只是顯示與篩選條件（`app/admin/orders/page.tsx:25`），不代表有退款能力
- `app/api/admin/orders/route.ts` 只有 GET，沒有 POST/PATCH/PUT/DELETE
- `orders.status` 的 check constraint **已允許 `refunded`**（`0001_init.sql:27`），
  但沒有 `refunded_at`、`refund_amount`、`refund_reason`、操作者、綠界回應碼
- `payments` 表是 upsert 在 `(provider, merchant_trade_no)` 唯一鍵上，
  **同一張訂單只有一列**，存不了多次退款嘗試 → 需要另建不可覆寫的 `refunds` / `payment_operations`
- 權限：`lib/auth/admin.ts:5` 的 `X-Admin-Key` 是共用密鑰且 audit log 的 `admin_user_id` 會是 null。
  刷退屬高風險財務動作，應限具名 admin
- 發票：`issue-invoice-from-order.ts:12` 已經是 **EZPay**（CLAUDE.md 說「adapter 尚未改寫」是過期資訊，
  但 `.env.example:55` 仍列 `ECPAY_INVOICE_*`，實際讀的是 `EZPAY_INVOICE_*` → 環境設定缺口）。
  EZPay config 已組出作廢與查詢 URL（`ezpay-config.ts:38`）、DB 有 `voided/voided_at/void_reason`
  （`0008_invoices.sql:44`）與 `provider_trans_no`，但**程式只實作 `issueInvoice()`，沒有 `voidInvoice()`**

**點數回收是最麻煩的一段，而且是我今天改壞的：**

上午做的續訂結轉會把舊點數併進新 entitlement 並把舊的歸零
（`20260905120000_paid_entitlement_atomic.sql`）。所以「取消這張訂單的 entitlement」
會連同結轉進來的舊點數一起收回，是錯的。加上 `credits_remaining >= 0` 的 constraint，
已用掉點數的訂單無法直接扣回。這需要先定商業政策（只收未使用部分／按已用折價／轉人工），
不是純技術問題。

另外 `app/api/admin/credits/route.ts:68` 現有的人工扣點用 `Math.max(0, current + amount)`，
餘額 20 卻扣 100 時實際只歸零，但 ledger 仍記 `-100` → 帳實不符。**不可以拿它來做退款回收。**

## 2026-09-05（夜）｜後台半自動退款

使用者裁示「按照建議先做半自動」。綠界 `Credit/DoAction` 沒有測試環境，
第一次驗證只能拿正式交易做，所以這一版**不呼叫綠界**：
實際退款由管理員到綠界廠商後台操作，系統負責事前試算與事後原子化登錄。
未來接 API 時 `refunds.method` 從 `manual_ecpay` 換成 `api_ecpay` 即可，資料模型不用動。

### 資料模型（`20260905160000_manual_refunds.sql`，已上正式庫）

- `orders.status` constraint 加 `partially_refunded`（原本只有 `refunded`，表達不了部分退款）。
  套用前確認正式庫現有狀態只有 cancelled(12)/paid(5)/pending(1)，都在新允許清單內
- **`refunds` 表：只新增不修改**，每次退款動作一列。
  `payments` 是 upsert 在 `(provider, merchant_trade_no)` 上、一張訂單只有一列，
  存不了多次退款嘗試，所以退款不能寄生在那裡
- 點數三欄 `credits_expected / credits_reclaimed / credits_shortfall` 都留著，
  才看得出「錢退了但點數已經被用掉」
- `admin_profile_id` 與 `admin_email` 都 **not null** —— 退款是財務動作，不接受匿名
- RLS 開啟、0 policy，只有 service_role 碰得到

### 兩個 function

- `preview_order_refund(order_id)`：唯讀試算。回傳訂單金額／已退／可退／本單發出點數／
  目前可收回點數／有效方案到期日／發票號碼與狀態。給 UI 在按下確認前顯示
- `commit_manual_refund(order_id, admin_profile_id, admin_email, amount, reason, provider_reference)`：
  一個 transaction 內完成「寫退款紀錄 ＋ 回收點數 ＋ 更新訂單狀態 ＋ 同步課程報名狀態」

**點數回收政策**：收回「本訂單發出的點數」與「目前實際還剩的點數」之中較小者，
部分退款按金額比例折算應收點數。已被用掉的部分記在 `credits_shortfall`，
**由管理員決定現金要退多少 —— 系統只負責算清楚，不替生意做決定**。
與開通、扣點共用同一把 advisory lock，避免退款收點數時使用者正在跑報告扣點。

### 本機實測（暫時庫 `xf_refund_test`，測完 drop）

| 情境 | 結果 |
|---|---|
| 980 元 /106 點，已用 80 點剩 26，全額退 | 應收 106、實收 26、短少 80；訂單 refunded、點數歸 0、ledger 記 `refund -26` |
| 重複退已全額退款的訂單 | 擋下：「只有已付款的訂單可以退款（目前狀態：refunded）」 |
| 980 元退 490（一半） | 應收/實收各 53、狀態 `partially_refunded` |
| 已退 490 再退 600 | 擋下：「退款總額 1090 超過訂單金額 980」 |
| 再退剩下的 490 | 狀態轉 `refunded` |
| 原因留空白 / admin_profile_id 為 null | 各自擋下 |
| 課程訂單全額退款 | `course_registrations` 同步變 `refunded`（否則簽到表還看得到人） |

正式庫已 `apply_migration`，並用真實訂單 `XF20260902053337F066` 跑過唯讀試算：
可退 980、本單發出 106 點、目前可收回 136 點（106 本單 + 30 結轉），
所以收回上限是 `min(106,136)=106`，不會超收；發票 `FU30473350 / issued` 也正確抓到。
權限確認：refunds RLS 開啟 0 policy、anon 與 authenticated 都不可執行 RPC。

### 程式

- `lib/auth/admin.ts` 新增 `requireNamedAdmin()`。這個函式原本**重複實作在
  face-provider-approval 與 gemini-provider-approval 兩個 route 裡**，一併收斂到共用位置
- `app/api/admin/orders/[id]/refund/route.ts`（新）：
  GET 試算 + 退款歷程；POST 登錄退款，寫 `admin_audit_logs`（action `order_refund_manual`）。
  只允許具名管理員
- `app/admin/orders/[id]/page.tsx`：新增「退款」區塊 —— 試算數字、退款表單
  （金額／原因必填／綠界備註）、**必須勾選「我已經在綠界後台完成這筆退款」才能送出**、
  已開立發票時明確提示要另外到 EZPay 後台作廢、下方列出退款歷程表
- 列表與詳情頁的 `statusLabel`、列表篩選、`admin-pill` 樣式都補了 `partially_refunded`

`tsc` / `vitest` 184 passed / `next build` 全過。

### 刻意沒做

- **不呼叫綠界 API**（沒有測試環境，這是本階段的核心決定）
- **發票作廢／折讓**：EZPay 只實作了 `issueInvoice()`。UI 會提示要人工處理，但系統不碰
- **效期回溯**：續訂會延長到期日，退款沒有把它縮回去。牽涉結轉後的效期歸屬，
  目前讓管理員自行判斷，UI 有顯示到期日

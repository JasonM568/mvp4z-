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

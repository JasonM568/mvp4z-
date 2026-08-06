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

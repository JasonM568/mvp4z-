# Handoff（最新摘要，覆寫式）

更新：2026-10-08｜上一版（至 2026-10-08 之前的累積交接）已封存於 `docs/handoff-archive/handoff-until-2026-10-08.md`；逐日紀錄看 `worklog.md`。

## 1. 目前狀態

- 正式站 `https://www.xunfeng.tw` 正常運作。**信用卡真實刷卡已驗證可收款**（使用者回報，ECPay 正式 MID `3325455`；我未查對應訂單／點數開通／EZPay 發票，建議抽查一筆）。
- 本輪工作＝**易學決策報告（`/api/ai/council`）QA ＋ 修補 ＋ 後台奇門校對**。QA 全文：`docs/qa/council-qa-2026-10-07.md`。
- 最新 commit：`8e1bf7a`（main，已推送）。收工時已確認 `24629ca` 與前一個部署皆 READY。

## 2. 本輪已完成（皆已部署；除非註明）

| 項目 | 內容 | 驗證 |
|---|---|---|
| B1（原 BLOCKER） | 並行請求會全部通過點數預檢，撞 `CR002` 後「報告照送、不扣點」→ 一份點數換多份報告。修法：每位會員同時只允許 1 份進行中（`council_inflight` 表＋`acquire/release_council_slot`，TTL 330s），搶不到回 409 `COUNCIL_IN_PROGRESS`；前端 409 時保留第一份的找回紀錄 | 正式站並行 4 份：修前交付 4／扣 20／3 份免費；修後交付 1／扣 20／其餘 409（約 4 秒）／無殘留 slot |
| C1／C2 | 輸入欄位長度與個數上限；生辰與事件時間範圍（年 1900–2100、月日時分）＋國曆真實日期檢查；錯誤訊息中文 | 正式站：2/30、月=13、年=-99999、年='abc'、地點 61 字 皆 400 未扣點；vitest 29 條含前端預設表單五種術數組合 |
| C3 | **判斷不加每分鐘速率限制**（B1 後實際 ≤約 0.6 份／分，409 不呼叫 LLM） | — |
| 每人每日 20 份 | 使用者決策；台北日曆日、含備援稿；429 `COUNCIL_DAILY_LIMIT` 不扣點；檢查在搶到 slot 之後 | 正式站：19 假＋1 真 → 200；第 21 份 429、不扣點 |
| C4（新發現） | 完整寫入失敗後的「精簡版備援寫入」缺 `request`（NOT NULL）→ 必定 23502，保命路徑從沒成功過。已抽成 `lib/ai/council/run-row.ts` | 單元測試讀 0004 migration 比對必填欄位；**未在正式站觸發真實失敗驗證** |
| 後台字體 | admin.css 58 處＋內聯 70 處，小於 16px 的字級 +約 2px | tsc／build 通過；**未看實際畫面** |
| 後台奇門校對簽核 | `/admin/qimen-review`（選單：四象問天機→奇門校對簽核）。三盤例由伺服器用已發布流派現算；老師逐盤回報一致／有差異；三盤一致才簽核；簽核存 `qimen_signoffs`（append-only），綁 `QIMEN_RULE_VERSION`；需具名管理員；寫 audit log。報告提示詞：未簽核→要 AI 明說「奇門定局法尚待老師校對」，已簽核→印拍板人與日期；流派簽核與奇門校對**獨立** | 正式站 API 冒煙：非管理員 403、三盤現算、試排、4 種不合法簽核皆 400、寫入「有差異」紀錄後已刪。**簽核通過路徑只有單元測試，未在正式站實測（避免產生假簽核）** |

## 3. 修改／新增檔案（重點）

- `app/api/ai/council/route.ts`（slot、每日上限、奇門簽核載入、精簡備援列）
- `lib/ai/council/{inflight,run-row,schema}.ts`、`lib/auth/council-quota.ts`
- `lib/yixue/qimen/{qimen,review}.ts`（`QIMEN_RULE_VERSION`、盤例與格式化）、`lib/yixue/format/prompt.ts`
- `lib/school-settings/qimen-signoff.ts`
- `app/api/admin/qimen-review/{route,preview/route,signoff/route}.ts`、`app/admin/qimen-review/page.tsx`、`app/admin/_shell.tsx`（選單）
- `app/member-ai/decision/page.tsx`（409 還原找回紀錄）、`app/admin/admin.css` ＋ 17 個後台頁面（字級）
- Migrations（**已套用到正式庫 `pvasgmmjrodukudbzuhp`**）：`20261007100000_council_inflight_slot.sql`、`20261007120000_qimen_signoffs.sql`
- 測試／腳本：`lib/ai/council/{qa-schema,inflight,run-row}.test.ts`、`lib/auth/council-quota.test.ts`、`lib/yixue/qimen/review.test.ts`、`lib/school-settings/qimen-signoff.test.ts`、`scripts/qa-council-concurrency.mjs`
- 文件：`docs/qa/council-qa-2026-10-07.md`、`docs/specs/yixue-engine/SCHOOL-DECISIONS.md`（盤例一補註）、`CLAUDE.md`／`README.md`／`docs/SYSTEM_ARCHITECTURE.md`（刷卡 gate 已解除）

## 4. 驗證結果（本機，最後一次）

- `npx tsc --noEmit` 無錯誤；`npx vitest run`：549 passed／2 skipped；`next build` 成功（奇門頁面與 API 皆在建置輸出）。

## 5. 未完成事項與風險

1. **奇門簽核：等風羿老師**。三張盤例＋定局法勾選＋簽核。盤例在後台 `/admin/qimen-review`（也在 `SCHOOL-DECISIONS.md` 第 263 行起）。**簽核前不要把奇門判讀當定論**；提示詞已要求 AI 明說，但**我沒有檢查過 AI 實際輸出是否真的講出這句話**。
2. **⚠️ 流派設定疑點（待老師確認）**：正式站已發布流派 v2（2026-09-08）是 `lateZiDayPillar: same`＋`earlyLateZiHourPillar: split`。盤例一（23:30）因此出現「日柱甲子、時柱丙子」的混合組合（日柱用當日、時干依隔日日干起），與流派說明書「日柱若不進位，時柱多半也不分」不一致。奇門以時柱定旬首，時柱若改為甲子整張盤會變。**我沒有動這項設定**。後台校對頁已顯示並警示。
3. 後台新字級與奇門校對頁**沒有人看過實際畫面**（尤其手機寬度的九宮格）。
4. 置閏法、茅山法未實作；老師若實際用這兩種需另排工。
5. 正式庫留有測試帳號 `qa-council-b1@example.com`（profile `9a4359b5-46a9-4397-bf9d-1bd28703bf44`，餘額 0，約 7 筆真實測試報告）。**使用者要求保留**。重跑腳本前需把餘額調成要的值。本輪實測共燒約 9 份 LLM 報告費用。
6. 既有未結：`.env.example` 仍列舊 `ECPAY_INVOICE_*`（實際讀 `EZPAY_INVOICE_*`）；發票無作廢／折讓；Supabase custom SMTP（Resend）未接；奇門以外的 UAT 項目未實跑。
7. 若管理員測試帳號壓測，會受每日 20 份限制，需換帳號。

## 6. 待辦優先順序

1. （部署已於收工時確認 READY）
2. 通知老師：打開 `/admin/qimen-review` 比對三盤並簽核；同時請他確認晚子時組合是否本意（若要改，到「排盤流派設定」調整後再比對）。
3. **瀏覽器雙分頁實測**：兩個分頁同時送出 → 只產出一份、只扣 20 點、被擋分頁有明確提示、原分頁／重開後能找回報告（前端 409 還原邏輯只有程式檢查，沒實測）。
4. **備援報告不扣點、Gemini 退避、斷線復原**的正式站實測。
5. 逐項勾 UAT 清單（在 QA 文件）。
6. **第二個 QA 模組：訂單與金流**（建單、綠界 webhook 冪等、`CheckMacValue`、發票）；先抽查剛成功的那筆真實刷卡。
7. 視老師回覆決定是否做置閏法／茅山法。

## 7. 下次起手式

```bash
cd /Users/jasonmchen/codex-巽風系統/xunfeng-official-v2
git status --short --branch && git log --oneline -5
# 讀：本檔 → worklog.md 最末幾段 → docs/qa/council-qa-2026-10-07.md
```

- 推送若遇 GitHub `Internal Server Error`：`git -c http.version=HTTP/1.1 push origin HEAD`（本輪連續 7 次失敗、改這個就成功）。
- 部署狀態用 Vercel MCP `list_deployments`（projectId `mvp4z`、slug `tjs-projects-435187fd`），**別高頻輪詢正式站**（會觸發 Security Checkpoint）。
- QA 帳號取 token：用 service role 對該帳號 `auth.admin.updateUserById` 設密碼後 `signInWithPassword`（腳本思路在本輪 scratchpad，未入庫；需要時重寫即可）。
- 並行實測：`node scripts/qa-council-concurrency.mjs --token=… --base-url=https://www.xunfeng.tw --n=4`（會真的扣點、打 LLM，只用測試帳號）。

## 8. Git 狀態與長時間程序

- 分支 `main`，與 `origin/main` 同步，工作樹乾淨（最新 `8e1bf7a`）。
- 無長時間程序在執行；Vercel 部署皆 READY。
- 本輪我未改動：老師的流派設定、`ai_school_profiles`、任何真實會員資料。唯一寫入正式庫的非程式資料是 QA 帳號相關列，與已套用的兩個 migration。

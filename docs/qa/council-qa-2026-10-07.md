# 易學決策報告 QA（2026-10-07）

範圍：`POST /api/ai/council`、`lib/ai/council/*`、`commit_council_credit`（migration 0007）、前台 `/member-ai/decision`。
方法：讀碼 + 純 schema 自動化測試（已跑）。**並行與 E2E 腳本尚未對線上／測試環境執行**（會扣點、打 LLM）。

## 測試矩陣

| 功能 | Happy | Unhappy | 邊界 | 並發 |
|---|---|---|---|---|
| 身分驗證 | 有效 Bearer 通過 | 無 token 401／過期 401 | token 剛過期 | 同 token 並行 |
| 方案／效期 | active 且未到期 | 無 entitlement 403；plan 不含 council 403 | expires_at = now | 兩張 active entitlement：只取最晚到期那張，另一張點數用不到（待產品確認） |
| 點數預檢 | 餘額 ≥ 20 | 餘額 19 → 不足錯誤 | 餘額剛好 20 → 扣到 0 | **N 並行、餘額 20（QA-B1）** |
| 輸入驗證 | 最小請求通過 | question 1 字／2001 字／純空白／缺欄位／非字串 擋下（已測） | 2 字、2000 字通過（已測） | — |
| 輸入驗證（巢狀） | 完整生辰通過 | 年=-99999、月=13、日=99、年='abc' **會通過**（QA-C2，已測） | place／numbers／yao／qimen 無上限（QA-C1，已測） | — |
| 注入 | — | SQLi／XSS 字串視為純文字（已測）；prompt injection 須人工看報告 | — | — |
| 三模型 Council | 三家成功 | 單一 provider 失敗仍出稿；全失敗走備援 | 終稿 110s 逾時 | 兩家同時 429 |
| 備援報告 | 終稿不可用 → 備援 | 備援不扣點、不耗免額度 | — | — |
| 扣點原子性 | 成功 → debit + credit_transactions 一致 | RPC 失敗 → 送報告、charged=0、credit_warning | CR001／CR002 | **CR002 = 免費送出（QA-B1）** |
| 寫入歷史 | council_runs 成功 | 完整寫入失敗 → 精簡版 → 仍失敗給 persist_warning | — | — |
| 斷線 | 回應完整 | 瀏覽器斷線：伺服器仍扣點，前端用 PENDING_KEY 復原（待實測） | — | 重複點擊「開始」 |

## 發現

### BLOCKER
**QA-B1　並行送出：一份點數換多份報告（讀碼推得，待實測）**
`route.ts:107` 預檢與 `:270` 扣點之間隔著 7 次 LLM（可長達數分鐘）。N 個並行請求都讀到 `previousCredits=20`、都通過預檢、都跑完整 Council；第一個扣點成功，其餘撞 `CR002`（0007 的樂觀鎖），程式選擇「報告送出、credits_charged=0」（`route.ts:278-288`）。
結果：餘額 20 點可換 N 份報告，每份燒 7 次 LLM 的成本；任何人用兩個分頁就能觸發，不需要惡意。
先前的設計是有意為之（避免 LLM 成功卻丟報告），但現在正式刷卡已通，這是直接的營收與成本漏洞。
建議：呼叫 LLM **之前**先在 DB 做「進行中」保留（每位會員同時只允許 1 個進行中的 council，例如 `council_runs` pending 列 + partial unique index，或 advisory lock），結束時釋放；或預扣點、失敗退回。
驗證：`node scripts/qa-council-concurrency.mjs --token=… --n=5`（測試帳號、餘額先調成 20；exit 1 即重現）。

### Critical
**QA-C1　巢狀欄位無長度／個數上限**（已用測試重現）
`birth.place`、`meihua.numbers`、`liuyao.yao`、`qimen.direction/time` 等都能塞到 Vercel 請求上限（約 4.5MB），會被複製進 6 次以上的 LLM prompt，放大成本與逾時風險；超過模型 context 時 LLM 全失敗 → 走備援報告（不扣點）→ 成本由站方吸收。
建議：`place ≤ 60`、`numbers ≤ 3`、`yao ≤ 6`（且限定列舉值）、qimen 欄位 ≤ 40。

**QA-C2　生辰數值無範圍檢查**（已重現）
年=-99999、月=13、日=99、時=99、年='abc' 都通過 schema。`buildChartForCouncil` 失敗會降級為 chart=null，會員拿到沒有排盤依據、仍扣 20 點的報告。
建議：schema 層限制年 1900–今年、月 1–12、日 1–31、時 0–23、分 0–59，並以曆法驗證實際存在的日期（例如 2 月 30 日）。

**QA-C3　沒有速率限制**　`/api/ai/council` 無 per-user 頻率／並行限制（讀碼，未發現）。與 B1 同根，修 B1 後仍建議加 per-user 每分鐘上限。

### Minor
- QA-M1　多張 active entitlement 只取最晚到期者（`route.ts:77`），其餘張點數用不到。需產品確認是否預期。
- QA-M2　`getPlanCode` 找不到方案時回 `"free"`，`free` 不在 TIER_DEFAULTS → 403，行為正確但訊息指向「請升級」，可更明確。
- QA-M3　`readJson` 對壞 JSON 回 `{}` → 走「請輸入問題」，訊息不精確（不影響安全）。

## 自動化腳本

1. **已完成、已通過**：`lib/ai/council/qa-schema.test.ts`（8 passed、7 expected-fail 對應 C1／C2）。
   `npx vitest run lib/ai/council/qa-schema.test.ts`。修好 schema 後，把 `it.fails` 改回 `it`。
2. **待執行**：`scripts/qa-council-concurrency.mjs`（B1）。
3. **Playwright 範例（雙擊送出）**：
```ts
import { test, expect } from "@playwright/test";
test("連點「開始」只能送出一次", async ({ page }) => {
  let hits = 0;
  await page.route("**/api/ai/council", async (r) => { hits++; await new Promise(s => setTimeout(s, 3000)); r.fulfill({ status: 200, json: { ok: true, final: { ok: true, text: "x" }, credits_charged: 20 } }); });
  await page.goto("/member-ai/decision"); // 先以測試帳號登入、填完表單、勾選同意扣點
  const go = page.getByRole("button", { name: /開始|送出/ });
  await go.dblclick(); await go.click({ force: true });
  await page.waitForTimeout(3500);
  expect(hits).toBe(1);   // 前端防線；伺服器端防線仍須由 B1 修補
});
```

## 效能與壓力提案

- 單份報告 = 3（第一輪）+ 3（第二輪）+ 1（終稿）= 7 次 LLM；`maxDuration=300`，終稿單次 110s 不重試。
- 目標：正式站同時進行 ≤ 5 份、p95 < 240s、錯誤率 < 2%（含備援不算錯誤）。
- 瓶頸假設：Gemini 429／逾時（正式庫曾 45 次中 41 成功）；終稿 110s；Vercel 並行 function 數；`council_runs` 的大 JSON 欄位寫入。
- 方式：先在測試帳號以 n=1、3、5 階梯跑；看 `council_provider_calls` view 的失敗分布與備援比例；過程不可使用真實會員帳號。
- 成本護欄：每次壓測前確認 provider 帳單上限。

## UAT 清單（客戶逐項勾選）

- [ ] 新會員註冊後可看到 30 點，進入「易學決策」頁
- [ ] 啟動前出現扣點說明，未勾選同意不能送出
- [ ] 只勾八字／只勾奇門／四術全勾，報告只出現所勾的術數
- [ ] 報告含：關鍵點、反證、時間節奏、三項內風險、3／7／30 日行動、停損條件
- [ ] 報告完成後點數正好少 20，歷史紀錄找得到該份
- [ ] 點數不足（< 20）時被擋下，且沒有任何扣款
- [ ] 報告生成中關閉分頁，重開後可找回結果／狀態
- [ ] 備援報告出現時，點數沒有被扣
- [ ] 性別未選時被擋在送出前
- [ ] 兩個分頁同時送出，只會產出一份、只扣一次（**B1 修好後才能勾**）
- [ ] 後台「Council 紀錄」與「Token 用量」能對上該份報告
- [ ] 奇門遁甲判讀已由風羿老師比對三張盤例（**未完成，目前不可視為定論**）

## 測試總結

**BLOCKER（阻擋「對外開放」）**：QA-B1 並行免費送出。
**必須修（Critical）**：QA-C1 欄位上限、QA-C2 日期範圍、QA-C3 速率限制。
**可延後（Minor）**：QA-M1～M3。
**驗收通過（僅限已驗證範圍）**：question 長度與型別檢查、context 上限、未宣告欄位被剝除、SQLi／XSS 字串不影響 schema。
**尚未驗證**：真實扣點與 CR002 行為、斷線復原、Gemini 退避、備援報告不扣點、UAT 全部項目（需測試帳號與實跑）。

## 修補紀錄：QA-B1（2026-10-07，**已部署並於正式站實測通過**）

- 作法：每位會員同時只允許 1 份進行中。LLM 開跑前先搶 slot，搶不到回 409（`code: COUNCIL_IN_PROGRESS`）；`finally` 一律釋放；slot 有 330 秒 TTL，function 被 kill 也會自己過期。
- 檔案：`supabase/migrations/20261007100000_council_inflight_slot.sql`、`lib/ai/council/inflight.ts`（+ test）、`app/api/ai/council/route.ts`、`app/member-ai/decision/page.tsx`。
- 前端：第二個分頁被 409 擋下時，還原第一份的「找回」紀錄，不會把它清掉。
- 部署順序保護：migration 未套用時（function 不存在）降級放行並 warn，其他資料庫錯誤一律不放行。
- 本機驗證：tsc 無錯、vitest 505 passed／7 expected fail、next build 成功。
- 待做：套 migration → 部署 → 以 `scripts/qa-council-concurrency.mjs` 實測（預期交付 1 份、總扣點 20）。

### 正式站實測結果（QA 專用帳號 `qa-council-b1@example.com`，餘額 20，並行 4 份）

| | 修補前（部署前基線） | 修補後（commit `8f2f59c`） |
|---|---|---|
| 交付報告數 | 4 | 1 |
| 總扣點 | 20 | 20 |
| 免費送出 | 3（CR002） | 0 |
| 其餘請求 | 200，約 100 秒 | 409，3.5～4.2 秒立即擋下 |
| 完成後 `council_inflight` 殘留 | 不適用 | 0 列（正常釋放） |

結論：**QA-B1 已修復並驗證。** 現在 BLOCKER 清單為空；C1／C2／C3 仍待修。

## 修補紀錄：C1／C2／C3（2026-10-07）

- **C1（欄位上限）已修**：`place ≤ 60`、`numbers ≤ 3 且每個 ≤ 12 字`、`yao ≤ 6 且每個 ≤ 12 字`、qimen／time／mode 等字串皆有上限。
- **C2（日期範圍）已修**：年 1900–2100、月 1–12、日 1–31、時 0–23、分 0–59，皆須為整數；空字串視為未填（前端本來就這樣送）。國曆不存在的日期（2/30、4/31、非閏年 2/29）擋下；農曆 30 日交給排盤引擎查曆。
- 測試：`qa-schema.test.ts` 29 條全過，其中包含「前端預設表單在五種術數組合下送出的 payload 必須通過」，防止誤擋正常會員。
- **C3（速率限制）判斷不另外加**：B1 修補後每位會員一次只能跑 1 份，一份約 100 秒，所以實際每分鐘最多約 0.6 份；被擋下的請求（409）在呼叫任何 LLM 之前就回了，只花幾次資料庫查詢。再加每分鐘上限不會多擋任何一種濫用。若日後要限制「每日報告份數」那是商業規則，需產品決策。

## 產品決策：每人每日 20 份（2026-10-07，使用者決定）

- 以台北時間日曆日計，**含備援稿**（備援稿一樣燒 LLM）；達上限回 429 `COUNCIL_DAILY_LIMIT`，不扣點。
- 檢查放在搶到進行中名額之後，所以同一會員的計數不會被並行打穿。
- `lib/auth/council-quota.ts`（`COUNCIL_DAILY_LIMIT`、`taipeiDayStartIso`）＋ `council-quota.test.ts`。
- 注意：管理員測試帳號也受限，壓測超過 20 份要換帳號。

# Handoff

## 2026-09-23｜決策報告模組敵意稽核：9 條全屬實、全部修復上線

### 背景

使用者的 `/loop` 指令：檢查決策報告模組各項命盤演算是否正常，有錯就排修復工程，
驗收條件是「會員登入後能正常使用」。開了 codex pane「報告稽核員」做唯讀敵意稽核，
它列出 9 條、附行號與「會員會看到什麼」，寫在 `.audit-report.md`。

**我逐條查證，9 條全部屬實。其中 #2 #3 是我自己前兩天寫出來的。**

### 共同形狀

九條裡有五條是同一種病：**會員填了，但值在送到排盤引擎前就沒了，而且不報錯。**
會員照樣拿到一份看起來完整的付費報告，只是那份報告不是用他填的東西算的。

### 已修並上線（4 個 commit，Vercel 全 READY）

| # | 級別 | 壞在哪 | commit |
|---|---|---|---|
| 2 | P1 | 性別預設「男」→ 女性會員沒改就拿到男性大運（順逆相反，每步干支全錯） | `df86083` |
| 3 | P1 | 六爻「現在時間」起卦被 Zod 剝掉，**從 2026-09-08 上線起就沒作用過** | `df86083` |
| 4 | P1 | 梅花手選動爻是中文標籤，`Number("初爻")`=NaN → 一律退回時間起卦 | `df86083` |
| 5 | P1 | 說了「時辰不確定」仍被安上預設時辰「寅」，連帶推大運 | `df86083` |
| 1 | **P0** | 扣點後寫 `council_runs` 失敗會 throw → 扣了 20 點、無報告、畫面還說「未扣點」 | `3d8c8ad` |
| 9 | P2 | 明確錯誤後不清 PENDING → 重新整理被困在五分鐘「找回中」 | `3d8c8ad` |
| 6 | P1 | 農曆生日的大運西元年整條早一年（農曆年當成西元年） | `4f1bc10` |

另 `7424ab0`：E2E 契約測試的 `JSON.stringify` 比對遇 jsonb 重排永遠失敗，改鍵序無關比對。

### #1 的處置（不是包成交易）

扣點 RPC 與 `council_runs` 分屬兩次呼叫，包成單一交易要動 SQL function。
這次的處置是**不讓失敗有能力吃掉報告**：insert 失敗不 throw，先大聲記錄，
再用精簡欄位重試一次（拿掉大 JSON 欄位，至少讓報告本文進得了歷史紀錄），
兩次都失敗就照樣把報告交出去並附警示請會員自行保存。回應補上 `run_id`。

#9 的分類要小心：**只有伺服器明確回錯才清 PENDING**。連線中斷或 504 時報告
很可能真的跑完並扣了點，那正是找回機制存在的理由，清掉會讓會員永遠回不到那份報告。
`runCouncilReport` 因此回傳 `transportFailed`，分不出來時一律當「沒聽到回音」。

### 正式站實跑驗收（不是看程式碼推論）

用 service role 替 `306465@gmail.com`（999,859 點）鑄 session token，
對 `https://www.xunfeng.tw` 實跑一次 council，**扣 20 點**：

- HTTP 200、95 秒、`fallback_used=false`、structured 儀表板正常、resonance 落在 60–90
- 查正式庫 `council_runs` 最新一筆：
  - **大運 8 步排出且正確**：年柱己巳（陰干）+ 男 → 逆排；首運乙亥（月柱丙子逆退一位）；
    起運 8 歲 = 西元 1998
  - **十神與地支藏干四柱齊全**（年傷官／月比肩／日主／時偏財，含本氣中氣餘氣）
  - **六爻完整**：巽宮本宮卦、世六應三、本卦變卦、納甲、月建日辰旬空動爻
  - `chart`、`structured`、`first_round` 皆非 null（#1 的精簡退路沒被觸發）

**驗收條件「會員登入後能正常使用」：成立。**

### #7 #8（已結案）

見下方「補記（09:12）」。

### 仍待風羿老師（沒有工程解）

決策 5/6/7/8/9 簽核、奇門三張盤例校對、旺衰權重、藏干權重、神煞取用。
原則不變：**未經拍板就給一個數字，等於把「共鳴度 87」的錯誤換個地方再犯。**

### 其他已知風險

- Gemini 30 天內 6 次高負載失敗（最近一次今天），會靜默把三模型降成兩模型。
- `ai_prompt_profiles` 仍 0 筆，報告內容設定從沒發布過。

### 補記（09:12）｜#7 #8 已結案並驗過，九條全部上線

pane 交了 `f13ce2b`（#7 移除假旋鈕＋奇門獨立時間線、#8 兜底稿依實際盤面生成），
我複審後補 `ccc9ae0`：死掉的 `completeness.rows` 標示清楚、只啟用一術時的連續空行、
重複話術、以及 calendar.test.ts 兩個大範圍掃描補 30 秒 timeout（原本會在與 tsc 併跑時
撞破 5 秒預設而假性失敗——閃爍的測試比沒有測試更糟）。

**三項驗證由 PM 自己重跑**：tsc exit 0、vitest 47 檔 461 passed / 2 skipped、build 108/108。
`.audit-report.md` 九條已逐條標註結案與 commit 編號。

**#7 的正式站驗證（再扣 20 點，今日共 2 次、40 點）**
刻意把事件時間設在 2020-03-05、奇門選「現在起局」：

- 奇門排出 **秋分・陰遁一局、值符天英、值使景門** —— 今天正是秋分。
  若仍用事件時間會排成驚蟄・陽遁。**兩條時間線確實獨立了。**
- 同一份報告的八字流年是 **庚子（2020）**，跟著事件時間走 —— 這是對的。
- 女性 + 年柱己巳（陰干）→ **順排**，方向正確。
- `run_id` 有回傳（#1 新增）。

**我自己犯的錯，記下來**：`4f1bc10` 把 pane 當時未完成的 `qimenTime` 基座一起提交了，
commit 訊息完全沒提到它——我推了一份自己沒審過的程式上正式站。行為上安全
（`toSolar(input.qimenTime) || divTime`，無呼叫端傳值時等同原狀），但共用工作樹時
不該整檔 `git add`。是 pane 主動來問才發現。

### 補記（09:35）｜Gemini 退避與告警：已完成調查與設計，**程式尚未動**

使用者交辦「Gemini 失敗要做退避跟告警」。調查完成、設計定案，但**一行程式都還沒寫**，
接手者請從這裡開始。

#### 正式庫的實際失敗分布（全期間，重試之後仍失敗的次數）

| provider | 錯誤 | 次數 | 最近一次 |
|---|---|---|---|
| Gemini | `This model is currently experiencing high demand…` | **11** | 2026-09-23 01:13 |
| Gemini | 系統回應逾時 | 2 | 2026-09-01 |
| DeepSeek | 系統回應逾時 | 2 | 2026-09-08 |
| OpenAI | 系統回應逾時 | 1 | 2026-08-08 |

查法（失敗紀錄存在 `council_runs.first_round` / `debate_round` 的 ModelResult 陣列裡）：

```sql
with r as (
  select created_at, jsonb_array_elements(coalesce(first_round,'[]'::jsonb)) as m from council_runs
  union all
  select created_at, jsonb_array_elements(coalesce(debate_round,'[]'::jsonb)) as m from council_runs
)
select m->>'role', m->>'error', count(*), max(created_at)
from r where (m->>'ok')::boolean is false group by 1,2 order by 3 desc;
```

#### 現況為什麼沒用

`lib/ai/council/providers.ts` 的 `withRetry()` 有兩個問題：

1. **重試零延遲**。上一次失敗後立刻再打一次。「high demand」是上游壅塞，
   需要時間才會好，秒內重試幾乎必然再失敗——上表那 11 次全都是重試後才記錄的。
2. **什麼錯都重試**（只有訊息含「未設定」才跳過）。400 這種永久性錯誤也會白白再花 45 秒。

#### 退避的預算限制（這是設計上最關鍵的一點）

現在最壞情況：R1(45×2) + R2(45×2) + 終稿(110×1) = **290 秒**，而 route 的
`maxDuration = 300`。**只剩 10 秒餘裕，不能無腦加 sleep。**

可行的原因：「high demand」是**秒回**的錯誤，不是逾時。第一次嘗試若 2 秒就失敗，
那一輪就剩下 43 秒可用。所以退避必須做成**預算感知**：

- 給 `withRetry()` 一個 `budgetMs`（該次呼叫所有嘗試的總時間上限）
- 睡之前先算 `elapsed + backoff + timeoutMs <= budgetMs`，塞不下就不睡（或直接放棄重試）
- 退避值建議 1.5–3 秒起跳、加 jitter；不是越久越好，因為預算就那麼多

#### 錯誤分類（要一起做，否則退避只是把浪費拉長）

`ModelResult` 目前只留 `error` 字串，沒有 HTTP status。要加 `status`，然後：

- **重試**：429、5xx、AbortError（逾時）、網路中斷
- **不重試**：400／401／403（金鑰錯、請求不合法），以及現有的「未設定」

#### 告警：有一個硬障礙，先講清楚

**正式站沒有 `RESEND_API_KEY`**（`npx vercel env ls production` 確認，清單裡沒有）。
`lib/notifications/admin-alerts.ts` 的 `sendAdminAlert()` 在缺 key 時直接
`return { ok:false, skipped:true, reason:"missing_resend_config" }`。

**推論：目前全站的 admin 告警一封都沒發出去過**，包含綠界付款異常
（`app/api/payments/ecpay/notify/route.ts:214,232`）、註冊異常
（`app/api/auth/register/route.ts:109`）、pending-drafts 排程
（`app/api/cron/pending-drafts/route.ts:152`）。**這已經超出 Gemini 的範圍，
是一個獨立的、更嚴重的問題**——付款出事沒有人會知道。

所以告警要做兩層，不綁死在寄信上：

1. **後台可見的 provider 健康狀態**（今天就有效，不依賴 Resend）。
   資料來源就是上面那段 SQL；顯示 24h / 7d / 30d 各家失敗次數與門檻狀態。
   建議同時把「本份報告實際由幾家模型產出」顯示出來，讓降級看得見。
2. **沿用 `sendAdminAlert()` 寄信**（Resend key 設好後自動生效，不必再改程式）。
   `ADMIN_EMAILS` 正式站已設，`ADMIN_ALERT_EMAILS` 沒設但程式會 fallback 到前者。

#### 順帶查清楚的：決策報告目前接哪幾家

一份報告打 **7 次 API、橫跨三家**：

- 第一輪平行三家：OpenAI（主判讀）／Gemini（策略推演）／DeepSeek（攻防反證）
- 第二輪攻防同三家各一次（`ENABLE_DEBATE_ROUND` 可關，正式站有設此變數）
- **終稿只由 OpenAI 寫**（`timeoutMs: 110000, attempts: 1`）

實際模型：

- OpenAI — 正式站有設 `OPENAI_MODEL`（本機 `.env.local` 是 `gpt-4.1-mini`）。
  正式站的值未確認：要讀就得 `vercel env pull` 把整包 secret 拉到磁碟，沒有這樣做。
- Gemini — 正式站**沒有** `GEMINI_MODEL` → 走程式預設 **`gemini-2.5-flash`**，
  且 `thinkingBudget: 0`（關思考鏈，否則多花 10–40 秒容易頂到 timeout）
- DeepSeek — 正式站**沒有** `DEEPSEEK_MODEL` → 走預設 **`deepseek-chat`**

因為終稿只靠 OpenAI，Gemini 掛掉報告仍生得出來，只是從三家意見變兩家——
**這就是要處理的靜默降級：會員付一樣的錢，拿到的是少一家意見的報告，而且沒有任何跡象。**

### 補記（10:15）｜Gemini 退避與告警：**已完成並上線**（commit `54f63aa`）

上一則補記（09:35）寫的是「設計定案、程式未動」，這則是實作結果，以這則為準。

#### 實際數字比原本查到的更難看

| 視窗 | Gemini | OpenAI | DeepSeek |
|---|---|---|---|
| 24 小時 | **4/8 失敗（50%）** | 0/8 | 0/8 |
| 七日 | **6/14（43%）** | 0/14 | 0/14 |
| 三十日 | 9/62（14.5%） | 0/62 | 1/62 |

**也就是今天大約一半的付費報告，其實只有兩家模型的意見。** 沒有人會發現，
因為終稿是 OpenAI 寫的——少一家意見的報告看起來跟正常報告一模一樣。

#### 退避（`lib/ai/council/providers.ts`）

- 錯誤分類改看 **HTTP status** 而非錯誤字串：429／5xx／無 status（逾時、斷線）重試；
  400／401／403 與金鑰未設定不重試。看字串的話，上游哪天改文案分類就靜默失效。
- 退避 1.5s → 3s → 6s，上限 8s，±25% jitter；嘗試上限 2 → 4。
- **最壞情況完全沒有變**（仍是 290s）。`withRetry` 收 `budgetMs`
  （預設 = 改版前的 `attempts × timeoutMs`），睡之前先算得下去才睡，兩個門檻分開判：
  - 連再跑一次完整嘗試的時間都沒有 → 放棄，不送注定被砍斷的呼叫
  - 跑得下但塞不下退避（例如前一次就是跑滿 45 秒的逾時）→ **不睡，直接重試**
  第二條保留了改版前逾時會重試一次的行為，上界因此原封不動。
- `ModelResult` 新增 `status` 與 `attempts`，兩者都會進 `council_runs`。

#### 告警（兩層，不綁死在寄信上）

- **`/admin/provider-health`** — 今天就有效。三家 × 24h／7d／30d 失敗率、判定理由、
  近 30 天失敗原因。頁面上直接寫明「信其實寄不出去」，避免看的人誤以為已經通知。
- **`/api/cron/provider-health`** — 每天台灣 09:10（`vercel.json` `"10 1 * * *"`），
  越過門檻才寄，全綠就安靜。`?dry_run=1` 可預覽。Resend 設好後自動生效。

門檻與理由寫在 `lib/ai/council/provider-health.ts`：小樣本不用比率判定
（一天只有幾份報告，一次失敗就是 10%，會叫到沒人看），但 24 小時內失敗 3 次就不以
樣本不足為由沉默；「疑似不可用」要 4 次全滅——一份報告會打同一家兩次，
4 次才代表連續兩份都拿不到。

#### 資料來源：新 view `council_provider_calls`

migration `20260923100000_council_provider_calls.sql`，把 `first_round` /
`debate_round` 的 ModelResult 攤平成一列一次呼叫。原本要數幾次失敗，得把每份報告的
完整判讀文字都拉一遍。`security_invoker = true` 讓底層 `council_runs` 的 RLS 照常生效
（預設的 security definer view 會繞過 RLS，而這裡面是會員的付費報告）。

#### 驗證

- tsc exit 0；vitest 49 檔 **488 passed** / 2 skipped（新增 27 條）；build 111 頁
- Supabase security advisor 複查：**新 view 無任何 finding**
- 正式站 `/api/admin/provider-health` 回 200，Gemini 正確標 warn
- 未登入讀該 view → `42501 permission denied`（確認沒外洩）
- 正式站實跑一份報告（扣 20 點，今日共 3 次、60 點）：77 秒、無兜底，
  `attempts` 已寫進 DB

#### ⚠️ 尚未實測到的部分（接手者請注意）

**退避路徑本身沒有在真實流量上觀察到。** 驗證那一跑六次呼叫全部一次成功，
所以只證明了「重構後沒有回歸」與「`attempts` 欄位打通」，
**沒有證明退避真的救回了一次 high demand**。目前撐住它的是注入時鐘的單元測試
（`providers-retry.test.ts`，含「退避不會讓報告爆掉 maxDuration」那幾條）。

要確認實效，看往後幾天 `council_provider_calls` 裡 Gemini 的
`attempts > 1 且 ok = true` 有沒有出現：

```sql
select created_at, role, ok, attempts, status, error
from council_provider_calls
where role = 'geminiFengYi' and attempts > 1
order by created_at desc;
```

### 補記（10:55）｜Resend：key 已設、DNS 已寫入，**網域驗證仍 pending**

使用者把 `RESEND_API_KEY` 加進 Vercel 之後的後續。**告警目前還是寄不出去**，
但卡點已經從「沒有 key」前進到「等 Resend 驗證網域」。

#### 做了什麼

1. 確認 key 已在 production（但環境變數要 redeploy 才生效，已隨 commit 重新部署）
2. 實際按下測試 → Resend 回 **403 `The xunfeng.tw domain is not verified`**
   ——證實光加 key 不夠，這也是為什麼要有那顆測試按鈕
3. `dig NS xunfeng.tw` → `ns1/ns2.vercel-dns.com`，DNS 在 Vercel，可以自己加
4. 新增 `/api/admin/email-domain`（`b5d87e4`）：GET 查狀態與所需記錄、
   POST create 建網域、POST verify 要求重新檢查。
   **理由**：`RESEND_API_KEY` 只存在正式站環境，本機讀不到，
   所以「驗證了沒、還缺哪幾筆」原本沒有任何地方查得到。
5. 在 Resend 建立網域 `xunfeng.tw`（id `002e9ea7-0431-4a5e-bd33-c71f5424c35d`，
   region us-east-1，對齊 Vercel 的 iad1）
6. 用 `npx vercel dns add` 逐筆寫入四筆記錄
   （**不用 MCP 的 `replace_domains_by_domain_records`——那是整份取代，
   會把現有指向 Vercel 的 ALIAS/CAA 洗掉**）：

| 類型 | 名稱 | 值 | record id |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGf…QAB`（218 字元） | `rec_e5bc87adb84f4307149237be` |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com`（priority 10） | `rec_5a73357826be5e65bd218724` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | `rec_2287be4449493e5a25d1a3eb` |
| CNAME | `rsend` | `send.forge.rmta.net` | `rec_4d9e2ab0a2cd91af74efbbb4` |

#### DNS 端已確認無誤

直接查權威 NS（不是查快取）四筆全部回得出來，而且
**DKIM 值逐字比對過：Resend 要求 218 字元、DNS 實際 218 字元，完全相同**
——長 TXT 被切斷是這件事最常見的失敗方式，先排除掉。

```
dig +short @ns1.vercel-dns.com resend._domainkey.xunfeng.tw TXT
dig +short @ns1.vercel-dns.com send.xunfeng.tw TXT
dig +short @ns1.vercel-dns.com send.xunfeng.tw MX
dig +short @ns1.vercel-dns.com rsend.xunfeng.tw CNAME
```

#### 現況：等 Resend

觸發 verify 後等了約 10 分鐘，狀態仍是 `pending`（`rsend` 那筆是 `not_started`）。
SES 的 DKIM 驗證常要 15 分鐘到數小時。**這一步已經不在工程手上，只能等。**

#### 驗證通過後要做的兩件事（都很短）

1. 打開 `/admin/provider-health`，按「寄一封測試告警給我」——
   成功才算數，不要看到 `RESEND_API_KEY` 有設就當作好了。
2. 確認 `RESEND_FROM_EMAIL` 不需要設：程式預設就是
   `巽風系統 <noreply@xunfeng.tw>`，網域一通就直接可用。

查狀態（不必進 Resend 後台）：
`GET /api/admin/email-domain`，帶管理員 bearer token。

#### 一併修掉的

`sendAdminAlert()` 原本失敗只回一句 `resend_failed`，會讓人以為是 key 錯。
現在把上游的 status 與 body 原樣帶出來——這次就是靠它一眼看到
「domain is not verified」，否則要往錯的方向查很久。

### 補記（11:20）｜Resend 網域驗證完成，告警通道打通 ✅

`GET /api/admin/email-domain` 回 **`status: verified`**，四筆記錄全部 verified：

| record | type | name | status |
|---|---|---|---|
| DKIM | TXT | `resend._domainkey` | verified |
| SPF | MX | `send` | verified |
| SPF | TXT | `send` | verified |
| SPF | CNAME | `rsend` | verified |

**使用者按下「寄一封測試告警給我」並確認正常收信。**

這條從 2026-06-02 拖到今天的線結束了：寄信 code 早就上線，
但正式站一直沒有 `RESEND_API_KEY`，`sendAdminAlert()` 每次都回 skipped，
**全站 admin 告警（含綠界付款異常、註冊異常、pending-drafts）一封都沒真的寄出過，
而且沒有任何地方看得出來。**

#### 現在真的會寄的東西

| 來源 | 觸發 |
|---|---|
| 綠界付款異常 | `app/api/payments/ecpay/notify/route.ts` |
| 註冊異常 | `app/api/auth/register/route.ts` |
| pending-drafts 排程 | `app/api/cron/pending-drafts` 每天 09:00 |
| **報告模型失敗率**（今天新做的） | `app/api/cron/provider-health` 每天 09:10 |

收件人 `ADMIN_EMAILS`＝`306465@gmail.com,kingking0909@yahoo.com.tw`。
**注意：以上四種都會寄給兩個人**，只有後台那顆測試按鈕是單寄給按的人。
若不想讓老師收到系統告警，設 `ADMIN_ALERT_EMAILS` 覆寫即可（程式已支援）。

`RESEND_FROM_EMAIL` 不需要設，程式預設 `巽風系統 <noreply@xunfeng.tw>` 直接可用。

#### 一併清掉的過時註解

`/api/admin/provider-health` 與 `/api/cron/provider-health` 裡寫著
「正式站目前沒有 RESEND_API_KEY，告警信一封都寄不出去」——當天寫、當天就變成假話。
今天才因為兜底稿的「大運未納入」吃過一樣的虧，所以順手改掉，並保留歷史敘述與結果。

#### 仍未完成的（同屬 Resend 那條線）

go-live 第 3 步 **Supabase Auth custom SMTP 還沒接**
（host `smtp.resend.com` / port 465 / user `resend` / pass = API key）。
沒接的話忘記密碼信仍走 Supabase 預設寄件人，且受 3 封/小時限制。
這與 admin 告警是兩套通道，網域驗證完成只解決了前者。

### 補記（11:50）｜「會不會又出現大運不出現」——查過了，答案是「本來會，現在擋住了」

使用者問決策系統能不能交給會員。逐層查完，記錄如下。

#### 發現一個我自己留下的缺口（已修，`c0c7afd`）

2026-09-22 之前性別預設「男」→ 所有人都排得出大運，但女性會員沒改就拿到男性的大運。
隔天改成不預選是對的，**但只加了一行提示、沒有擋住送出**。
於是缺口從「拿到錯的大運」變成「拿不到大運」：會員沒注意到兩顆按鈕都沒選中，
照樣送出、照樣扣 20 點，拿回一份沒有大運的報告。

現在八字開著而性別不是男／女就擋下送出，捲到性別區並說明原因；
欄位標題在八字啟用時顯示「（八字必填）」。

#### 逐層驗證（不是讀程式碼推論）

| 層 | 做法 | 結果 |
|---|---|---|
| 引擎 | 新增掃描：1305 個出生時刻 × 男女 = **2610 張盤** | 全部排得出大運，無拋錯，首運年份合理 |
| 引擎覆蓋缺口 | 原掃描出生日固定 1980-05-05，只變起卦時刻 | **「不同生日排不排得出大運」從沒被掃過**，已補 |
| API | 正式站近三次實跑 | 三次都有大運，方向正確 |
| **UI** | 用真實 token 在瀏覽器走一次 | 標題「性別（八字必填）」金色正常、三顆按鈕皆未選中、提示有樣式 |
| **關卡** | 填問題、不選性別、按「生成天機書」 | **被擋下、捲到性別區、未進掃描、未扣點** |
| **報告正文** | 查最近三份 `final_text` | 三份都寫出實際大運（例「現行大運癸酉（28-37歲）」），**沒有一份反過來跟會員要大運** |

UI 那一層是今天第一次真的用瀏覽器看——先前兩次只在視覺上才顯現的錯
（CSS 放錯檔、借用不存在的按鈕 class）都是這樣漏掉的。

#### 大運現在只剩一種情況不出現

**會員自己沒選性別**——而那已經擋在送出前，不會扣到點。
其餘路徑（各種生日、農曆跨年、節氣當天、早晚子時）都排得出來。

#### 錢的路徑

兜底稿 `plannedCharge = fallbackUsed ? 0 : creditsToCharge`——
交付門檻沒過就不扣點，也不吃免費額度。

### 下次起手式（更新 11:50）

1. **Supabase Auth custom SMTP** — Resend 網域已驗證，這步現在做得下去了。
   後台設 host `smtp.resend.com` / port 465 / user `resend` / pass = API key，
   忘記密碼信才會變成巽風系統寄件人，也才擺脫預設的 3 封/小時限制。
2. **確認退避的實效** — 見補記（10:15）末段的 SQL，
   看 Gemini 有沒有出現 `attempts > 1 且 ok = true`。
3. **考慮設 `ADMIN_ALERT_EMAILS`** — 現在系統告警會同時寄給老師（`ADMIN_EMAILS` 有兩位）。
   若不想讓老師收到技術告警，設這個變數覆寫即可，程式已支援。
4. `ai_prompt_profiles` 仍 0 筆，報告內容設定從沒發布過。
5. 決策 5/6/7/8/9 簽核、奇門三張盤例校對、旺衰與藏干權重：**只能等風羿老師**。


---

<details><summary>本日稍早的原始交接（09:12 前）</summary>

### 下次起手式

1. 收 pane 的 #7 #8 回報，核三項驗證輸出後才准 push。
2. `.audit-report.md` 九條逐條標註結案狀態。
3. Gemini 失敗率要不要做退避或告警。


</details>

---

## 2026-09-22（第三批）｜老師簽了流派，系統卻對客戶說「待簽核」（已修）

### 查到什麼

盤點「待老師確認的有哪些」時發現先前認知已過時：
`ai_school_profiles` 有 **published v2、2026-09-08 12:39、decided_by = 風羿老師**。
那筆躺一個月的草稿他發布了，還多選了梅花與六爻——**決策 1–7 其實都已拍板**：
晚子時日柱不進位／早晚子時柱分開算／真太陽時經度＋均時差／交節依精確時刻／
梅花農曆起卦・年數取地支序／六爻月建取節月。

但簽核資訊存在 DB 欄位 `decided_by`，引擎與後台橫幅讀的是 `settings.decidedBy`（空字串），
於是**每份收費報告對客戶印「採用流派：…（暫定，待簽核）」**、後台顯示「尚未經老師簽核」。
與先前那批同一種病，方向相反：這次是老師做了、系統說他沒做。

### 已修並上線

- commit `4f9db45` → `main`
- Vercel `dpl_6BK8XmxJ49iDiigPP9X1j9kNYvKB` → READY（production）
- 煙霧測試：首頁 buildId `EXpU4zoP5wA0m0CC4w9EG` → `ZYrfYCDc7nOnPO3Ot6C0L`（一個請求）

- `mergeSignature()` 在讀取時把 DB 欄位補進 settings——**不改資料**，已發布的舊版本立刻就對。
- publish 一併寫進 settings，新版本自帶完整資訊。
- 簽核狀態在排盤區塊**獨立印一行**，不靠老師自己打的流派名稱判斷。
- tsc 過、vitest 42 檔 396 passed / 2 skipped、build 108 頁。新增 8 case。

### 後台能力現況（回答「老師能維護什麼」）

**已能自改**：流派決策 1–7（✅用了）／文件庫 3 份 20,525 字（✅9/8 上傳兩份反證規則）／
報告內容設定（❌ 0 筆從沒發布）／面相十二宮 1 筆／面相判讀規則 **67 條**／
面相知識庫 **28 張卡**（含匯入匯出、版本紀錄、四階段狀態）。

**無入口（待補）**：
1. 決策 8 奇門定局法＋轉盤／飛盤（`SchoolConfig` 無 qimen 段）
2. 起運法（大運）
3. 面相報告骨架／prompt（寫死在 `lib/face-analysis/report.ts`，無可編輯層）
4. 面相覆核題（5 筆，有 API 沒頁面）

**仍待老師**：決策 8、奇門盤面校對、起運法、報告內容設定從未發布
（`ai_prompt_profiles` 0 筆，55 份報告 `prompt_profile_id` 全 null）。

### 下次起手式

補後台入口，建議序：決策 8（奇門）→ 面相 Prompt 層 → 起運法。
**不建議做「後台直接編輯資料表」**：那等於把無驗證、無版本、無稽核的寫入權開給正式庫，
而現有每個設定頁都是草稿→發布→封存三態，正是為了避免這件事。

---


## 2026-09-22（下半場）｜流年流月改為程式推定；性別身分拆欄

### 起因與查證

使用者問「大運跟著出生資料出現、流月跟著流年異動，後台沒得改」。
查證發現：`lib/yixue/` 沒有任何大運／流年／流月計算，八字只算到四柱＋月令。
但模型**沒有編造**——最近 6 份報告每份都提到大運，內容是「缺大運與流月，判斷降權」
「3日內補齊大運、流年流月資料」。**系統把自己算得出來的東西當成缺少的客戶資料**，
於是付 20 點的人被要求自己補大運，且每份報告八字維度自動降權。

後台沒得改是因為 `SchoolConfig` 只有 calendar／meihua／liuyao 三段，沒有 bazi 段；
決策書第 327 行自己把「起運法」列為尚未開放。功能不存在，不是漏做設定頁。

### 已上線

- commit `7482b2b` → `main`
- Vercel `dpl_HoVTDbb8Y8NR8mhbKNYpLbcEU9zP` → READY（production）
- 煙霧測試：首頁 buildId `2dyZ6-mJh_bTPVjanlcxq` → `u2GwdH5dLkm8qSW1k2Zwp`
  （一輪一個請求、60 秒一次的低頻探針，避開上次觸發 Vercel 防護的問題）

### 已完成（走使用者拍板的 A 案）

- 新增 `lib/yixue/bazi/fleeting.ts`：流年（立春分界）＋往後 6 個節月，
  **每個流月各自帶所屬流年**（立春換年，序列會跨兩個流年）。
  基準時刻是事件／起局時間，不是出生時間。
- `tyme.ts` 新增 `fleetingMonthAt()`，取節氣 +5 天當探針避開交節邊界。
- prompt 印出流年流月，並明寫「不是待補資料，不得要求會員提供」
  以及「大運未實作，請降權但不得要求會員自行提供」。
- 兜底報告三句同一個 bug 一併修。
- 性別與身分拆欄（為大運鋪路）：`["男","女","不指定"]` ＋ 獨立 identity 自由填寫。

### 驗證

tsc 過、vitest 41 檔 **388 passed** / 2 skipped、build 108 頁。
新增 14 個 case；prompt-baseline 快照刻意更新 5 則，測試檔頭已記錄原因。

### 未完成與風險

- **大運未做**。需老師先定起運法（三天折一年 vs 按交節時刻精算）與排幾步。
- ⚠️ **`gender` 預設值仍是「男」**。大運上線前必須改為強制選擇或不指定時不排大運，
  否則沒動過預設的人會靜默拿到錯的順逆。已在 `_form-config.ts` 加註。
- 未經真人跑報告驗收（與先前數批相同）。

### 下次起手式

若要續做大運：先照 `SCHOOL-DECISIONS.md` 既有格式寫「起運法」決策節，附實際盤例
給老師勾，再實作——不可在簽核前上線，那會重蹈奇門未校對就出報告的路。

---


## 2026-09-22｜點數卡住名單 ＋ 到期掃描排程

### 起因

承 9/21 的點數不足引導。這次 Supabase MCP 接得上，補查了正式庫。

### 查到什麼

**1. 6 位有效 trial 會員剛好卡在 10 點**（13 位有效 trial 的 46%）

全部都是同一個位置：註冊 30 點 → 產 1 份天機書扣 20 → 剩 10 點。
不是 9 也不是 11，6 位一模一樣。然後：

| | |
|---|---|
| 有付費 | **0** |
| 開過任何訂單 | **0**（連結帳頁都沒去） |
| 用過即時問答 | **0**（10 點唯一買得起的功能） |

時間分布：6/16 一位、9/04 一位、9/05 兩位、9/15 一位、9/16 兩位——
**五位在最近 17 天**，隨流量進來正在累積。

> 這與 2026-09-05 拍板的「10 點死點是刻意的沉沒成本設計」直接相關。
> 當時只有一個反例，現在樣本是 6，轉換 0/6 且無人走到結帳頁。
> 這是數據不是建議，要不要調整是使用者的決定。

**2. 7 筆 entitlement 標著 active 但早就過期**，最久從 2026-06-01（113 天）。

功能上安全（扣點路由都有 `.gte("expires_at", now)`），但**只看 status 的統計會說謊**
——我自己第一次查就多算了一位，把 7 講成了卡住人數，實際是 6。

順帶看到：其中 2 位是**付費會員**（basic 剩 60 點、pro 剩 150 點）方案到期但點數還在，
另有 2 位 trial **30 點一點都沒用就到期**。trial 漏斗因此是三段：
完全沒開始 → 做一份就停 → 0 轉換。

### 做了什麼（commit `a76fca8`）

- `/api/admin/members` 回 `report_cost` 與 `summary.stuck`
- `/admin/members` 新增「點數卡住」篩選、列表標記「不足 20 點」、
  頂部主動提示加一鍵切名單。判定**只算 active**——已到期的人要的是續訂提醒，
  不是加購提醒，兩種名單混在一起兩邊文案都會寫不對
- 新增 `/api/cron/expire-entitlements`，每天台灣 09:05（UTC 01:05）。
  有 `?dry_run=1`、有競態保護
- **刻意不動 `credits_remaining`**：過期不等於點數歸零，續訂時
  `commit_paid_entitlement` 會把舊點數帶過去，在這裡清等於偷偷沒收

### 驗證

tsc 過、vitest **374 passed / 2 skipped**、next build 過（108 頁）。
排程的效果已用等效 SQL 確認：第一次會掃到 7 筆，過期 38–113 天。

### 未完成

- **本機沒有 `CRON_SECRET`，無法對正式站打 dry-run。** 部署後建議手動打一次
  `?dry_run=1` 確認筆數是 7，再等隔天 09:05 自動跑。
- 未經真人操作驗收（本次、9/21 的點數引導、面相 PDF、四術排盤都是）
- 那 6 位卡住的會員**還沒有人聯繫**。到期日最晚 10/16，還來得及。
- 奇門三張校對盤例待風羿老師比對；流派草稿仍未發布；決策 5／6／7 待簽核

### Git 狀態

`main...origin/main` 同步，工作樹乾淨。最新 `a76fca8`。沒有長時間程序在跑。

---


## 2026-09-21｜點數不足時的引導（免費方案會員流失點）

### 起因

使用者回報「免費方案會員點數用完，出現點數不足但沒有引導進訂閱頁」。

查證後三支 API 各說各話，而且**都只回一個字串**：

| 來源 | 原訊息 |
|---|---|
| `/api/ai/council` | 點數不足，請先儲值或升級方案 |
| `/api/ai/chat` | 點數已用完，請續訂方案或啟用新方案 |
| `/api/face-analysis/.../analyze` | 完整面相報告需要 20 點，目前點數不足 |

前端只拿得到 message，於是天機書的錯誤畫面只能給一顆**「返回修改」**——
但點數不足不是改表單能解決的事，那等於把剛用完 30 點免費體驗的會員推進死路。
這正是最該把人接到方案頁的一刻。

### 做了什麼

- `lib/auth/credits.ts`：統一的 `insufficientCreditsError()`，帶
  **機器可判讀的 code**（`INSUFFICIENT_CREDITS`）與 required／remaining／shortfall／
  purchasePath。前端不必比對中文字串——改文案就會壞的那種寫法。
- `lib/auth/member.ts` 新增 `errorBody()`：把 code 與 details 一起帶出去。
  沒有 code 的錯誤行為完全不變，仍然只有 `error` 一個欄位。
- 三支路由改用同一個錯誤與同一個信封。
- `app/member-ai/_credits-notice.tsx`：共用提示元件，講清楚「需要 N 點、目前 M 點、
  還差 K 點」，並給「前往加購點數」與「查看我的點數」兩個出口。
- 三個介面接上：天機書掃描錯誤畫面、面相就緒畫面、AI 即時問答（純 JS 版另寫一份）。
- **輸入頁先提示**：點數看起來不夠時，在生成按鈕下方就先講，不必等跑完才被擋。
  刻意**不停用按鈕**——餘額是前端快取值，拿它鎖按鈕會把實際有點數的人關在門外，
  最終判定一律留在後端（符合 CLAUDE.md「前端只顯示狀態」）。

### 過程中抓到的兩個坑

1. **元件借用了不存在的按鈕樣式。** 原本寫 `className="btn ghost"`，但 `.btn.ghost`
   全站沒有定義、`.btn.primary` 只在 `styles/member.css`，而面相頁用的是另一套
   `.face-primary`。照那樣上線，同一個元件在面相頁會變成裸連結。已改成自帶樣式。
2. **CSS 一度放進 `decision.css`**，但面相頁不載入那支。已改由元件自己 import。

### 驗證

tsc 過、vitest **366 passed / 2 skipped**、next build 過（107 頁）、
`node --check` 確認聊天頁的純 JS 語法無誤。

### 未完成

- **未經真人操作驗收。** 本次無法查正式庫（Supabase MCP 這個 session 沒連上），
  所以「目前有幾位會員卡在 0 點」沒有數字佐證。
- 這一版只補了「已經撞到」的引導。若要更進一步，可在剩餘點數偏低時（例如 <20 點）
  就在會員中心主動提示，而不是等他要用的時候。
- 報名轉換率：5 筆報名 0 成交、4 筆連付款頁都沒到（見 9/11 段）。
- 奇門三張校對盤例待風羿老師比對；流派草稿仍未發布；決策 5／6／7 待簽核。
- 老師後台操作指引：https://claude.ai/code/artifact/733542af-b00f-4ea2-8a29-17bbae860695

### Git 狀態

見本次提交。工作樹乾淨，沒有長時間程序在跑。

---


## 2026-09-11｜課程報名名單（新頁）

### 起因

老師反應「有人報名課程但後台看不到報名狀況」。查證結果是兩件事疊在一起：

1. **後台從來沒有「報名名單」這一頁。** 側欄只有「預約名單」（諮詢預約）與
   「課程上架」（編輯招生頁內容）。報名資料只寄生在訂單管理底下。
2. **5 筆報名全部沒有完成付款**，所以在訂單列表上一律顯示「已取消／失敗」，
   看起來就跟沒人報名一模一樣。其中 4 筆連一筆 payments 紀錄都沒有
   （填完表沒去付款，24 小時後被排程自動取消）。

被漏掉的具體名單：吳淑雯 9/06 完整填完報名表（留 LINE、寫了報名動機）後刷卡失敗，
當天 15:27 又試一次仍未完成；賴仁豪 9/02 同樣填完整份表單後沒付款。
這兩位是意願最高的人，而老師完全不知道他們存在。

### 做了什麼

新增 `/admin/course-registrations`，主體是「人」不是「訂單」：
**不以付款狀態過濾任何一筆**。

- migration `20260911090000_course_registration_followup`：
  `contact_status` / `contact_note` / `contacted_at`（已套用正式庫）
- 跟進狀態與付款狀態**刻意分開**——付款由 orders 表達，用付款狀態當過濾條件
  會剛好濾掉最該打電話的那些人
- 頁面會自動算出「高意願未成交」：填了動機或留了 LINE、沒付款、也還沒被聯繫，
  並在頁首直接點名建議優先聯繫誰
- 付款與否一律以訂單 `paid_at` 為準，不看報名的 `status`
  （那要靠 webhook 回寫，本週才修好，舊資料可能沒跟上）
- 側欄「顧問服務」改名「預約與報名」，兩份名單放在一起

### 驗證

tsc 過、vitest **357 passed / 2 skipped**、next build 過（107 頁）。
已確認 `course_registrations` 到 `orders` 與 `course_products` 的外鍵各只有一條，
PostgREST 嵌入不會歧義。

### 未完成

- **未經真人操作驗收**（本頁、面相上限與 PDF、四術排盤、9/05 那批全部都是）
- 報名轉換率本身是另一個問題：5 筆報名 0 成交，4 筆連付款頁都沒到。
  是招生頁動線、付款流程還是金額門檻，需要另外查
- 奇門三張校對盤例待風羿老師比對（`docs/specs/yixue-engine/SCHOOL-DECISIONS.md` 決策 8）
- 流派草稿仍未發布；決策 5／6／7 待簽核
- 老師後台操作指引：https://claude.ai/code/artifact/733542af-b00f-4ea2-8a29-17bbae860695

### Git 狀態

`main...origin/main` 同步，工作樹乾淨。最新：`fa4ee01`。沒有長時間程序在跑。

---


## 2026-09-07｜報告新增「反證」段落＋後台專屬欄位

使用者要求把反證變成看得見的報告條件。**反證原本就存在，但只跑在第二輪攻防（內部），
產出從不進入交付的報告**，讀者看不到反面論證；老師能編的也只是「你是誰」的人設。

使用者拍板：報告新增反證段＋後台專屬欄位，**不增加 LLM 呼叫**（維持 7 通、20 點、
產報告時間不變）。位置在四象合參之後、時間節奏之前；單術時合參段不出現、反證仍出現。

後台在「報告內容維護 → 反證」，三欄：段落標題、要反證的項目、
**反證規則（原文進入 Prompt）**——最後這欄就是老師寫 prompt 的地方。

反證與關鍵風險的分工已寫進預設內容並加測試鎖住：
風險＝執行上可能出什麼事；反證＝這個判斷本身可能就是錯的。

⚠️ **`counterEvidence` 刻意給了 `.default()`**：這欄位今天才加，老師先前存的設定沒有它。
設成必填的話，舊設定會 parse 失敗 → 回退預設值 → 他整份已發布的編輯靜默失效。
**日後在既有設定上加欄位，一律要給 default。** 已加測試。
（查證時 `ai_prompt_profiles` 仍 0 筆，無既有資料受影響。）

刻意沒動：兜底報告不加反證；交付門檻結構錨點不動（那是「≥4 個錨點」的寬鬆檢查）。

驗證：tsc 過、vitest 34 檔 335 passed / 2 skipped、build 105 頁。
報告骨架四則快照刻意更新，測試檔頭已補紀錄。

**開工時發現**：六爻與奇門已在 `bd13433`／`8908166` 改為程式排盤（四術排盤引擎全部完成）。
先前記錄的「只有八字是程式排盤」已作廢。

---

## 2026-09-08 收工總結（下半場：面相儲存與 PDF）

> ⚠️ **本次有另一個 Claude session（`session_01KH8bck…`）在同一個工作目錄同時作業**，
> 它的 commit `f1868a6`（報告反證段落）夾在本 session 的 commit 之間。
> 兩邊的 commit 內容各自乾淨、沒有互相污染，但**它改寫了 handoff.md 開頭，
> 導致本段第一次寫入時字串錨點對不上而靜默失敗**（`str.replace` 沒配到不報錯）。
> 日後在同一目錄多開 session，改 handoff／worklog 一律要驗證寫入結果，不能只寫不看。

### 最新狀態

面相模組補上三件事：**每次分析都保存**（本來就有）、**真正的 PDF 檔可下載**（新做）、
**每位會員 30 份上限**（新做，滿額擋住由會員自己刪）。

**已 commit、已 push、已部署。** Vercel `dpl_BTZomkfTMznVciNdRfxE7Brsf561` → READY。

| commit | 內容 |
|---|---|
| `020a54b` | 保存上限 30 份，滿額擋住新分析；額度顯示與前端預先提醒 |
| `d97b9d6` | pdfkit 產生真正的 PDF 並存進 Supabase Storage |
| `367d526` | 交接文件與 CLAUDE.md 約束（**當時漏了 handoff.md，本段為補寫**） |

### ⚠️ 這次最該記住的技術教訓

**pdf-lib 產出通篇亂碼時，API 不報錯、位元組數正常、連字寬量測都正確。**

第一版用 pdf-lib + `subset: true`，測試全綠、43 KB、79 ms，看起來完全成功。
把 PDF 轉成圖片才看到中文全變成 `! " # $ % & ' ( )`——glyph ID 被當字元碼寫出去。
若只驗 API 就交付，付費會員會拿到一份通篇亂碼的報告。

改用 pdfkit 後正確。三種方案的對照寫在 `assets/fonts/README.md`。
**日後換字型或換 PDF 套件，一定要把產出的 PDF 轉圖看過。**

### 驗證

- tsc 過；vitest **345 passed / 2 skipped**；next build 過（105 頁）
- Vercel trace 檔已確認含字型與 pdfkit 的 14 個 `.afm`（`fs` 讀的檔 Next.js 追蹤不到，
  靠 `outputFileTracingIncludes` 明寫，否則正式站產 PDF 會 ENOENT）
- migration `20260908120000_face_report_pdf_bucket` 已套用正式庫
- 實際產一份 118 KB 的完整報告並人工看過畫面：中英數混排、中文斷行、分頁皆正確
- **正式站煙霧測試沒做完**：curl 打太多次觸發 Vercel 的機器人防護
  （`x-vercel-mitigated: challenge`），全站對本機 curl 回 403。
  **真人用瀏覽器不受影響**，部署狀態經 Vercel API 確認為 READY。
  下次要驗正式站，改用瀏覽器或降低請求頻率。

### 未完成

- **真人驗收全部未做**：本次兩項、四術排盤，以及 9/05 那批
  （註冊防刷、付款開通、199 加購、退款試算）
- 天機書的「下載 PDF」仍是 `window.print()`。面相已有可複用的產生器，
  但欄位結構不同，要另寫版面
- 奇門三張校對盤例待風羿老師比對（`docs/specs/yixue-engine/SCHOOL-DECISIONS.md` 決策 8）
- 流派草稿仍未發布；決策 5／6／7 待簽核
- 老師的後台操作指引（一頁式）：
  https://claude.ai/code/artifact/733542af-b00f-4ea2-8a29-17bbae860695

---

## 2026-09-08 收工總結

### 最新狀態

**四術排盤引擎全部完成。** 原本只有八字是程式排盤，奇門／六爻／梅花都是把
使用者填的資料丟給 LLM 由它自己「算」——算錯不會有任何人發現。現在四術都由程式排。

同時改掉「四象共鳴度永遠 87 分」：那個數字原本是叫模型自己填，而 prompt 範例
就寫著 `"resonance":87`，模型照抄。

**已 commit、已 push、已部署，正式站驗證過功能是活的。**
Vercel `dpl_DyDqg2WVtvUNTnhQfkfJigL4MRHL` → READY (production)，已掛 `www.xunfeng.tw`。

### 已完成

| commit | 內容 |
|---|---|
| `e43766a` | 梅花易數排盤：起卦、本卦／互卦／變卦、體用生剋 |
| `bd13433` | 六爻納甲裝盤；共鳴度改程式計算；起卦時間 UTC+8 |
| `8908166` | 奇門遁甲排盤：定局、地盤、值符值使、天盤、八門八神 |
| （本次） | 四術全時段掃描測試；修掉一條會閃爍的逾時 |

新增 `lib/yixue/gua/`（八卦、六十四卦、干支、納甲、八宮）、
`lib/yixue/meihua/`、`lib/yixue/liuyao/`、`lib/yixue/qimen/`。

### 驗證結果

- tsc 過；vitest **34 檔 333 passed / 2 skipped**（連跑三次確認不閃爍）；`next build` 過
- 全時段掃描：480 個時刻 × 4 組流派 × 四術 ＝ 1920 張盤全部排得出來
- 六十四卦表以「卦名前兩字＝上下卦自然象」做結構交叉驗證（抄錯一格就爆）
- 八宮用翻爻規則生成而非手打 192 欄位，並以乾宮、坎宮古籍卦序驗證
- 納甲以屯、遯、既濟、大過等古籍常見卦逐爻比對
- 梅花、六爻主案例逐項手算（算式寫在測試註解裡）
- 奇門跑 192 個時辰的結構不變式掃描，抓到並修掉「時干落中五宮排不出盤」

### ⚠️ 下次接手最重要的三件事

1. **請老師校對奇門三張盤例**（`docs/specs/yixue-engine/SCHOOL-DECISIONS.md` 決策 8）。
   奇門定局法沒有定本，拆補／置閏／茅山同一時辰排出完全不同的局，工程無從自證。
   梅花與六爻能拿古籍對到底，**奇門不能**。老師比對前，奇門段判讀不該當定論。
2. **流派草稿仍未發布。** `ai_school_profiles` 那筆 2026-08-10 的草稿把晚子時日柱
   改成「不進位」，正式碼跑的是「進位」，差了一個月。這會連動六爻日辰與奇門日家局。
3. **決策 5、6、7 待簽核**（梅花曆法／年數、六爻月建）。都已在
   `/admin/school-settings` 可勾選，改一個選項右邊會立刻重排給老師看。

### 未完成

- 奇門不做格局判定（伏吟反吟、擊刑、入墓、十干克應）——斷盤不是排盤，各家取用不同
- 六爻不做旺相休囚死評分——需先定權重模型，屬流派決策
- 八字的判讀模型（旺衰、藏干權重、起運法、神煞）仍待老師拍板
- **真人驗收全部未做**，包含 2026-09-05 那批（註冊防刷、付款開通、199 加購、退款）

### 正式站煙霧測試

首頁 200、`/member-ai/decision` 200、`/api/plans` 正常。
`decision/page-6d190ae6…js` 內確認：`台北時間（UTC+8）`✓　`Asia/Taipei`✓
`時間依據`✓　`納甲`✓　`計算依據`✓；舊的「不會判斷，請用時間起卦」已消失✓

**全部是機器驗證。沒有任何一項經過真人實跑報告驗收。**

### Git 狀態

`main...origin/main` 同步，工作樹乾淨。

---

## 2026-09-06 收工總結

### 最新狀態

今天四批全部上線，正式站跑的是 `08e8c5e`。工作區乾淨、與 `origin/main` 同步（0/0）。
**沒有長時間程序在跑**（三次部署輪詢都已結束）。

### 已完成（依 commit 順序）

| commit | 內容 | 部署 |
|---|---|---|
| `8cfee15` | 修 bug：老師參考文件從未進 prompt；報告骨架改採老師文件順序；決策型態 5→7 種 | `dpl_Gz5nj3…` READY |
| `3a23271` | 「易學報告」散稱改名「四象天機報告」（6 處，《巽風四象天機書》不動） | `dpl_Dvwkw…` READY |
| `eb97707` | 後台顯示「實際生效什麼」＋草稿未發布主動寄信提醒 | `dpl_CjyWK…` READY |

另有三筆 docs commit（`398c333`／`08b2e08`／`08e8c5e`）補交接與部署狀態。

### 驗證結果

- tsc 過；vitest **26 檔 217 passed / 2 skipped**；next build 過（105 頁）
- 煙霧測試：首頁出現「宜借力推進」／`member-pricing.js` 出現「次四象天機報告」／
  `/api/cron/pending-drafts` 回 **401**（證實路由上線且 `CRON_SECRET` 已設）
- **全部是機器驗證。今天改的東西沒有任何一項經過真人跑報告驗收。**

### 未完成（下次待辦，依優先序）

1. **實跑一份新版報告**（要扣 20 點，所以我沒代跑）。要確認四件事：
   老師文件真的進 prompt（**看 `council_runs` 的 prompt 長度差，不要看後台字數**）、
   段落順序是新的、關鍵點／時間節奏／關鍵風險三段有出現、
   模型真的會用「宜借力推進」「宜調整策略後再進」而非全塌回「有條件可成」。
2. **去問老師那筆「不進位」草稿是不是他的決定**（見下方 ⚠️ 段）。
   明早 09:00 排程會自動寄信給他；要提前通知就手動打一次 cron。
3. 請老師到 `/admin/prompt-settings` 發布一版，報告才有 `prompt_profile_id` 可追溯。
4. `fengyi-v1` 流派參數仍未簽核（`decidedAt`／`decidedBy` 空字串），41 份收費報告都用它跑過。
5. 排盤缺口：奇門／六爻／梅花無程式排盤。建議順序 梅花 → 六爻 → 奇門，
   但**決策 1–4 簽核是前置**（日柱定義是六爻日辰與奇門日家局的前提）。
6. 小落差（不急）：終稿人設寫「7/14/30 日 KPI」、`actionPlan` 寫 3/7/30。
   源頭是最初始 repo 兩份文件本來就打架；使用者看到的照 `reportSkeleton` 走，
   應留 3/7/30、改掉人設那句。

### 下次起手式

先看第 1 項有沒有人跑過報告：

```sql
select id, created_at, prompt_profile_id, length(final_text)
from council_runs order by created_at desc limit 3;
```

`created_at` 若晚於 2026-09-06 08:18 UTC 就是新版跑出來的，再比對 prompt 長度差
（修復前 40 份為基準，多出約 3700 字才算文件真的進去了）。

---

## 2026-09-06｜「四象天機報告」改名＋運算邏輯釐清

### ⚠️ 最優先：老師的流派決策停在草稿，一個月未生效

`admin_audit_logs` 唯一一筆流派紀錄：2026-08-10 09:29（台灣），
`kingking0909@yahoo.com.tw` 存了草稿 `lateZiDayPillar: "same"`（晚子時日柱**不進位**），
之後沒有任何動作。程式預設是 `"next"`（進位），`loadSchool()` 只讀 published，
`ai_school_profiles` published = 0 —— **這一個月每份報告仍用「進位」在排。**

依決策書盤例（2024-01-01 23:30 生）：現在跑的日柱是乙丑，老師草稿的意思是甲子。
日柱是日主所在，直接決定十神、旺衰、用神。
**老師已表達過專業判斷，系統沒有採用，而他很可能以為採用了。**

**下一步：去問老師「不進位」是不是他的決定，是的話請他自己到
`/admin/school-settings` 按發布。** 這一按會改變往後所有晚子時個案的判讀基礎，
不能由工程或營運代按。

與文件 bug 同一種病：畫面顯示狀態、實際沒生效、沒有人被告知。

**三件補救已做完並上線**（commit `eb97707`／`dpl_CjyWKUzbY4xKHogZKeA2uJC4NTsC` → READY）：
1. 新增 `GET /api/admin/effective-settings`，呼叫報告管線用的同一組 loader，
   後台三頁不再自行推算生效狀態；`documents` 那個會說謊的字數已換成實際送出的字數。
2. 有未發布且真的有差異的草稿時，「發布」升為主按鈕、文案改「發布草稿（尚未生效）」。
3. `GET/POST /api/cron/pending-drafts`（`0 1 * * *`），草稿放超過 3 天寄信給
   `ADMIN_ALERT_EMAILS || ADMIN_EMAILS`（老師信箱在內），同一份最多 7 天一次，
   去重記在 `admin_audit_logs` 的 `pending_draft.alerted`。信裡逐條寫出差異。

煙霧測試：`/api/cron/pending-drafts` 正式站回 **401**（不是 404 也不是 500），
證實路由已上線且 `CRON_SECRET` 已設定。

**刻意沒做**：沒有替老師按任何發布鍵，也沒有手動觸發那支 cron。
那筆「不進位」的草稿仍是草稿，老師也還沒被通知。
第一封提醒信會在明天（2026-09-07）台灣時間 09:00 由排程發出；
若要提前通知，手動打一次該路由即可（會真的寄信並記 audit，之後 7 天不重複）。


### 改名（已上線）

- commit `3a23271` → `main`
- Vercel `dpl_DvwkwQ47Efz2DuqxcfMvubtXg3Jm` → READY（production）
- 正式站煙霧測試：`/js/member-pricing.js` 已出現「次四象天機報告」

「易學報告」散稱改為「四象天機報告」，6 處（後台文件庫、Token 用量 KPI 與表頭、
定價頁贈點說明、兩處註解）。**《巽風四象天機書》維持不動**，這是使用者拍板的取捨：
不動 prompt 的 reportTitle 就不必重跑快照，也不會讓新舊報告 PDF 檔名對不起來。
代價是站上並存「天機書」與「天機報告」兩種說法（member-pricing.js 同檔 53/61 行
是「天機書」、96 行是「天機報告」）—— 知情下的取捨，不是漏改。
tsc / vitest 197 passed / build 103 頁 全過；純字串改動。

### 運算邏輯三層（回答使用者提問，重點在第 1、2 條的風險）

1. 排盤是程式算的（`lib/yixue/`，純函式、有 golden test），但流派參數 `fengyi-v1`
   **仍標「暫定，待簽核」，decidedAt / decidedBy 空字串** —— 41 份收費報告都用它跑過。
   檔案註解自己寫著「上線給真實會員前必須完成簽核」。這條沒解決。
2. **奇門／六爻／梅花沒有程式計算**（引擎 `0.1.0-phase0`，只處理 bazi）。
   這三術是 LLM 讀使用者填的起卦資料自由解讀。四象裡只有「命」是算出來的。
3. 判讀規則走 prompt：`defaults.ts` 預設一直在跑；`ai_prompt_profiles` 0 筆從沒生效；
   `ai_documents` 老師文件 3741 字今天上午才第一次真的進 prompt。

---

## 2026-09-05（晚）｜四象天機報告：老師參考文件從未進 prompt（已修）＋報告骨架改採老師文件順序

### 目前狀態

- **已 commit、已 push、已部署上線。**
  - commit `8cfee15`（15 檔、+678 / −74），直接進 `main`
  - Vercel `dpl_Gz5nj3pHtQgxgX1iZHNHEEALxHND` → READY（production），alias 已切 `www.xunfeng.tw`
  - 驗證：tsc 過、vitest 24 檔 197 passed / 2 skipped、next build 過（103 頁）
  - 正式站煙霧測試：首頁已出現七種決策文案（含「宜借力推進」）
  - **真人驗收尚未做** —— 還沒跑過任何一份新版報告，見待辦 1

### 問題

`lib/ai/council/settings/load.ts` 把「老師的參考文件」綁在「有沒有已發布的設定版本」上：
`buildDocumentBlock()` 只寫在成功解析 published profile 之後，沒有 published 就直接回
`DEFAULT_RESULT`，其 `documentBlock` 寫死空字串。

線上實況（Supabase 查證）：`ai_documents` 有 1 份已勾選納入的
`四象問天機_風羿老師綜合判讀與回應規則`（3741 字），但 `ai_prompt_profiles` **0 筆**。
結果是後台顯示「已納入 3741 / 6000 字」，實際上那份文件一次都沒進過 LLM，
`council_runs` 40 份報告的 `prompt_profile_id` 全部是 null。

### 修法

`buildDocumentBlock()` 提前到取 profile 之前跑，四條路徑都帶同一份 `documentBlock`；
`DEFAULT_RESULT(reason, documentBlock = "")` 加第二參數；文件查詢自己吞例外回 `""`
（這查詢現在每份報告都會跑，不能有機會打掉已通過點數檢查的報告）。
新增 `lib/ai/council/settings/load.test.ts` 4 個 case 鎖住行為。

### 第二件事：報告骨架改採老師文件的段落順序（使用者拍板）

原本終稿 prompt 同時塞進兩套版型：老師文件第五節的 7 段順序，與 `reportSkeleton`
自己的順序，而骨架寫的是「嚴格依下列段落與順序」——等於給模型兩張互相矛盾的版型。
決定以老師的文件為準。新順序：

```
一、個案總論（先給結論）
二、關鍵點            ← 新增，文件說這是整份報告最重要的一段
三、術數資料完整度檢核  ← 文件沒有，系統保留；放在分判前先交代資料夠不夠
四..n、各術獨立判讀
n+1、四象合參
n+2、時間節奏          ← 新增
n+3、關鍵風險（最多三項）← 新增
n+4、行動方案（3/7/30 日）← 文件沒有，系統保留
n+5、最終建議
n+6、專業聲明
```

改動檔案：`settings/schema.ts`（reportSkeleton 加 keyPoint / timing / risk）、
`settings/defaults.ts`（三段預設內容＋終稿分身的段落清單）、
`settings/render.ts`（renderReportSkeleton 順序）、
`app/admin/prompt-settings/page.tsx`（後台補三個編輯區，否則老師改不到）、
`app/api/ai/council/route.ts`（終稿自我檢查清單補三條）。
中文序號是程式產生的，單術時交叉驗證段消失、序號仍自動接上。

`prompt-baseline.test.ts` 的 5 個 snapshot 是**刻意**更新的，
測試檔頭已加「刻意更新紀錄」說明原因與影響範圍。兜底報告與品質門檻未動。

### 待辦（依優先序）

1. ~~commit + push + 部署~~ **已做**（見上）。**接下來實跑一份報告**，確認：
   - 文件真的有進 prompt —— 查該次 `council_runs` 的 prompt 長度，比修復前的 40 份
     多出約 3700 字才算數；後台顯示的字數不能當證據（就是它騙了我們一個月）
   - 報告段落順序是新的，且關鍵點／時間節奏／關鍵風險三段確實有出現
   - 定不出應期時是否照規則明說，而不是硬給日期
2. ~~決策型態擴到 7 種~~ **已做**（見下）。上線後要看一份實際報告，
   確認模型真的會用到「宜借力推進」「宜調整策略後再進」這兩條新路，
   而不是全部塞回「有條件可成」。
3. 請老師到 `/admin/prompt-settings`、`/admin/school-settings` 各發布一版，
   之後報告才有 `prompt_profile_id` / `school_version` 可追溯。
4. `lib/yixue/school/schools.ts` 的 `fengyi-v1` calendar 參數仍註記「暫定，待簽核」，
   `decidedAt` / `decidedBy` 是空字串。
5. 小落差（不急）：終稿分身的段落清單寫「7日、14日、30日 KPI」，
   但 `actionPlan` 是 3/7/30 日。改版前就存在，這次沒一併動。

### 第三件事：決策型態 5 種 → 7 種（使用者拍板）

採老師文件第十一節的用詞，不是在舊詞上加兩條：

可進→可直接推進、可試行→有條件可成、暫緩→宜等待時機、不建議→宜暫時停止、
補資料後再判（不變），另新增 **宜借力推進**、**宜調整策略後再進**。

改動：`structured.ts`（`DECISIONS` ＋ `LEGACY_DECISIONS` ＋ `normalizeDecision()`，
機讀區塊規則補上三種型態的舉證要求）、`settings/defaults.ts`（品質門檻與骨架總論）、
`_steps/report-step.tsx`（徽章七色，渲染前先正規化）、`app/(public)/page.tsx`（首頁文案）。

**不需要資料轉檔**：DB 那 40 份舊報告存的是舊詞，`normalizeDecision` 會對到新型態，
徽章照樣有顏色；模型若沿用舊詞也會被正規化而不是丟掉。
新增 `structured.test.ts`（9 case）鎖住這件事。


## 2026-09-05｜註冊防刷、付款開通原子化、面相學理閘門、199 加購、後台半自動退款

### 目前狀態

- **兩個 migration 已用 Supabase MCP `apply_migration` 套到正式庫**（非 `supabase db push`）：
  `20260905100000_trial_phone_claims`、`20260905120000_paid_entitlement_atomic`。
- **已 commit、已 push、已部署，正式站驗證過功能是活的。**
  - `46991ad` 程式與 migration（28 檔）、`c004595` 交接文件
  - Vercel `dpl_AcGkRj1EP8dG4wPMrQZ8Lfdtchvf` → READY（production，commit `c004595`）
  - 兩個 commit 一次 push，Vercel 只建 head commit，但已包含全部變更
- 正式站煙霧測試：`/api/plans` 回傳 `is_addon` 欄位與 `single_report`（199/20 點），
  加購排最後、`e2e_card_test` 未外露；前台 JS 確認「偽 GPT」已移除、價格單位為 `/ 單次`、`/ N 天`。
- `tsc` / `vitest`（184 passed）/ `next build` 全過。

### 這次做了什麼

**A. 註冊贈點防刷** —— 同一支手機只發一次免費體驗，但**不擋註冊**（只是不發點，避免誤傷
想直接買方案或家人共用門號的人）。`trial_phone_claims` 以正規化手機為 PK 當併發鎖，
`grant_signup_trial` RPC 把認領＋建 entitlement＋寫交易包成單一 transaction。
要放行某支號碼就刪認領表那一列。人工補點走 `admin_adjustment`，**不要偽造 `trial_signup`**。

**B. 付款開通（最重要）** —— 原本 `notify/route.ts:59` 的早退擋在補開通邏輯之前，
「訂單標 paid 後、建 entitlement 前失敗」會變成收了錢永遠不開通，而綠界重送也救不回。
正式庫已有 2 筆這種訂單（皆為 1 元測試單，真實付費的都正常）。
現在改走 `commit_paid_entitlement` RPC，原子化且以 `source_order_id` 冪等，重送能補開。

**C. 續訂規則** —— 剩餘點數疊加、效期從 `max(現有到期日, now)` 往後延，舊 entitlement 歸零 expired。
原本每次購買都新增獨立 entitlement，而讀取端只取「到期日最晚」那筆，舊點數等於消失。

**D. 付款結果頁** —— 新增 `/api/member/orders`；`/member` 讀 `?payment=`／`?order=` 並輪詢
10 次×2 秒，同時列出未完成訂單。原本這兩個參數完全沒人讀。

**E. 面相硬性閘門** —— `teachings` 與 `photoFingerprint` 皆為空時不出報告也不扣點。
原本只有 prompt 軟約束。

**F. 文案／內部方案** —— 移除前台「偽 GPT」字樣、點數不再寫成「次」、
`orders/create` 擋 `e2e_` 方案（用 `ALLOW_INTERNAL_PLAN_CHECKOUT=true` 才放行）。

**G. 199 元單次報告加購**（migration `20260905140000_single_report_addon.sql`，已上正式庫）
—— `plans.is_addon` 欄位 + `single_report` 方案（199 元 / 20 點 / 30 天）。
**加購不延長效期**：有有效方案時只把點數併進去、到期日不動；沒有方案才給自己 30 天。
`tier.ts` 與 `face-tier.ts` 的允許清單都補了 `single_report`（漏掉會變成「買了不能用」）。
順手把方案頁的「NT$980 / 月」改成「/ 30 天」——綠界是單次 AIO，沒有定期定額，
寫「/月」會讓人以為每月自動扣款。

### 面相模組稽核結論（使用者的疑慮：會不會只是 AI 推理）

**架構是對的。** 視覺層 schema 是 `.strict()`，只准回傳可見幾何，健康／人格／年齡欄位直接被拒；
規則層是確定性比對（正式庫 67 條已發布教材規則，DB 空了回退內建約 40 條）；
撰稿層**拿不到照片**，只收結構化 rules。
實跑佐證：08-19 規則上線後的 5 份報告命中 7～10 條；之前 13 份 0 命中的是規則功能上線前的舊報告。

**但知識卡通道 100% 休眠**：`knowledge.ts:7` 要求 `auto_report=true AND safety_level='standard'`，
正式庫 28 張全是 `auto_report=false`、high(15)/critical(13)，沒有一張 standard，查詢永遠回空。
**這次刻意沒動**——裡面含望診健康，翻旗標等於把健康敘述推進會員報告，要老師自己審過才能決定。

### 修改檔案

- 新增：`supabase/migrations/20260905100000_trial_phone_claims.sql`、
  `supabase/migrations/20260905120000_paid_entitlement_atomic.sql`、
  `app/api/member/orders/route.ts`、`lib/auth/member.test.ts`
- 改：`lib/auth/member.ts`、`app/api/auth/register/route.ts`、
  `app/api/payments/ecpay/notify/route.ts`、`app/api/orders/create/route.ts`、
  `app/api/face-analysis/runs/[id]/analyze/route.ts`、`app/(public)/member/page.tsx`、
  `public/js/member-auth.js`、`public/js/member-ai.js`、`public/js/member-pricing.js`、
  `styles/member.css`、`.env.example`、`CLAUDE.md`

### 未完成、風險與待辦

1. **未 commit、未部署**（DB 已就緒）。migration 是用 MCP 套的，遠端歷史已有這兩筆；
   之後 `supabase db push` 應顯示無待套用。兩個 migration 本身都可重複執行。
2. Codex 稽核指出但**這次沒做**的項目：
   - notify 未核對 `MerchantID`、currency、TradeNo 一致性（只驗 CheckMacValue 與金額）
   - ATM／超商未寫入虛擬帳號／繳費代碼／期限（`notify/route.ts:48` 已有註解說明）
   - 未登入按購買不保留選定方案（`member-pricing.js:337` 的 next 沒帶 planCode）
   - 同方案可無限重複建單，沒有 pending 訂單重用
   - 方案頁寫「NT$980 / 月」但實際是單次購買，非自動續扣
   - 點數不足的錯誤訊息沒有購買按鈕
   - 新版會員中心 token 過期不自動 refresh
   - 底層英文錯誤仍可能直接顯示給使用者（`lib/auth/member.ts` 的 errorMessage）
3. 正式庫仍有 2 筆已付款未開通的 1 元測試單（2026-05-25），綠界不會再重送，未處理。
4. 使用者已確認：**保留 trial 30 點的 10 點死點**，這是刻意的沉沒成本設計。
5. 後台退款**半自動版已完成**。第二階段（接 `Credit/DoAction` API）的技術細節見下節。
6. 退款刻意沒做的三件事：不呼叫綠界 API、不作廢發票（EZPay 只有 `issueInvoice()`）、
   不回溯續訂延長的效期。前兩件在 UI 上都有明確提示要人工處理。

**H. 後台半自動退款**（migration `20260905160000_manual_refunds.sql`，已上正式庫）

綠界 `Credit/DoAction` 沒有測試環境，所以**這一版不呼叫綠界**：
實際退款由管理員到綠界廠商後台操作，系統負責事前試算與事後原子化登錄。
未來接 API 時把 `refunds.method` 從 `manual_ecpay` 換成 `api_ecpay`，資料模型不用動。

- `refunds` 表**只新增不修改**，每次退款一列；`admin_profile_id`／`admin_email` not null
- `orders.status` 加 `partially_refunded`
- `preview_order_refund()` 唯讀試算；`commit_manual_refund()` 一個 transaction 內
  完成「寫紀錄 ＋ 回收點數 ＋ 更新訂單 ＋ 同步課程報名」
- **點數政策**：收回 min(本單發出點數, 目前實際剩餘)，部分退款按比例折算；
  已用掉收不回的記在 `credits_shortfall`，**現金退多少由管理員決定，系統不替生意做決定**
- 後台 UI 在 `/admin/orders/[id]`：試算數字 → 填金額／原因／綠界備註 →
  **必須勾選「我已在綠界後台完成退款」** → 送出。已開發票會提示要另外到 EZPay 作廢
- 只允許具名管理員（`requireNamedAdmin`，已從兩個 route 收斂進 `lib/auth/admin.ts`）

### 後台刷退可行性（2026-09-05 評估結論，第二階段參考）

**做得到，但綠界這支 API 沒有測試環境**（官方明載「因無法提供實際授權，故無法使用此 API」），
第一次驗證只能拿正式環境的真實交易做。這是決定要不要做的關鍵風險。

綠界信用卡請退款 API `https://ecpayment.ecpay.com.tw/1.0.0/Credit/DoAction`：

- Action：`C` 關帳／`R` 退刷／`E` 取消關帳／`N` 放棄，依訂單狀態選用
- **加密與現有程式完全不同**：不是 CheckMacValue(SHA-256)，是 JSON POST +
  `RqHeader.Timestamp`（10 分鐘內有效）+ `Data` 做 **AES-128-CBC/PKCS7**
  （key=HashKey、iv=HashIV，URLEncode → 加密 → Base64）。
  `lib/payments/ecpay.ts:8` 的 `createCheckMacValue()` 不能重用，要另寫 adapter
- 21 天內須完成關帳，90 天後系統自動放棄；綠界帳戶餘額不足無法退刷
- 分期與紅利折抵須全額退刷，只有一般交易可部分；ATM／超商不走這支

程式面缺口：

- `app/admin/orders/` 是純查詢，`app/api/admin/orders/route.ts` 只有 GET
- `orders.status` 已允許 `refunded`，但缺 `refunded_at`／`refund_amount`／`refund_reason`／操作者
- `payments` 是 upsert 在 `(provider, merchant_trade_no)`，一張訂單只有一列，
  存不了多次退款嘗試 → 需另建不可覆寫的 `refunds` / `payment_operations`
- `lib/auth/admin.ts:5` 的 `X-Admin-Key` 是共用密鑰、audit 的 `admin_user_id` 為 null，
  刷退應限具名 admin
- EZPay 已有作廢 URL（`ezpay-config.ts:38`）與 DB 欄位（`0008_invoices.sql:44`），
  但程式只實作 `issueInvoice()`，**沒有 `voidInvoice()`**

**點數回收是最麻煩的一段，而且是這次改動造成的：**
續訂結轉會把舊點數併進新 entitlement 並歸零舊的，所以不能直接取消某張訂單的 entitlement
（會連舊點數一起收回）。加上 `credits_remaining >= 0` 的 constraint，
已用掉點數的訂單無法直接扣回。**要先定商業政策**：只收未使用部分／按已用折價／轉人工審核。

⚠️ `app/api/admin/credits/route.ts:68` 的人工扣點用 `Math.max(0, current + amount)`，
餘額不足時實際只歸零但 ledger 仍記全額 → 帳實不符。**不可拿它做退款回收。**

### 下次起手式

1. `git pull`、讀本檔與 `worklog.md`；`git status --short --branch`。
2. commit + 部署。
3. 部署後真人驗收三件事：
   - 用沒領過的手機註冊 → 拿到 30 點；同手機換 email 再註冊 → 註冊成功但不發點、導向方案頁
   - 買一次方案 → 回站看到「付款完成，方案已開通」與訂單編號；有剩餘點數時再買一次 → 點數疊加、效期延長
   - 面相跑一次 → 確認報告有引用老師條文
3. 加購：有方案時買 199 → 點數 +20、到期日不變；沒方案時買 → 20 點 / 30 天。
4. 退款：找一張已付款訂單開 `/admin/orders/[id]`，確認「退款」區塊的試算數字正確
   （本單發出點數／目前可收回／發票號碼）。**先不要真的按下去**，除非真的要退那筆錢。
5. 之後若要做第二階段（接 `Credit/DoAction`），見上節技術細節；
   要先補 EZPay `voidInvoice()`，並決定「已用掉點數時現金退多少」的政策。

### Git 狀態

- `main...origin/main` 同步，工作樹乾淨。最新：`c004595`。

### 長時間程序

- 無。

---

## 2026-09-05｜註冊贈點防刷：同一支手機只發一次免費體驗

### 目前狀態

- 程式改完、`tsc` 與單元測試全綠。
- **migration 已用 Supabase MCP `apply_migration` 套到正式庫（非 `supabase db push`）**，
  回填 10 列、RLS 開啟 0 policy、function 為 security definer、anon/authenticated 不可執行、
  service_role 可執行；正式庫實測拒絕路徑全部正確且無副作用。
- **尚未 commit、尚未部署**。DB 已就緒，所以部署前的空窗期不會出事：
  舊程式不認識這個 RPC，行為與先前相同。

### 問題（有實據，不是臆測）

正式庫 16 個 profile 裡有 3 組重複手機，其中兩組是自己的 admin 與 e2e 測試帳號，
**真實濫用只有 1 例**：同一支手機 `...098`，`2026-06-16` 註冊用掉 20 點，
`2026-07-16`（trial 到期當天）換 email 重註冊再領 30 點。

成因不只是「太好刷」，也是制度在逼人刷：贈點 30 點＝1 次報告（20 點）＋10 點死點，
第二次只能付 980（basic 106 點 → 1 點約 9.25 元，30 點約值 277 元）。

### 做法

**同一支手機只發一次贈點，但不擋註冊**——註冊照樣成功，只是不發點，
才不會誤傷想直接買方案或家人共用門號的人。要重新放行就刪認領表那一列。

原子性是重點。第一版用 SELECT 檢查，經 Codex 審查發現兩個真缺陷（已修）：

1. **併發雙領**：先查後寫沒有鎖，同手機不同 email 同時送兩個註冊會各發一次。
2. **半完成寫入**：entitlement 先建、`trial_signup` 後寫；第二步失敗的話人有 30 點、
   系統卻沒有領過的證據，下次還能再領。

改成 DB 層保證：`trial_phone_claims` 以正規化手機為 primary key（PK 就是併發鎖），
`grant_signup_trial` RPC 把「認領＋建 entitlement＋寫交易」包在同一個 transaction。

### 修改檔案

- `supabase/migrations/20260905100000_trial_phone_claims.sql`（新）— 認領表＋回填＋RPC
- `lib/auth/member.ts` — `grantTrialEntitlementIfNew()` → `grantTrialIfEligible()`，改為 RPC 薄包裝；
  `authResponse()` 多收 `notice` / `trial_granted`
- `app/api/auth/register/route.ts` — 依發放結果決定歡迎信內容、admin 通知信與回應 notice
- `public/js/member-auth.js` — 文案改由後端 notice 決定（原本寫死「已贈送 30 點」，不發點時會變成謊話）；
  沒拿到點就導向 `/member-pricing` 而非 `/member-ai`
- `styles/member.css` — 新增 `.status.warn`
- `lib/auth/member.test.ts`（新）— 8 個測試
- `CLAUDE.md` — 點數規則表補一列，並修正飄掉的行號

### 驗證結果

- `npx tsc --noEmit` 通過；`npx vitest run` 22 files / 184 passed、2 skipped。
- **本機 Postgres 開暫時庫實跑 migration**（無 Docker，未用 supabase start）：
  - 循序：全新手機 granted／同手機換 email `phone_already_claimed`／同 profile 重複 `already_granted`／
    手機格式不合 `invalid_phone`（不是照發）
  - **併發**：A 開 transaction 領點不 commit，B 中途插入 → B 被鎖 2192ms 後回 `phone_already_claimed`，
    該手機總共只發 1 份
  - **原子性**：用 trigger 強制最後一步失敗 → 認領表／entitlement／交易三張表零殘留，
    且該手機沒被誤鎖，之後仍能正常領
  - 測試庫已 drop
- 正式庫 dry-run：回填會鎖 10 支手機（實際領過 trial 的）；新規則若早就上線，16 個 profile 中
  **只會擋掉 1 個，就是那個真實濫用案例，零誤傷**。

### 未完成、風險與待辦

1. 已上線。注意四個 migration 都是用 MCP `apply_migration` 套的，遠端 migration 歷史已有這些；
   之後跑 `supabase db push` 應該顯示無待套用項目，若提示要重跑請先確認不會重複執行回填
   （回填有 `on conflict do nothing`、建表有 `if not exists`、function 是 `create or replace`，
   本身可重複執行）。
3. Codex 另指出（本次未處理，屬相鄰範圍）：`app/api/courses/checkout/route.ts:15,166`
   建 profile 時電話**沒有**跑 `normalizeTaiwanMobile`，會在 `profiles.phone` 留下非正規化字串。
   目前不影響本控制（課程 profile 不會有 `trial_signup`，且日後同 email 註冊時 upsert 會覆蓋成正規化值），
   但屬資料衛生問題，建議之後統一。
4. P1 產品面（今天只做了 P0 防刷，真解在這裡）：
   - 加中間價位單次報告加購（約 199～299），讓「想再看一次」的人有正當管道，刷的動機才會消失
   - 處理 10 點死點：trial 改 20 點、或做一個 10 點以內的小功能給它出口
   - trial 到期前 3 天寄信 ＋ 到期後首購折扣（6/16 那位是熱門名單，被當成資安事件處理了）
5. 誤傷的人工處理路徑：客服核對後補點請走 `admin_adjustment`，**不要偽造 `trial_signup`**；
   要整支號碼重新放行就刪 `trial_phone_claims` 那一列。

### 下次起手式

1. `git pull`、讀本檔與 `worklog.md`；`git status --short --branch`。
2. **真人驗收（尚未做，這是最優先的事）**：用一支沒領過的手機註冊，確認拿到 30 點；
   再用同一支手機換 email 註冊一次，確認註冊成功、但沒發點、文案是
   「此手機號碼先前已使用過免費體驗…」且導向 `/member-pricing`。
4. 接著做 P1（使用者 2026-09-05 已拍板三項：單次報告加購、10 點死點的出口、trial 到期前後的信）。

### Git 狀態

- `main...origin/main`，有未 commit 變更（見上）。

### 長時間程序

- 無。

---

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

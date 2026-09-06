# Handoff

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

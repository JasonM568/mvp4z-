# Handoff（最新：2026-11-15 報告管線）

更新：2026-11-15。上線站 `https://www.xunfeng.tw`，最新部署 `44d48af` Ready。

## 1. 目前狀態（四象問天機報告管線）

- 三個分身（主判讀／策略推演／攻防反證）與終稿**全部由 OpenAI 呼叫**，不再使用 Gemini／DeepSeek（2026-11-14 使用者決定）。每份報告 7 次 OpenAI 呼叫：兩輪各 3 次＋終稿 1 次。角色代號 `geminiFengYi`／`deepseekAttack` 為接歷史資料而保留，後台標籤已標「（OpenAI）」。
- 三方必到：任一輪缺任一分身 → 不呼叫終稿、備援稿、不扣點、標「校核未完成：<分身名>」（`lib/ai/council/verification.ts`）。
- 告警：即時（金鑰被拒 400/401/403，或同分身兩輪皆失敗；3 小時冷卻，`provider-alert.ts`）＋每日排程；健康判定不看樣本數（`provider-health.ts`，近 48 小時）。
- 每輪單次逾時 75 秒、總預算 90 秒，終稿 110 秒（`ROUND_CALL_OPTIONS`）。
- 完整度檢核誤報（「缺起卦時刻／原始搖卦數據」）已修（`personas.ts`，commit 1ead07a）。

## 2. 驗證證據

- OpenAI 單一模型版正式站實測（QA 帳號，使用者授權）：run `caf23fcc-c795-47a0-9ead-5277e56440d4`，全程 75.6 秒，兩輪各三分身 ok:true（attempts=1），終稿正常，扣 20 點，非備援稿。測後密碼隨機化、點數歸零、audit `qa_prod_e2e_council` 已記。
- 前一版（三家）驗收：run b3dc1e28…，132.7 秒。
- tsc 乾淨、vitest 727 passed（2 預期 fail、3 skipped）。這次是直接打 API 驗證，沒有走登入畫面搖卦；沒看 provider-health 頁與告警信。

## 3. 未完成事項與風險

1. Vercel Production 的 GEMINI_API_KEY／GEMINI_MODEL／DEEPSEEK_API_KEY／DEEPSEEK_MODEL 未刪；`callGemini`／`callDeepSeek`（`providers.ts`）已是死碼。待使用者決定後清除。
2. 11/8 貼在對話中的 Gemini、DeepSeek 兩把金鑰建議作廢輪替。
3. 三分身同一 OpenAI 模型，獨立校核性較低；可選：每角色可設不同 OpenAI 模型（未做、使用者未要求）。
4. Preview 環境變數從未設（Vercel CLI 卡 `git_branch_required`）。
5. `OPENAI_MODEL` 值為加密，未讀；程式預設 gpt-4.1-mini。
6. 使用者帳號 306465 當時「掃描未完成」的畫面文字仍未取得。
7. 工作樹有非本次改動的未提交檔 `docs/qa/customer-uat-checklist-draft-2026-10-11.md`，勿動。
8. 教材（Stage 4）匯入草稿待老師校對、舊 6 參數 `commit_manual_refund` 待使用者同意才 drop——皆未動。
9. 下方 2026-10-12 的 QA 交接（候選 SHA、隔離 stack 等）仍為有效背景，但「最優先」的回滾事項已於 10/23 解決（見檔尾）。

## 4. 下次起手式

```bash
cd /Users/jasonmchen/codex-巽風系統/xunfeng-official-v2
git status --short --branch && git log --oneline -5
```
先問使用者：是否清掉 Gemini／DeepSeek 環境變數與死碼；是否要讓三分身用不同 OpenAI 模型。再依需要驗證 /admin/provider-health 與 /admin/council-runs。

## 5. Git 與程序狀態

- `main` 與 `origin/main` 同步（worklog 已推）；本檔更新尚未 commit 時請以 `git status` 為準。
- 沒有長時間程序在跑。

---

# 舊交接（2026-10-12 全系統 QA，保留供查）


更新：2026-10-12。目標為完成全系統功能測試與客戶驗收準備。本次僅整理 QA 最新回報至工作紀錄與交接；沒有啟動測試、資料庫、provider 或正式環境操作。

## 1. 目前狀態

- 全系統 Test Matrix 維持 29 個模組，88 個 API routes、50 個 pages；客戶 UAT 37 項均未勾選。部分候選／stub 通過只代表其明列範圍，沒有模組可標示為全範圍驗收完成。
- 分批驗收入口仍是 `docs/qa/CheckList.md` 與 `docs/qa/qa-acceptance-request-batches-2026-10-12.md`；依入場條件逐批執行並保留各票未驗範圍。
- 最新收到的 M27 回報已更正：QA route suite 標準模式 24 passed、7 expected fail／31；strict 模式 24 passed、7 failed／31。缺陷限非法 `hourBranch`、boolean `month` 與五個日期時間數字欄位接受單元素陣列；五個 `{}` object 對照均 400。使用真 `buildYixueChart` 與 auth stub，無 DB、Storage、LLM 或持久副作用；隔離 HTTP/UI 尚未驗。
- C27–C30 固定整合候選 `/private/tmp/xunfeng-c27-c30-release`，SHA `b77dcd5f97a55e87ae36b75bf64e6e1cf9521cee`：QA route 17/17、候選路由 suites 35/35；disposable native PostgreSQL 全序 59/59 migrations，M24 與 C20/C23/C22/C21/M25/C27/C29 SQL fault、ACL/RLS、併發 contracts 通過。只可記候選隔離 route/native-PG 通過；Supabase HTTP/Auth/Storage、production build、部署與客戶 UAT 仍未通過驗收。
- C26 候選 `/private/tmp/xunfeng-c26-pending-drafts` 仍為 clean `fe78118fbdaa7ddbbe7c8a71c977c39133a5b32c`，尚無新 SHA。依已決定的 allow-list/classified-error 標準，已知 strict 結果為 3 failed、1 passed；privacy release gate 維持開啟。收到新 SHA 後需驗 strict 4/4，並確認管理 UI 僅顯示安全分類、不呈現 raw provider detail。
- C21/M25 的 HTTP、跨程序 cache 與完整 consumer gate 仍未驗。最新唯讀資源檢查為 Docker 54 個 containers、swap free 約 802.5 MiB、`vm_stat` free 約 57 MiB；未開新 stack。M2 owner stack 的 fixture 數未知，不可使用。
- M23 Option A `42175c1` 維持 feasibility-only；`cleanup_pending` 無 lease reclaim/reconciler，移除失敗後重領仍 `may_delete=false`。真 Storage、HTTP transport loss、Supabase ACL/full replay 及 M22 rollback 相容性未驗；不得標 M22/M23 正式通過。

## 2. 最近完成與證據

- M27 最新更正：`scripts/qa-school-settings-preview.test.ts` 標準 24 passed、7 expected fail／31，strict 24 passed、7 failed／31。五個單元素陣列仍被 coercion 成合法數字並回 200；非法 `hourBranch` 與 boolean `month` 也仍未達 400 驗收；object 型別皆拒絕。QA 已同步 ticket、matrix、UAT M04。
- C27–C30 候選本輪再次獨立複驗：QA 自有 route suite 17/17、candidate suites 35/35；59/59 unique migrations 及指定 SQL contracts 通過。scratch cluster 已移除，候選 worktree clean。未使用 Supabase HTTP/Auth/Storage 或正式服務。
- 上述結果均不得延伸解讀為正式站、完整服務整合或客戶驗收通過。其他已記錄的候選與歷史測試數字以各 QA ticket／worklog 的具體 run 為準，不將不同批次合併成單一全量通過結論。

## 3. 尚未完成事項與風險

0. **【最優先】正式站已於 2026-10-17 回滾到 `1935618`**（`dpl_FLG1koTbFyVZzg5z927tL2iBerby`）。原因：`c427637` 一次帶出 211 個 commit，但正式庫缺 `20261011045641`～`20261011200000` 共 8 個 migration，造成 `manage_referral_partner` 等 RPC 不存在（後台分潤新增失敗）。分潤後台新增已於 2026-10-17 經使用者實測恢復（舊版直接寫表路徑）。已套用正式庫的 migration 只有 `redeem_activation_code`（新增函式、無人呼叫）；其餘 7 支與 `200000` 未套。接手第一步：逐支審這 8 個 migration、訂套用順序、套用到正式庫，再 promote 回新版。回滾期間手機溢字修復（`c427637`）也不在線上；專案 `live:false`，後續 push 不會自動上線。10/16 另有約 6 小時 Supabase DNS ENOTFOUND 事件，成因未明。

1. 等待隔離資源足以安全運行時，再安排 QA 自有、fixture 已核對的 Supabase stack；不可使用 C4、M2 或其他 owner stack。
2. C26：等待 allow-list/classified-error 修補 SHA；確認 helper return、test-alert JSON、cron JSON、logs 與 UI 不暴露 provider 原文／敏感 marker。
3. C27–C30：候選 native-PG/route gate 已有證據，仍需專用 Supabase HTTP/RPC 權限與 audit fault rollback/retry、build／部署後檢查及 UAT。
4. M27：等待修補候選，strict suite 應達 31/31；後續補隔離 HTTP 授權回歸。
5. C21/M25、C32 等 HTTP/DB/cache gate 維持未驗；先做 Docker／記憶體健康檢查與 fixture 清零確認，再決定是否能啟動隔離服務。
6. C33、C31、C2 等 Critical 缺陷與 M8、M10、M26、M30、M31 等 backlog 依 QA ticket 追蹤；保留其明列的產品決策與服務端驗收缺口。
7. M23/M22 不升格；先由工程提出有界 lease/CAS reconciler、精確 key 保護與 rollback 相容方案，再安排隔離真 Storage 複驗。
8. 正式部署 SHA、migration history 與客戶 UAT 尚未完成核對；候選證據不可替代正式站驗收。
9. 待產品／隱私權責人決策：C2 超額扣點採整筆拒絕或扣至零；M1 是否接受 LINE／國際電話自由格式；M3 是否採每次提交 idempotency key；M29 照片保存期限從建立或完成起算；C26 每草稿寄送形式、unknown 結果處理責任與 outbox retention policy。

## 4. 下次起手式

```bash
cd /Users/jasonmchen/codex-巽風系統/xunfeng-official-v2
git status --short --branch && git log --oneline -5
# 閱讀本檔、worklog.md 最新紀錄、memory.md；再按 QA 批次請單與各票固定 SHA／環境條件續作。
```

收到新固定 SHA 後先核對候選 worktree 與 QA 驗收命令。啟動隔離服務前先檢查 Docker／記憶體資源、專用 project/ports/volume 與 fixture 數；健康檢查未通過即停止該 gate，不借用 owner stack。沒有新 SHA 或環境變化時不重跑已通過的同 SHA 案例。

## 5. Git 與程序狀態

- 根工作樹分支 `main`，HEAD `c427637`（手機版標題溢字修復，已 push），與 `origin/main` 同步、無 ahead（舊紀錄的「ahead 210」已過時）。工作樹仍有 QA 文件、測試、runner、證據圖與退款腳本的 modified/untracked 變更，不得 stage、commit、revert 或清理。
- C27–C30、C26 等隔離候選狀態以各自固定 worktree／SHA 為準；本次未改候選。
- 本次沒有啟動長時間程序、Docker stack、資料庫或外部 provider；未操作正式資料。


## 2026-10-23 更新
正式站已 promote 至 c427637（含 QA 修復＋手機溢字修復），8 支 20261011* migration 已補套（200000 以 execute_sql 套用、未 drop 舊 6 參數退款函式）。待辦：管理員實測分潤／退款／知識卡；使用者同意後 drop 舊函式並補 migration 歷史；之後進入四象與面相改版（見 優化建議/修改指令.txt）。

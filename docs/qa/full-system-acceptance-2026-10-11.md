# 全系統功能測試與客戶驗收追蹤（2026-10-11）

範圍：`xunfeng-official-v2` 當前 `main`，起始盤點基準 commit `1935618`；B2/C4/M4/M6/M2 修補已在本機提交至 `92e6ef7`，仍須核對遠端與部署。本文件是執行中的驗收清單，不把既有單元測試或讀碼推論當作正式站端到端驗收。交接紀錄若與程式及 migration 衝突，以實際程式及 migration 為準。

## 環境、證據與狀態

- [API 與頁面路由清單](route-inventory-2026-10-11.md)已按目前程式重盤 **88 個 API route 檔／50 個頁面檔**，同步 B1／C19／M18–M22／C15 等較新候選證據。清單逐路由標明已驗範圍與待驗項；候選隔離通過不等於當前 main 或正式站通過。產生器保留人工核實的狀態註記，重跑不會覆蓋為舊硬編碼結果。
- `app/api/admin/email-domain/route.qa.test.ts` 以路由實際 GET／POST＋Resend `fetch` 替身 **11/11**：管理員拒絕、缺金鑰、空／已存在網域、建立冪等、驗證後仍 pending、非法／超長 action 與上游錯誤；`npx tsc --noEmit` 通過。測試只用假金鑰、無外網或 DNS 改動。[舊交接](../handoff-archive/handoff-until-2026-10-08.md)另記載正式 Resend 網域曾回 `verified` 且使用者已收到測試告警；本輪未重查當前正式狀態，註冊／付款／重設信的端到端寄達亦未驗。
- 正式站公開頁唯讀 SSR 煙霧 `node scripts/qa-public-page-smoke.mjs --base-url=https://www.xunfeng.tw` **9/9**：首頁、關於、服務、案例、課程、預約、會員方案、隱私、thanks 均 HTTP 200，title／h1／main 存在且無 Application error。只檢查 SSR shell，不代表 hydration、表單／購買互動、連結正確性或手機視覺通過；未送出表單。
- 本機：macOS / Next.js 15.5.23 / Node 專案依賴；`.env.local` 已配置。本輪無正式資料寫入、無真實付款、無 LLM 呼叫。
- `npm run test:unit`：在納入寄件網域與面相圖片 cron 測試的目前 main 重跑，**75 test files passed／3 skipped；650 tests passed／2 expected fail／3 skipped**。兩個 `it.fails` 仍在 `app/api/ai/chat/route.qa.test.ts`（B1 同會員並發）與 `app/api/admin/credits/route.qa.test.ts`（C2 補扣點帳本），代表已知缺陷，不能當功能通過；候選隔離修復也不等於 main 已修。
- `npx tsc --noEmit`：通過；`npm run build`：通過，117 靜態頁產出。
- `node scripts/qa-safe-api-smoke.mjs --base-url=http://localhost:3100`：21/21 通過。涵蓋公開 GET、失效 token、SQLi 形狀字串、超長輸入、未授權或必定在寫入前被拒絕的 POST。
- `node scripts/qa-admin-authz-smoke.mjs --base-url=http://127.0.0.1:3101 --members-file=/private/qa-members.private.json`：**219/219 通過**。29 個 GET、44 個寫入方法，各以匿名、無效 bearer、有效一般會員 bearer 發送空請求；前兩者 401、一般會員 403。先對 `/api/member/me` 預檢有效 token 為 200，避免把失效 token 當會員角色測試；在 repo 外獨立 Next clone 執行，避開共用 `.next`。此結果不涵蓋具名管理員正常寫入。
- C4 原有 QA route 預期失敗測試已由隔離 API/DB 腳本取代並移除，避免工程改成 RPC 後只因舊 mock 失效而繼續顯示 expected fail。工程新增 `app/api/payments/ecpay/notify/route.c4.test.ts`，最新全套含其 5 個通過案例；真正驗收仍以隔離 DB 實測為準。`npx tsc --noEmit` 與 `git diff --check` 再次通過。
- 獨立 QA 執行 `scripts/qa-ecpay-notify-accounting-local.mjs` 於本機隔離 Supabase＋stage/local MAC 的 3101 API：**付款帳務 0/2 不合格；跨會員訂單讀取 2/2 通過**。① pending 訂單 980，成功通知 979 → HTTP 400，但付款列 `paid`、訂單仍 `pending`；② paid 訂單／付款，後到失敗通知 → HTTP 200，但付款列 `failed`、訂單仍 `paid`。每筆自建訂單 A 可讀、B 查同 ID 為 0；在 `finally` 刪除並核對 orders/payments 0 筆。未呼叫真實金流／開票。
- C4 新修補在另一套本機隔離庫（3102）初步複驗：錯金額 400、canonical payment 0、稽核事件 1；paid 後失敗通知 200、canonical 仍 paid、稽核事件 1，**2/2 通過**。10 並發重送初跑使用既有 fixture 會員，得到 1 權益與 2 交易；第二筆是合法 `plan_renewal_carryover`，非重複發點。該初跑使 fixture 原有效權益歸零；QA 已依其結轉交易 `balance_after=50` 恢復最新權益為 active/50，舊權益保留 expired/0，並告知工程1。腳本隨後改為每輪建立與刪除全新會員，在 3103 production build 上重跑，結果見下項。
- C4 新修補 production build 在同一獨立隔離庫由 QA 於 3103 跑全新會員／訂單回歸：錯金額與 paid 後失敗 2/2 通過；**同單 N=10 並發重送出現間歇 500**。20 輪中 2 輪各 1/10 回 `500 0|Payment notify failed`、稽核事件僅 9，canonical payment、權益、`ecpay_payment` 交易仍各 1；其餘 18 輪均 200、稽核事件 10。QA 另直接呼叫本機 PostgREST RPC，同碼 N=10 第 5 輪取得精確 SQL 錯誤 `23505 duplicate key ... idx_payments_provider_trade_no_unique`：RPC 的 `ON CONFLICT(provider,merchant_trade_no)` 無法處理另一個 provider_trade_no 唯一索引的並發競爭。每輪專用資料已清理；X-PM 與工程1已收到根因與驗收條件。
- 工程1新增 `20261011120001_ecpay_notification_lock_and_invoker.sql` 後，QA 在同一獨立隔離庫／3103 production build 重新執行腳本 **連續 20 輪全部通過**，每輪建立全新會員與三張訂單：錯金額回 400、不留 paid；已 paid 後的失敗通知回 200、不降級；同單 10 筆並發通知全回 200、稽核事件恰 10、canonical payment／權益／`ecpay_payment` 交易各恰 1。總計 60 個情境、200 筆並發重送，`failed_rounds=0/20`；各輪資料已清理。這是隔離環境回歸，正式 migration／部署及真實金流仍待複驗。
- 工程1隨後對 C4 專用庫做**乾淨 migration reset**，並把跨單 provider trade number 唯一衝突明確轉成 `trade_conflict`。QA 將腳本擴成第四情境：已存在的 paid 訂單占用同一 `provider_trade_no`，新 pending 訂單合法通知回 409；舊付款與訂單維持 paid，新單無 canonical payment／權益／交易，只追加一筆稽核事件。最新 production build／clean DB 上 **四情境連續 20/20 輪通過**，其中同單並發共 200 筆。中途隔離 stack 重啟曾導致連線拒絕與 PostgREST `PGRST002`／503，那批環境中斷測試作廢；服務穩定後完整重跑全綠。每輪自建會員／訂單、逐輪清理核對；正式部署與真實交易仍待驗。
- 工程1最終 clean reset 後，X-QA 再獨立從目前 main 的腳本執行 C4 **20 輪、四情境 80/80**；每輪全新 profile/order，paid 同單 N=10 全部 200、events=10、payment／entitlement／credit transaction 各 1；錯金額 400、paid 後 failed 200、跨單 provider trade number 衝突 409，測試資料每輪清 0。輸出留於 repo 外 `/private/tmp/xunfeng-qa-c4-independent-20.log`。DB migration 最新為 `20261011120001`，RPC EXECUTE 的 anon/authenticated/service_role 為 false/false/true；events SELECT/INSERT 亦為 false/false/true。先前 23505 所致 500 在本次 200 筆同單並發請求未重現；正式部署仍待驗。
- `scripts/qa-ecpay-rpc-authz-local.mjs` 對同一 C4 隔離庫驗證 5/5，連續三次通過：service role 可看稽核表、可抵達 RPC 且假 MAC 在寫入前遭拒；匿名角色呼叫 RPC／讀稽核表各 401，有效簽章的一般會員角色各 403。測試使用不存在訂單與無效 MAC，不會產生資料。此為本機角色權限驗證，正式庫授權需部署後核對。
- 正式站五個 `/api/cron/*` GET 入口匿名請求均回 401；未觸發排程寫入。
- `node --env-file=.env.local scripts/qa-rls-anon-smoke.mjs`：11/11 有樣本的敏感表對匿名身分隱藏；`face_knowledge_revisions` 無樣本而跳過。唯讀比較、未列印資料。這不代表已驗證「會員 A 看不到會員 B」。
- 獨立 QA 在 repo 外隔離 Supabase 用 A/B 專用帳號執行 `scripts/qa-rls-member-isolation.mjs`：7/7 通過。A、B 各可讀本人 profile、entitlements、credit transactions，對方三表各 0 筆；以過期 JWT 直接打 PostgREST 得 401。只讀、無帳密或個資輸出；驗證範圍是這三表與過期 token，其他資料表及寫入隔離待驗。
- `scripts/qa-rls-member-writes.mjs` 在同一隔離庫用有效一般會員 token 直接打 PostgREST：**6/6 通過**。修改本人／他人 profile 及他人 pending 訂單，DB 均無變化；直接插入 paid 訂單、9,999 點權益、9,999 點交易均回 403，DB 均 0 筆。自建訂單已刪、profile 原值及 4 類 QA ID 均再次核對，無殘留。尚未涵蓋其他表與 RPC 授權。
- QA-FS-B3 補充：X-PM 最小撤權候選 `efc57dc` 的 migration 由 X-QA 在現有主 QA 隔離 DB **BEGIN／ROLLBACK** 套入，Chat／Council 的 anon/authenticated/service_role `EXECUTE` 均為 `false/false/true`；未寫 migration history。`scripts/qa-credit-rpc-postgrest-local.mjs` 以新登入的 QA 會員及不存在 UUID 直接打本機 PostgREST，**6/6**：兩 RPC 匿名 401、會員 403／42501、service_role 可進函式但以 CR002 拒絕不存在權益，無資料寫入。**該 QA DB 套候選前已顯示兩 RPC 會員不可執行，故 HTTP 結果不能單獨證明此候選在乾淨 stack 的部署效果；B3 保持 BLOCKER**。另一個 SET ROLE＋DO 交易式試驗造成 DB backend 斷線與 4 個 QA profile／2 個 entitlement 殘留，已精確清理並核對 0，危險腳本未入庫；不可引用其結果放行。
- B3 乾淨複驗：QA 從 `hotfix/b3-credit-rpc-execute`／`efc57dc` 建**全新獨立 Supabase stack**，48 份 migration 乾淨套用，最後一份 `20261008090000`。`scripts/qa-credit-rpc-isolated-local.mjs` **連續兩輪各 5/5**：自建會員 A/B、B 5 點；A 有效 bearer 直呼 Chat／Council 舊 RPC 傳 B 的真 profile／entitlement ID 皆 403／42501，B 點數仍 5、ledger 0；匿名各 401；service_role 依序呼叫兩 RPC 皆 200，B 5→4→3、`ai_chat`／`ai_council` 交易各 -1 且餘額對上。每輪 Auth/profile/entitlement/ledger fixture 清 0，另 SQL 查 Auth/profile/交易 0。**候選隔離 DB/API 授權複驗通過；完整 Chat／Council route 與正式庫部署仍待，B3 不結案**。
- B1 工程候選 `4162ce7`（含 B3 撤權）由 X-QA 在**另一套全新隔離 Supabase stack，49 份 migration 乾淨重播**。工程 SQL 交易測試以 BEGIN／ROLLBACK 通過；`scripts/qa-chat-slot-concurrency-local.mjs` API N=10 第一筆搶租約、強制到期後重搶、舊 owner 不可釋放新租約，先 1 輪再 10 輪全部通過；`scripts/qa-chat-atomic-commit-local.mjs` 四輪各 **5/5**：3 點成功 usage/ledger 一致、ledger INSERT 故障時點數與 usage 回滾、同租約重試成功、已釋租約拒絕、1 點邊界至 0。`scripts/qa-chat-route-failure-local.mjs` 在 3215 detached app **兩輪各 7/7**：匿名401、空與 4,001 字訊息400、預占租約409且無扣點、模型 key 缺失500後租約釋放與零扣點／usage、重試不被卡、零點403。未呼叫付費 LLM；每輪 QA Auth/profile/權益/租約/usage/ledger/故障 trigger 清 0；最後 DB 再查 profile／租約 0。**候選隔離 DB 與無模型成本 API 故障路徑通過；有效模型回覆、真正並發 HTTP 交付與正式站待驗，B1 不結案**。
- B1 真正 HTTP N=10 假模型腳本 `scripts/qa-chat-concurrent-http-local.mjs` 已建立，本機 OpenAI SDK 對 `OPENAI_BASE_URL` 及 fake Responses payload 單獨驗證可解析。**目前沒有有效 B1 HTTP 並發結果**：第一次同時送 10 筆時隔離 Auth 健康端點逾時，全部在身份驗證等約 27 秒後回 401、模型呼叫 0；重啟 Auth 後第二次尚未送出請求，專用 `createUser` 即逾時失敗。兩批都屬環境中斷，不能計為候選失敗或通過。專用 app／stack 以 `--no-backup` 停止且所有 3215／3291／58921／58922 listener 消失；腳本新增會員 API preflight，待穩定隔離環境重跑。
- B1/B3 整合候選 `release/b3-b1-origin`／`d5758bb`（含先前 B3 `8812817`）在 X-QA 專用 B1 stack 從候選檔案**乾淨套完 49 份 migration**。其 `scripts/qa-chat-single-flight-pg-local.sh` 直接 PostgreSQL N=10：取得租約 1、忙碌 9，為候選資料庫搶鎖的有效證據。其後 Colima/Docker 健康檢查不穩：第一次 Storage 未 ready，第二次雖以 `--ignore-health-check` 啟動但 Auth／REST 經 Kong 連續逾時，DB 亦由可連轉無回應；B3 ACL SQL 查詢中止，**沒有新的 B3 HTTP 或 B1 假模型 HTTP 結果**，不可計為產品通過／失敗。專用 stack 已 `--no-backup` 停止，58921／58922 listener 與容器均清 0。靜態整合比對另發現候選 Chat 權益排序只有 `expires_at DESC`，目前 QA main 尚有 `created_at DESC, id DESC` 作同效期決勝；已通知 X-PM 整合時保留並連同 C9 風險確認。
- **B1/B3 最新有效隔離端點複驗見文末補記。**前兩項環境中斷是歷史作廢批次，不再代表目前沒有 HTTP 證據；正式部署／站端回歸仍未完成。
- `scripts/qa-face-owner-local.mjs` 使用 A/B 專用完成狀態面相報告在隔離 API/DB 做 **8/8 通過**：A 列表與詳情只見自己且回傳不含 `storage_path`／`model_trace`，A 對 B 詳情、預覽、整份刪除及照片刪除均 404；A 直接 PostgREST 讀 face run 回 403，跨會員請求後兩筆 DB 狀態不變，測試列已刪除並核對無殘留。此測試未呼叫 PDF、上傳或 AI provider。
- `scripts/qa-council-owner-local.mjs` 使用 A/B 專用報告在隔離 API/DB 做 **5/5 通過**：A 列表／詳情只見自己、查 B 詳情 404；直接 PostgREST A 可讀自己 1 筆、B 0 筆；A 改 B 報告回 200 但 DB 無變化，直接 INSERT 偽報告 403、DB 0 筆。自建與偽造 ID 均清理核對；未呼叫 LLM 或扣點。
- `scripts/qa-admin-booking-local.mjs` 原在隔離 API/DB **5/7 通過、2 項不合格**：`limit=-1` 回 500、`limit=abc` 回 200。工程1提交 `9a8c33d` 後，QA 以獨立 clone `92e6ef7` production build／隔離庫重跑 **11/11 通過**：具名管理員列表／詳情／PATCH＋audit、非法狀態及會員越權、非法 limit -1／abc／0／501 均 400，合法 1／500 均 200 且列表／summary 一致。Auth/profile、預約、audit 已清理核對；正式部署待驗。
- M6 本次又用目前 main 的 repo 外獨立 Next clone 3191／主本機隔離 DB 複驗。初跑在會員權限步驟遇到 QA A/B 私檔舊 token 過期，該輪不計；以輪替後帳密重新取得本機 token 後，腳本新增缺省 `limit=100` 與 GET 前後 DB 全列不變斷言，**13/13 通過**。Auth/profile、預約與 audit 清 0；`route.m6.test.ts` 同輪通過。3191 只用於此新版 app，3101／3103 舊 build 不作 M6 判定；正式站待驗。
- `scripts/qa-finance-rls-local.mjs` 在隔離庫建立 A/B 專用訂單、發票、課程報名及使用量列，**9/9 通過**：兩名會員對四表均只讀到自己的 1 筆、對方 0 筆；A 直接 PATCH B 發票回 200 但 DB 保持 pending。測試列逐表清理並核對 0 殘留；這驗的是資料隔離，不代表付款／開票端到端完成。
- `scripts/qa-referral-lookup-local.mjs` 對隔離庫專用推廣人做公開查詢 **8/8 通過**：正確／大小寫代碼只回名字，空碼、SQLi 形狀、LIKE wildcard、33 字與停用碼均不回推廣人；匿名直接查 `referral_partners` 被拒絕。資料已清理。
- `scripts/qa-referral-order-local.mjs` 在隔離 API/DB 用專用推廣人 A/B 與 QA 會員做訂單歸因：綁定 A 優先於 B cookie、未綁定採 B cookie、歷史訂單比例快照不受事後改率影響、停用 cookie 不歸因且不阻建單，**4/4 斷言通過**。另發現**已綁定 A 停用後，B cookie 使新單轉歸 B**；與 `lib/referral/attribution.ts` 的「終身歸戶／停用不歸戶」敘述可能衝突，列 QA-FS-C5 待商業規則決策。四張 pending 訂單、兩個推廣人已刪，會員原綁定值已還原並核對。
- 工程1提交 `92e6ef7` 的面相知識庫 RLS migration 後，QA 僅在主本機隔離庫以 `psql` 直接執行該 SQL（**未寫 migration history、非正式部署**）；`scripts/qa-face-knowledge-rls-local.mjs` **4/4 通過**：兩表 `relrowsecurity=true`，service role 讀兩表 200、匿名各 401、有效會員各 403；service role 建卡／revision／更新卡成功，刪卡後 revision cascade 清理且 0 殘留。M2 隔離複驗通過，正式 migration 待驗；後台 API 正常流程另見 QA-FS-C6。
- M2 本次另以目前 main 的 `20261011130000` SQL 在 C4 隔離庫暫套，再由 X-QA 新建有效會員從 PostgREST 重跑 **4/4**：兩表 RLS 啟用、service role 讀 200、anon 401、member 403，service role 建卡／改卡／建 revision 並清 0。另以 BEGIN／ROLLBACK 驗證 anon/authenticated 六種讀寫權限全 false、service role 全 true；測後 ACL/RLS 與測前逐字一致，Auth/profile 已刪。獨立完整 stack 嘗試重播全部 migration 時 Storage 健康檢查兩次失敗，後以 C4 隔離庫完成同一 SQL 的 REST 驗證；正式 migration history 未改。
- `scripts/qa-face-knowledge-admin-local.mjs` 在 `92e6ef7` 獨立 production build／隔離庫由具名管理員執行：匿名 POST 401、會員 POST／GET 403、四種非法或超長 POST 400 且零寫入，draft 建立、搜尋、更新、revision v1/v2、封存與 audit **14/14 通過**。另以同一卡片 N=10 同時 PATCH，三輪均顯示 10 筆 200 卻覆用版本；最近一輪回應版本 `[4,3,5,8,7,6,8,7,8,7]`、最終卡片 v8、revision 8 筆、最新快照與卡片內容不符、audit 13 筆，並發斷言失敗，總計 **14/15**（QA-FS-C6）。每輪自建 Auth/profile/card/revisions/audit 已清理核對，未發布老師卡。
- 工程1提交 C6 `73517cb` 後，QA 在主本機隔離庫直接套用 `20261011140000_face_knowledge_atomic_revisions.sql`（**未寫 migration history、非正式部署**），repo 外 clone 的 `6dd756e` production build 成功。`qa-face-knowledge-admin-local.mjs --cas=true` 單管理員 **11 輪**、`--two-admins=true` 雙具名管理員 **11 輪**，均每輪 15/15 通過：同卡 N=10 只有 1 筆 200、9 筆 409，卡片 v4、revision 4 筆、具名 audit 4 筆且勝者身份一致、最新快照吻合；全部專用資料逐輪清理。M2 RLS 4/4 再通過；RPC EXECUTE 權限 anon=false、authenticated=false、service_role=true；工程 SQL 匯入來源測試以 BEGIN／ROLLBACK 通過。正式 migration／部署及 UI 衝突提示仍待驗。
- `scripts/qa-admin-create-code-local.mjs` 在同一獨立 production build／隔離庫以具名管理員建立啟用碼 **13/13 通過**：匿名／會員 401／403，期限 0／3651、點數 -1／100001、非整數期限、501 字備註均 400；未知與 SQLi 形狀方案碼 404；合法 1 天／0 點與 N=10 並發 3650 天／100000 點各有唯一碼、DB 值及具名 audit。11 筆碼與 audit、管理員 Auth/profile 已清理核對；未兌換、未影響會員權益。
- `scripts/qa-admin-course-followup-local.mjs` 在同環境自建一筆**未付款**課程報名，具名管理員可在列表及 `pendingContact` 找到；contacted 更新、篩選、重設為 new 時清除 `contacted_at`，DB 與具名 audit 一致；匿名／會員、非法狀態與 2001 字備註均拒絕，正常流程 **10/10 通過**。兩筆 pending/new 報名用 `limit=1` 時，API summary.total/pendingContact 各 1，DB 各 2（QA-FS-M11）；列表 `limit=-1` 卻 500，`abc`／`0`／`501` 回 200（QA-FS-M7）；合法 1／500 回 200，總計 **12/17**。Auth/profile、報名、訂單、audit 均清理核對。
- `scripts/qa-admin-referrals-local.mjs` 在隔離 API/DB 自建具名管理員與推廣人，匿名／會員 401／403、非法碼／空名／錯比例／81 字姓名 400、大小寫重碼 409、列表／空統計、修改分潤率 0.25→0.30 並停用後 DB 一致，共 **11/12**；建立與修改均查不到對應具名 audit（QA-FS-C7）。推廣人、Auth/profile 已清理核對，未接觸正式分潤。
- 工程1提交 C7 `d22a9ed` 後，QA 在本機隔離庫直接套用 `20261011150000_referral_partner_atomic_admin_audit.sql`（**未寫 migration history、非正式部署**），repo 外 clone production build 通過。`qa-admin-referrals-local.mjs` 新增 N=10 並發改率 audit 查核後 **連續 11 輪 13/13 通過**：建立、0.25→0.30 並停用都有具名 before/after audit；10 個不同分潤率的並發 PATCH 均 200、各有一筆 audit、最終比例可對上紀錄。每輪專用推廣人／Auth／profile／audit 均清理。RPC EXECUTE 權限 anon=false、authenticated=false、service_role=true；工程 SQL 故障注入測試 BEGIN／ROLLBACK 通過。正式 migration／部署待驗。
- Ego Lite 單一 TaskSpace `81`（本機 `92e6ef7` production build）驗會員 UI：錯密碼停在 `/login` 且顯示英文 `Invalid login credentials`（QA-FS-M8）；QA 專用帳號正確登入到 `/member`，可見本人方案／100 點、未完成訂單與兩種報告空狀態；登出導首頁且清除 `xunfeng_member_token`，再直接開 `/member` 導 `/login?next=/member`。另以本機 JWT secret 簽有效結構但已過期的 QA 會員 token：進 `/member` 顯示「登入已過期」卻仍保留 token 與顯示 FREE／0 點／待啟用、無登入入口（QA-FS-M9）；測後已清除 token。未讀取或修改正式會員資料。
- `scripts/qa-admin-finance-read-local.mjs` 在隔離庫自建具名管理員、pending 訂單與 pending 發票；匿名／會員對訂單及發票列表 401／403，管理員兩清單與訂單詳情對帳一致、無付款列，合法但不存在 UUID 404，**8 項通過**。直接 GET `id=not-a-uuid`、SQLi 形狀及 10,000 字各回 500，總 **8/11**（QA-FS-M10）。測試發票／訂單／管理員 Auth/profile 已清理核對，未呼叫金流或開票。
- `app/api/admin/invoices/[orderId]/issue/route.qa.test.ts` 使用已付款訂單與原有合法 `invoice_request` 的 mock，手動開票路由測試 **1 passed／2 expected fail**：合法空 `{}` 正確沿用已存買受人資料；但傳入無效公司統編或壞 JSON 時，route 的 `readJson(...).catch(() => ({}))` 加上共用 `readJson` 對壞 JSON 的空物件 fallback，把解析錯誤當空 body，仍呼叫 `issueInvoiceFromOrder`（QA-FS-C8）。此測試完全 mock ezPay helper，未對外開票或寫入資料。
- 工程1提交 C8 `6dd756e` 後，QA 將原兩個 `it.fails` 改為正常斷言重跑：QA 3/3、工程 route 4/4，合計 **7/7 通過**。無效統編與壞 JSON 回 400 且不呼叫開票 helper；合法 `{}` 仍可沿用已存買受人資料。另以 `qa-invoice-issue-invalid-local.mjs` 在本機隔離 API/DB 自建已付款但有舊合法買受人資料的訂單，匿名／會員 401／403，錯統編、壞 JSON、錯載具、超長買受人名均 400，invoice／audit 0 且訂單不變，**7/7 通過、測試列清理**。所有請求均非法，未呼叫 ezPay；合法實際開票與正式部署仍待驗。
- `scripts/qa-addon-zero-balance-local.sh` 在隔離 DB 以單一交易重現 QA-FS-C9 原始缺陷：未到期 VIP 舊權益 0 點，購買 `single_report` 加購 20 點的 `commit_paid_entitlement` 成功，卻留下兩筆同到期時間的 `active` 權益；新列 `plan_id` 不是 VIP，會員共享 helper `getPublicMember()` 的 `expires_at DESC LIMIT 1` 本次讀到舊 0 點。AI 兩路由扣點前已有 active／效期過濾，但成功後回傳會員摘要也呼叫該 helper。腳本 exit 3；連線關閉後交易自動回滾，QA profile 殘留 0 筆。這是 DB/RPC 加查詢證據，正式站付款及 UI 尚未實測。
- C9 工程草稿 `20261011160000_addon_preserves_entitlement_tier.sql` 尚未提交時，QA 僅在本機 DB 單一 `BEGIN` 交易內載入該 migration、建立 VIP 0 點＋加購 20 點，再 `ROLLBACK`，**沒有永久套用草稿**。觀察：`active_count=1`、新列仍 VIP，但依 `getPublicMember()` 現行排序 `selected_old=true`、`selected_credits=0`；草稿尚未滿足會員顯示驗收，已回報 X-PM。正式複驗待工程提交完整修補。
- C9 已提交修補 `fbcb6bc` 後，QA 當時使用 `bash scripts/qa-addon-zero-balance-local.sh /private/connection.private.env --migration-preview` 在單一交易載入 migration。當時腳本模擬舊 `getPublicMember()` 無 status 條件查詢，結果 exit 3：`active_count=1`、`old_active=f`、`purchased_credits=20`、`new_vip=t`，但 `selected_old=t`、`selected_credits=0`；交易回滾。**現行腳本已改驗有效權益選取契約**，在 C9 獨立庫回 `active_count=1`、`selected_old=f`、`selected_credits=20` 並 exit 0；舊 API 缺口改由下項真會員測試追蹤。
- C9 真會員 API 測試 `scripts/qa-addon-member-api-local.mjs` 在獨立 C9 本機 DB／舊版 Next clone 3104 建 Auth/profile、VIP 0 點、paid 加購單，RPC 產出唯一 active VIP/20、原效期及 tier_features 保留。**同到期日舊列時舊 API 偶然選中新列，單靠一次綠燈不可靠**；加一筆效期更晚但已 `expired` 的歷史 0 點列後，舊 `/api/member/me` 穩定選錯並 fail，測試資料清 0。修補 `getPublicMember()` 提交後須用同腳本達 10/10，再驗 AI／面相入口。
- C9 工程補完 `0776141` 後，QA 在新版 Next clone 3104＋C9 隔離 DB（`FACE_ANALYSIS_ENABLED=true`）跑真會員／面相腳本 **11/11 通過**：同到期舊列及較晚到期但 expired 的歷史列皆不遮蔽新 VIP/20，`/api/member/me` 連讀 5 次皆 active/20，面相 POST 建立的 run 綁新 entitlement，加購重送仍只有一筆 20 點 grant；Auth/profile/order/run/event/ledger 清 0。`lib/auth/member.test.ts` 10/10；最新 `20261011160000` migration 在單一交易 `--migration-preview` 通過且回滾。**C9 隔離庫永久套用的仍是前版 migration**，未用最新 migration 做完整 reset／正式站付款與 AI provider 實跑；仍追蹤部署驗收。
- **C9 現行 HEAD 狀態更正：**X-PM 因「多筆 active、不同 tier 的會員已付款後，webhook 遇 fail-safe RPC 例外」暫回退 migration；`f0ae9b0` 刪除 `20261011160000` 與 SQL 測試。QA 在未套該 migration 的主本機 QA DB 重跑有效權益 SQL 腳本 exit 3：`active_count=2`、`old_active=t`、新列非 VIP；因此上項 11/11 僅證明**已套舊版 1600 的 C9 隔離庫＋新版程式**，不能代表目前 repo fresh DB／可部署版本。已向 X-PM 明確回報；付款前攔截及既有已付款補救需商業決策。
- M7／M11 工程修補 `48cd357` 後，QA 在本機隔離 DB／3104 dev API 重跑 `scripts/qa-admin-course-followup-local.mjs`，**17/17 通過**：`limit=-1/abc/0/501` 均 400，`limit=1/500` 均 200；兩筆報名時 `limit=1` 的 API `summary.total/pendingContact=2/2` 與 DB `2/2` 一致，具名管理員跟進／audit、匿名與會員拒絕也通過，fixtures 全清。工程 route 單元測試另有 **12/12 通過**；正式部署及後台畫面仍待驗。
- `scripts/qa-cron-cleanup-local.mjs` 在獨立 C4 本機 DB／3104 API 建逾 24 小時 pending 訂單、近 24 小時 pending、舊 paid，及過期／未到期 active 權益。兩路由匿名／錯密鑰皆 401、dry-run 均報 1 候選且不寫入；舊 pending 訂單正式清理成功。過期權益正式清理卻 HTTP 500：`member_entitlements` 沒有 `updated_at` 欄位；QA-FS-C11。`finally` 清理後 profile、訂單與 cron audit 均 0；腳本已加兩筆成功 audit 的對帳斷言，待修復後目標 13/13。
- C11 工程 `a692500` 移除不存在欄位寫入後，QA 在獨立 C4 本機 DB／3104 新版 API 重跑上項腳本 **13/13 通過**：兩 cron 無／錯密鑰 401、dry-run 候選 1 無寫入；過期權益正式執行 200／expired_count=1，點數 7 保留，未到期仍 active；舊 pending 訂單取消，近 24 小時 pending／已 paid 不變；兩筆成功 audit metadata 各 1，重跑兩 cron 候選 0。profile／訂單／audit 清 0；工程單元測試 3/3。正式部署與排程觸發待驗。
- `scripts/qa-face-knowledge-bulk-import-local.mjs` 在獨立 C4 本機 DB 先套已提交 C6 migration，再以具名管理員／共用 `ADMIN_KEY` 直打新版 API：五個寫入入口共用 key 全 403；bulk 送審／發布／封存各自增唯一版本、revision snapshot、具名 audit；import 新卡 v1、舊卡 upsert v5 且保留原 created_by。故障注入讓 audit 寫入失敗時，HTTP 500 且卡片／revision／audit 回滾、臨時 trigger/function 清除。**14/15 通過**；同批重複 `card_id` 沒留下卡片，但 HTTP 500（QA-FS-M14，應 400）。測試 profile／卡片／audit 清 0；正式站仍待驗。
- C6 管理頁 Ego Lite 隔離 UI：具名 QA 管理員開啟 v1 草稿，第二請求先 PATCH 到 v2；頁面將標題／觀察改為本地未存內容後按更新，HTTP 409 與「編輯內容已保留」提示出現，兩欄仍為未存內容，DB 仍是遠端 v2、舊觀察未覆寫。Auth/profile/card/revision/audit 專用資料清 0，瀏覽器工作空間已關閉。提示要求「重新載入最新版本」；目前編輯內容只在 React `useState`，刷新後的草稿保留與比對流程尚無保護，列 QA-FS-M15 待確認改進。正式站仍待驗。
- `scripts/qa-site-publish-type-local.mjs` 在獨立 C4 本機 DB／3104 API 以具名管理員直打 CMS：POST 服務 `is_published:"false"` 回 201 且 DB `true`；先把測試服務重設為未上架，再 PATCH 同值回 200 且 DB 由 `false` 變 `true`。真正布林 `true/false` 的上架／下架正常，合計 **2/4 通過**（QA-FS-M13）。測後 QA profile、服務與 audit 均 0；非前端輸入可能誤上架。
- 工程 CMS `9d3fc9a` 後，QA 在獨立 C4 本機 DB／新版 Next clone 3104 重跑：M12 先下架 1 筆服務，公開 API 9→8；全下架時 DB 0／API 0，`qa-site-unpublish-local.mjs` **1/1 通過**且還原 9 筆旗標。M13 `qa-site-publish-type-local.mjs` **4/4 通過**：POST/PATCH 字串 `"false"` 各 400 且無發布副作用，真布林上／下架正常，fixture/Auth/profile/audit 清 0。針對性單元測試 **23/23** 含非布林數字／null／object、`promo.active` 與 DB 故障 fallback。正式站及完整 UI 仍待驗。
- `scripts/qa-logout-local.mjs` 在本機隔離 API/DB 自建會員：登入取得 access＋refresh token、會員 API 200；POST `/api/auth/logout` 回 `200 {ok:true}`，但同一 refresh token 再 POST `/api/auth/refresh` 仍 200，換得的新 access token 可讀 `/api/member/me` 200，**3/4 通過**（QA-FS-C12）。`app/(public)/member/page.tsx` 與 `app/admin/_shell.tsx` 登出也只清 access token，留下 `xunfeng_member_refresh`；Auth/profile 測試資料清 0。這是隔離帳號安全複驗，不是正式站登出測試。
- 工程 C12 `cf6dbc4`／`d1d3128` 後，QA 以獨立 Next clone 3104＋C4 隔離 DB 重跑 `qa-logout-local.mjs` **6/6 通過**：登出 API 200，舊 access 立即 401、原 refresh 再換發 401、重複登出 200。Ego Lite 同一瀏覽器空間兩分頁複驗會員與管理員：會員 p1 登出回首頁、p2 自動轉 `/login?next=/member`；管理員 p1/p2 都轉 `/admin-login`；兩者 access／refresh localStorage 均為 null。最新版會員 UI 注入登出 API HTTP 500 時留在 `/member`，兩權杖仍在並顯示「登入狀態尚未清除，請稍後重試」；恢復後重試返回首頁且兩權杖清除。針對性單元測試 **6/6**（含工程故障測例 `d95d774`）；三個 QA Auth/profile 已刪。正式站部署後仍待驗。
- `ego-browser nodejs < scripts/qa-public-pages-ego.mjs` 在相同本機 Next clone 3104 重複逐頁開啟 12 個公開頁面，**11/12 基本渲染通過、exit 1**：11 頁有主標題、主內容且無 application error；`/reset-password` HTTP 200 後 client-side exception、整頁只見 Application error。DevTools Runtime stack 指向 `lib/supabase/client.ts` 的 `requiredEnv("NEXT_PUBLIC_SUPABASE_URL")`，瀏覽器 bundle 保留 `process.env[key]` 動態索引，未內嵌公開變數。已唯讀核對 clone Next 程序環境的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 兩個鍵皆存在（未輸出值），排除僅因隔離啟動漏設鍵。這是 QA-FS-C15；互動／正式站仍待驗。
- 同 Ego Lite 空間無會員／管理員權杖時直開受保護頁：`/member` → `/login?next=/member`、`/admin` → `/admin-login`、`/member-ai` → `/login`，均無 application error。`/member-admin` 與 `/member-ai/face`、`/member-ai/decision` 可顯示入口頁；這些頁面的實際資料／寫入仍由 API 授權控制，登入後完整流程待驗。
- `node scripts/qa-legacy-auth-alias-local.mjs http://127.0.0.1:3104` **6/6 通過**：舊 `/api/login`、`/api/logout`、`/api/me`、`/api/register`、`/api/redeem`、`/api/chat` 與目前對應路由在空請求／無權杖下的 HTTP 狀態及 JSON 類型相同（400／200／401／400／401／401）。登出空請求 200 為冪等行為；測試不建立帳號、權益、兌換或呼叫 LLM。有效舊版前端完整流程仍待驗。
- `ego-browser nodejs < scripts/qa-admin-pages-ego.mjs` 使用一次性具名管理員，在 C4 隔離庫／3104 Next clone 導覽 23 個靜態後台路由，**23/23 管理殼層導航通過**：URL 保持目標頁、後台側欄顯示、未見 Application error。首輪 `/admin/face-rules` 固定等待 700ms 時僅有 6 字載入畫面；改用等待側欄條件後重跑 23/23，該頁另等 1.7 秒可見規則表格，屬測試同步問題。這僅確認頁面殼層，不代表各頁資料載入／操作驗收。登出後 `/admin-login` 且兩權杖清除，專用 Auth/profile 已刪並核對 0 殘留。
- `node scripts/qa-ecpay-return-local.mjs http://127.0.0.1:3104` 在只接本機 dummy stage 金鑰的 Next clone **5/5 通過**：GET 導會員頁；空 POST、偽造 `RtnCode=1`／壞 MAC、含 HTML 字串訂單號都 303 導 `payment=pending`（字串在 URL 編碼）；正確本機 MAC 的不存在訂單回 `payment=paid` 導向，但 route 僅查訂單類型、不寫付款或權益，會員頁仍輪詢正式開通狀態。這驗導回頁與防偽狀態，不代表金流通知或真實付款通過。
- C15 正式站唯讀複驗：Ego Lite 直接開 `https://www.xunfeng.tw/reset-password`，頁面只有 `Application error: a client-side exception has occurred...`，無 h1/main；Reload 後 DevTools `Runtime.exceptionThrown` 為 `Missing environment variable: NEXT_PUBLIC_SUPABASE_URL`，指向正式 bundle `/_next/static/chunks/app/(public)/reset-password/page-a4fabe46d466f59b.js`。正式密碼重設入口當前不可用，已加急回報 X-PM；沒有對正式帳號或資料寫入。
- C15 工程修復分支 `9a94721` 獨立 detached worktree／3218 dev app 的 Ego Lite 補驗：無連結頁已不崩潰，正確顯示「重設連結無效」。QA 在 C4 本機 Auth 建專用帳號並產生有效 `type=recovery` action link，瀏覽器經 `/auth/v1/verify` 導回 `/reset-password#access_token=…&refresh_token=…&type=recovery`，**UI 仍顯示「找不到重設 session」，無新密碼表單**。同一 access token 唯讀呼叫本機 `/auth/v1/user` 回 200 且 user id 符合 QA 帳號，證明連結有效。程式根因證據：`createSupabaseAdminClient` 未設定 flowType，安裝版 auth-js 預設 implicit 且 forgot-password 只有 PKCE 才送 code_challenge；`@supabase/ssr` browser client 強制 PKCE，拒絕 implicit hash callback。測試 Auth 帳號、瀏覽器 cookie/storage/hash、私有連結檔均清除；未測真實信件寄達、正式帳號或正式部署。C15 仍為驗收阻擋。
- C15 補修分支 `6bd59cd` 在 QA detached app／3218＋C4 隔離 Auth 的 Ego Lite 獨立複驗：`scripts/qa-reset-recovery-ego-local.mjs` 自建專用帳號與 recovery action link，兩輪各 **11/11**：有效連結顯表單且 hash 清空、短密碼與確認不一致擋下、改密成功、新密登入／舊密拒絕、無連結／已用連結／無效 token 明確拒絕且 hash 清空。腳本依序從登入頁進入連結以避免同路徑 hash 導覽沿用舊 UI；Auth 與 3218 origin storage/cookie 清除，QA app/worktree 移除。**隔離功能複驗通過；真實信件、正式部署／站端仍待驗，C15 驗收 gate 未解除。**
- 2026-10-11 約 16:12 台北時間，Ego Lite 再次唯讀開啟正式 `https://www.xunfeng.tw/reset-password`：仍只有 `Application error: a client-side exception...`，無重設表單與可用提示；無 Security Checkpoint。**隔離通過不等於正式站已修復，C15 正式驗收仍 BLOCKER。**
- C15 最小 release 候選 `5631c7f`：X-QA 從乾淨候選複製專用 app，以 C4 隔離 Auth 建 production build／3218；既有 Ego TaskSpace 81 執行 `qa-reset-recovery-ego-local.mjs` **兩輪各 11/11**，hash recovery 的無連結、有效連結清 URL、短密／確認不符、改密、重用／無效 token、新密可登入與舊密拒絕均通過。另建僅 Auth＋Mailpit 的 QA stack／3219 dev preview：真正 `flowType:pkce` 請求的本機郵件經 GoTrue 換得 `?code=`（非 hash），配同次 verifier cookie，Ego 驗有效 code 顯表單且清 URL、改密成功、重用 code 拒絕且清 URL、新密可登入／舊密拒絕。另一 QA code 將 `auth.flow_state` 的 `created_at`、`updated_at`、`auth_code_issued_at` 均調舊兩天，UI 顯示過期錯誤且清 URL；只調舊 `auth_code_issued_at` 時仍可交換，該初試不作過期證據。最小 stack 缺 `site_courses` 使完整 production build 在 `/courses` 靜態產生失敗，故 PKCE 用同候選 dev preview；hash 已在 production build 通過。五個 QA Auth 刪除後 residual=0，兩 origin 已清、3218／3219 與專用 stack 均已停止。正式站新 build／部署、真實 SMTP 寄達仍待驗，C15 gate 不解除。
- `scripts/qa-face-list-limits-local.mjs` 以 C4 隔離會員建立 51 筆已完成面相報告：匿名 401、預設 20、`limit=1` 回 1、`limit=50` 回 50；`limit=abc` 與 SQLi 形狀 `1 OR 1=1` 都 HTTP 200 **回 51，超過 cap 50**；500 位數字 HTTP 200、回 50。**4/7 通過**（QA-FS-M17）；Auth/profile/51 reports 核對清 0。
- `scripts/qa-council-list-limits-local.mjs` 用另組隔離會員／權益／21 筆 Council 報告：匿名 401、預設 6、合法 limit 1／20 回 1／20；`abc`、SQLi 形狀都 HTTP 200 **回 21，超過 cap 20**；500 位數字 HTTP 200、回 20。**4/7 通過**。Council 回傳 `request`、`structured` 與全文，歷史累積時未限筆數增加負載；Auth/profile/entitlement/21 reports 清 0，仍歸 M17。
- `scripts/qa-admin-report-limits-local.mjs` 以一次性具名管理員與會員建立面相 101 筆、Council 201 筆：匿名 401／會員 403、合法 limit 1／最大 100 或 200 正常；面相非法字串／SQLi HTTP 200 卻回空列表，Council 同輸入 HTTP 200 回 **201 筆，超過 cap 200**；超長數字 HTTP 200 被 cap 到 100／200。**8/14 通過**；兩 Auth/profile、權益、302 reports 清 0。M17 共影響四個列表路由，管理員面相還會誤顯示空狀態。
- M17 工程修復分支 `839e7f0` 的 QA 獨立 detached worktree／3105 dev app 複驗：原 500 位數字、`abc`／SQLi 形狀、合法上限均通過，四路由不再超 cap；新增 **100 位數字** 邊界卻均 HTTP 200 並截頂，未符合超長輸入 400。面相會員 **7/8**、Council 會員 **7/8**、兩後台列表 **14/16**。`parseListLimit` 以 `Number.isInteger` 檢查，100 位數字轉為有限但不安全的整數而放行；全部 374 筆報告、Auth/profile/權益清 0。修復分支未合併／正式部署，M17 仍開票。
- M17 補修 `ced1432` 在 QA detached worktree／3211 dev app＋C4 隔離庫再次獨立複驗：面相會員 **8/8**、Council 會員 **8/8**、後台面相與 Council **16/16**；新增 100 位數字及既有 abc／SQLi／500 位均 400，合法預設／上限仍正常。三腳本自建的 374 筆專用報告與 Auth/profile/權益均清 0；QA app/worktree 已移除。**隔離複驗通過，正式整合／部署待驗。**
- `scripts/qa-refund-rounding-local.sh` 在隔離 DB 以單一交易重現 QA-FS-C10：paid 199 元／20 點加購訂單依序退款 99＋100 元，訂單轉 `refunded`，但兩次只收回 9＋10＝19 點，權益仍有 1 點；腳本 exit 3。連線關閉自動回滾，QA profile 殘留 0，沒有綠界操作或正式資料寫入。
- 工程 C10 `7b55449` 的 `20261011190000_manual_refund_cumulative_credit_allocation.sql` 僅在獨立 C4 本機 DB 直接套用（**未寫 migration history、非正式部署**）。QA 先在舊 DB 重跑原腳本確認 9＋10＝19／exit 3，套用後同腳本 9＋11＝20／餘額 0／exit 0。`scripts/qa-refund-boundaries-local.sh` 覆蓋直退 199、三段 1＋1＋197、超額 200 拒絕零副作用、全退後重送拒絕，全部通過且單交易 rollback；工程短缺 SQL 為 expected 20／reclaimed 10／shortfall 10；工程 99＋100 並發腳本連跑 **10/10** 輪，各 2 筆退款且 expected/reclaimed 20、餘額 0。QA profile/order 0，正式管理員 API／UI、部署與發票／外部退款仍待驗。
- 工程 `005caf4` 補舊退款紀錄 shortfall 後，QA 在 C4 隔離庫重套最新 1900 SQL（仍未寫 migration history），原 99＋100、直退／三段／超額／全退後重送及 legacy history SQL 全通過。`scripts/qa-refund-admin-api-local.mjs` 具名管理員 HTTP／DB **17/19 通過**：匿名／會員／共用 ADMIN_KEY 不可試算或登錄，未勾確認、錯金額型別、0 金額、501 字原因皆 400 零退款；預覽顯示 199 元／20 點，99＋100 元兩次 API 回收 9＋11，兩筆退款、點數交易、權益餘額、訂單狀態與具名 audit 對帳。另超退 200／199 與全退後再請求 1 元都 HTTP 500（QA-FS-M16），但無額外寫入。每輪 Auth/profile/order/entitlement/refund/ledger/audit 清 0；正式站與管理員 UI 仍待驗。
- 同腳本 `--replay=true` 在最新 SQL 下 **13/15 通過**（QA-FS-C13／M16）：同一具名管理員將完全相同的 99 元、相同 provider_reference 與確認旗標連送兩次，HTTP 200／200；DB 2 筆 refunds、2 筆扣點交易、2 筆 audit，20 點餘額降至 1，訂單仍 partially_refunded。隔離 fixture 全清；若外部實際只退一次，本站多記一筆退款並多收 10 點。
- 同腳本 `--replay=concurrent` 以完全相同的 99 元請求 N=10 同時打 API，C4 隔離庫連續 **4/4 輪**都出現 2 筆 200、8 筆 500、2 筆退款／扣點交易／audit、餘額 20→1；每輪 12/14（另一失敗為 M16 超退 500），專用資料逐輪清 0。QA-FS-C13 在序列與並發重送皆可穩定重現。
- 同腳本 `--audit-fault=true` 對專用訂單的 `order_refund_manual` audit INSERT 注入 DB exception：API 仍回 200，退款 1 筆、扣點交易 1 筆、權益 20→11、訂單 partially_refunded，audit 0（QA-FS-C14）；整輪 12/14，另一失敗為 M16。`lib/auth/admin.ts` 的 `writeAdminAudit` 忽略 insert error，退款 RPC 與 audit 分兩次提交。臨時 trigger/function、QA Auth/profile/order/refund/ledger 均清 0。
- 工程 `6e6f4a4` 以 `20261011200000_refund_idempotency_atomic_audit.sql` 將 UUID 冪等鍵、退款、點數、訂單與具名 audit 放入同一 RPC 交易。QA **僅在 C4 本機隔離庫直接套 SQL，未寫 migration history、非正式部署**；Next clone 3104 更新至該 commit。QA 腳本加入冪等鍵：正常 99＋100、超額 400／全退後新請求 409、ledger/audit 對帳 **20/20**；同鍵序列重送只 1 筆效果、同鍵不同金額 409 **17/17**；同鍵 N=10 並發 **4/4 輪各 15/15**，十請求均 200、退款／扣點交易／audit 各 1；audit INSERT 故障 **15/15**，HTTP 500 且退款／扣點／audit 0、餘額 20、訂單仍 paid。工程整合腳本另 20 輪 N=10 及故障後同鍵重試 **6/6**，route 單元 **4/4**。Ego Lite 管理員 UI 另以隔離訂單模擬「伺服器已回 200、瀏覽器遺失回應」：重新整理仍保留同一 UUID 與表單，重送後提示沿用原退款紀錄；DB 恰 1 筆 99 元退款、1 筆 -9 點交易、1 筆具名 audit，餘額 11、訂單 partially_refunded，UI 僅 1 列；logout 後 auth token 0、所有 fixture 清 0。臨時 trigger、QA profile/order 均額外核對 0；正式 migration、外部退款與發票回歸仍待。
- `scripts/qa-admin-reads-local.mjs` 以 C4 隔離 API/DB 自建具名管理員，對 23 個後台讀取路由逐一 GET，**23/23 均 HTTP 200 JSON、無 error 欄**；涵蓋課程產品、文件、有效設定、面相規則／教學／審核、prompt、提供者狀態、奇門校對、Token 用量等空／既存資料狀態。未呼叫 Resend 寄件網域或任何外部付費測試端點。Auth/profile 清 0；這是讀取冒煙，不證明資料內容與寫入流程正確。
- `scripts/qa-face-teaching-retention-local.mjs` 在 C4 隔離 API/DB 以具名管理員建立專用已發布面相教材規則；直接 DELETE 正確回 409，先 PATCH 封存後 DELETE 卻回 200、DB 該規則歸零，造成曾發布規則的稽核鏈可被刪除（QA-FS-C17）。**9/10 通過，預期失敗項可穩定重現**；另驗 SQLi 形狀識別碼／2,001 字正文 400、未發布草稿可刪；專用規則、audit、Auth/profile 清 0，未產生 AI 報告或呼叫提供者。
- C17 工程分支 `7cae2cd` 與 retention migration 在 QA **全新獨立 Supabase stack／3212 app** 複驗：原腳本 **10/10**；`scripts/qa-face-teaching-retention-concurrency-local.mjs` 驗舊報告 `citedTeachings` 封存後仍可追溯、雙具名管理員 PATCH 發布／DELETE 競爭、會員 token 直呼 privileged RPC 403、刪除 audit INSERT 故障回滾及正常重試 **5/5**。並發＋回滾另重跑 10 輪各 4/4，合法結果含 DELETE 先贏時 PATCH 404，或 PATCH 先贏時 DELETE 409；最終規則與具名 audit 一致。專用 report/rule/audit/Auth/profile 各輪清 0，QA app 與 stack 容器已停、資料移除；**隔離修復分支通過，正式整合／部署待驗**。同分支 C18 建立發布 audit 故障仍 4/6，需獨立修復。
- C16 工程分支 `d639e77` 在 QA detached worktree／3220 dev app＋C4 隔離庫複驗：更新 `scripts/qa-admin-members-cap-local.mjs` 依分頁契約驗 205 專用會員，**9/9**：預設 50 筆、真實全域總數 207、五頁含測試管理員 206 筆無重複／漏列、最舊 Email 搜尋命中；0／100 位數字頁碼、101 字搜尋與壞游標皆 400。Ego Lite 後台第 1/5 頁 50 筆、翻到第 5/5 頁 7 筆可見最舊會員；Email 搜尋後第 1/1 頁 1 筆而總數仍 207。工程規模腳本由 QA 獨立執行 **11/11**：額外 1,001 筆後總數 1,209、預設仍 50，單次本機 dev 讀取 205 筆情境 169ms、1,206 筆情境 149ms（非 p95／壓測）。所有專用 Auth/profile/entitlement/會員 fixture 清 0；分支尚未整合與正式部署。
- `scripts/qa-face-teaching-audit-atomic-local.mjs` 在 C4 隔離庫對專用 ruleId 的 `face_teaching_rule_create` audit INSERT 注入 DB exception：具名管理員 POST 已發布面相教材仍 HTTP 200、規則 `published` 一筆、audit 0（QA-FS-C18）；**4/6**。移除故障後重試 HTTP 200、規則與具名 audit 各 1；臨時 trigger/function、規則、audit、Auth/profile 全清 0。影響面相報告引用教材的操作稽核；未呼叫 Vision／LLM。
- C18 工程候選 `461f213`＋`20261011220000` migration 由 QA 在**全新獨立 Supabase stack／3213 detached app** 複驗：原建立／audit 故障腳本 **6/6**；工程 SQL 交易測試以 BEGIN／ROLLBACK 通過；新增 `scripts/qa-face-teaching-write-atomic-local.mjs` **連續兩輪各 7/7**，驗具名草稿、發布 audit 故障回滾（HTTP 500、仍 draft、版本不變、audit 0）、正常發布具名 audit 1 筆、內建匯入 audit 故障回滾（HTTP 500、新增 0）、正常匯入 67 筆、重跑冪等且兩次皆具名 audit、管理員 bearer 直呼 service-only RPC 為 403。C17 保留規則腳本於同一 stack 再跑 **10/10**。QA 專用 trigger、規則、audit、Auth/profile 清 0；stack 啟動時 Storage 異常耗用導致 Auth 逾時／REST 503 的中斷批次作廢，停用該隔離 Storage 容器後完整重跑通過。**僅隔離候選複驗；正式整合、migration、站端待驗**。
- `scripts/qa-qimen-preview-local.mjs` 在 C4 隔離 API/DB 以專用具名管理員驗奇門任意時間試排 **11/11**：匿名／壞 token 401、合法時間回 3×3 九宮格、空 body／月 0／時 24／年 1899／SQLi 形狀／500 字數字 400、不存在日期以空盤及 error 提示、同輸入五路並發回相同盤。Auth/profile 清 0；未呼叫 LLM／扣點。盤面與老師手工盤的一致性尚待專業簽核。
- `scripts/qa-admin-face-detail-local.mjs` 在 C4 隔離 API/DB 自建具名管理員、會員、專用面相報告與事件；詳情合法 owner／event／audit、排除 `storage_path` 且 `no-store`，照片預覽無圖／過期回 410、拒絕預覽不寫 event；兩路由匿名 401／會員 403、未知合法 UUID 404。兩路由對非法、SQLi 形狀與 500 字 id **共六項均 HTTP 500**（QA-FS-M18）。**13/19**，Auth/profile/report/event 清 0；未載入照片、Vision 或 LLM。
- `scripts/qa-face-delete-local.mjs` 在 C4 隔離 API/DB 自建 A/B 會員與 A 專用完成報告，驗 A/B 所有權、會員直呼 redact RPC 403、N=20 DELETE、PII 抹除與重送。一次 N=5 自然並發曾見 200×5 卻有 **2 筆 `run_deleted` 事件**；穩定重現路徑是首次刪除後，route 同款 claim 條件仍可對 `deleted` 列取得 1 筆，`redact_face_analysis_run` RPC 再執行 HTTP 200（QA-FS-M19）。當輪 **13/15**；Auth/profile/run/event 均清 0。未上傳照片或呼叫 Vision／LLM；有效圖片／PDF 實體刪除待另驗。
- `scripts/qa-face-pdf-local.mjs` 在 C4 隔離 DB／3214 detached app（`FACE_ANALYSIS_ENABLED=true`）用 A/B QA 會員及專用完成／未完成報告，**連續兩輪各 7/10**：匿名與壞 token 401、B 取 A 404、未完成 409、未知合法 UUID 404；A 得到 `application/pdf`、`attachment`、`private, no-store` 及 `%PDF-` 位元組，重取位元組相同。`bad-id`、SQLi 形狀及 500 字 id 三例皆 **HTTP 500**（QA-FS-M20）；根因路徑 `getOwnedRun` 對 UUID 欄位直接 `.eq("id", id)`，未先驗格式。每輪專用 run 與 Storage PDF 物件清 0；未呼叫 Vision／LLM，未證明有效照片／實際分析成稿。
- `scripts/qa-face-run-id-routes-local.mjs` 在主 QA 隔離庫／3214 detached app（`FACE_ANALYSIS_ENABLED=true`）以既有 QA 會員 bearer、`/api/member/me` 200 預檢後，對面相 run 六條方法／路由各送未知合法 UUID、`bad-id`、SQLi 形狀及 500 字 id，**連續兩輪各 15/24**。詳情 GET、報告 DELETE、照片 DELETE 全部 404；預覽 GET、PDF GET、分析 POST 對未知合法 UUID 404，對三種非法 id 均 500，合計每輪九個 500（QA-FS-M20 擴大影響）。所有請求都直接打 API；未建立報告、上傳圖片或呼叫模型。這是本機有效會員請求與輸入驗證結果，尚未涵蓋三路由有效報告的全流程。
- `scripts/qa-face-upload-empty-local.mjs` 在主 QA 隔離庫／3216 detached app（`FACE_ANALYSIS_ENABLED=true`）為既有 QA 會員建立唯一 `created` run，直接 POST 空 multipart 六次，**連續兩輪各 4/10**：匿名 401、他人 404、非法 ID 404、未知 UUID 404，均不增加次數；本人前五次空表單回 400，`upload_attempts` 卻依序 1→5，第六次回 429（QA-FS-M21）。檢查前皆有會員 API 200 預檢；每輪 run 已刪除且核對 0。未提交照片、未進品質 provider，沒有 Storage／模型呼叫。此為本機缺陷，真實照片品質流程仍待驗。
- `scripts/qa-face-knowledge-export-local.mjs` 在主 QA 隔離庫／3217 detached app 對後台面相知識卡匯出 **8/8 通過**：匿名／壞 bearer 401、一般會員 403；臨時具名管理員下載 JSON 200，`attachment`、`no-store`，28 張卡 ID 與 DB 全數且順序一致、無重複，重取 items 一致。只讀現有知識卡；臨時 Auth／profile 清理核對 0。僅證明目前 28 張卡，尚未測超過 PostgREST 單次回傳上限的大量卡片及正式站。
- `scripts/qa-admin-document-audit-local.mjs` 在 C4 專用隔離庫（50 migration）／3218 detached app 先對 QA 老師文件 PATCH 稽核注入失敗，原腳本兩輪各 5/7；擴充後再對同一臨時管理員的文件上傳及該文件刪除分別注入精確稽核失敗，**擴充腳本連續兩輪各 7/13**（QA-FS-C19）。PATCH 啟用提示詞仍 200、文件已啟用、audit 0；上傳仍 201、DB／Storage 留文件、audit 0；刪除仍 200、DB／Storage 已消失、audit 0。匿名 PATCH 401 不改資料，移除故障後正常 PATCH 200、具名 audit 1。每輪 scoped trigger／文件／Storage／audit／Auth／profile 清 0。通用 `writeAdminAudit` 忽略插入錯誤；其他 26 個呼叫路由仍需逐一界定影響。
- `scripts/qa-member-read-local.mjs` 在本機隔離 API/DB 以 A/B 測試會員自建 pending／paid 訂單與 usage，**11/11 通過**：匿名／壞 token 401，A/B 訂單及使用量互不洩漏，paid 訂單在權益未建立前 `activated=false`、建立後輪詢轉 `true`，對方以 order_no 查仍 0 筆，SQLi 形狀訂單號 0 筆。權益、使用量、訂單在 `finally` 逐筆清理核對；未呼叫真實金流。
- `scripts/qa-site-unpublish-local.mjs` 在獨立 C4 本機隔離 DB／3102 dev API 重現 QA-FS-M12：服務表原本 9 筆已上架，先下架 1 筆，公開 API 正確由 9→8；再全部下架並核對 DB 公開筆數 0，API 卻回靜態 JSON 的 9 筆，腳本 exit 1。`finally` 恢復並核對 9 筆原發布旗標，正式內容未改；CDN 快取與其他內容型別仍待驗。
- 獨立 QA 執行 `scripts/qa-redeem-atomic-local.mjs`（本機 3101＋隔離庫）兩輪：每輪同碼 N=10 恰 1 個 200／9 個 400，唯一權益與交易同會員且點數 37；故障注入的交易 INSERT 失敗回 500，碼仍 unused、交易／權益增量 0。每輪刪除新碼與衍生列後核對 0 殘留。**隔離環境 B2 複驗通過；正式庫 migration／部署後複驗仍未完成。**
- `scripts/qa-booking-local.mjs` 於隔離 API/DB：7/7 驗證案例符合程式規則；80 字姓名＋4,000 字留言可送，81／4,001 字各回 400。只有 `@@@` 電話也回 200（QA-FS-M1 實測）；相同表單並發兩次回 200/200、DB 新增 2 筆（QA-FS-M3 待去重規則）。全部使用唯一 source 並刪後核對 0 筆。
- `scripts/qa-orders-local.mjs` 於隔離 API/DB：5 個建單案例 4 通過、1 不合格。後端價格與幣別保護通過：請求偽造 `amount=1`／`currency=USD`，DB 訂單與 checkout `TotalAmount` 仍依方案 TWD 價格；空方案 400、SQLi 形狀方案碼 404、錯誤公司統編 400。`plan_code` 10,000 字回 500（128／1,024／4,096 字回 404，QA-FS-M4）；同一有效請求並發兩次建立兩張 pending 訂單（QA-FS-M5 待規則）。自建訂單刪後核對 0 筆。
- 工程1提交 `1185c12` 後，QA 另取該 commit 建立 repo 外 production build（3104）並連同主 QA 隔離庫獨立複驗 `scripts/qa-orders-local.mjs`：**7/7 通過**。`plan_code` 64 字未知碼回 404，65／10,000 字回 400；空方案 400、SQLi 形狀碼 404、錯公司統編 400，這六例訂單增量皆 0；有效建單夾帶偽造價格／USD 仍依後端 TWD 方案價入 DB 與 checkout。M4 隔離複驗通過、正式部署待驗；同一有效請求並發 200/200 仍產生兩張 pending 訂單（M5 待規則）。測試訂單已清理。
- `scripts/qa-orders-local.mjs` 擴充直接 API 內部方案繞過測試：隔離庫自建 `e2e_qa_*` active 方案，會員分別以 `plan_code` 及 `plan_id` 建單均回 404、訂單增量 0；原 M4 邊界及後端定價再跑，最新 **9/9 通過**。內部方案、兩張正常 pending 訂單皆清理核對；M5 雙送仍為 2 張待規則。
- `scripts/qa-course-checkout-local.mjs` 於隔離 API/DB：空請求、錯報名身分、SQLi 形狀 email、13 個興趣、1,001 字備註與錯統編均 400；新生／複訓兩種成功報名均由後端課程價格建立一致的 order＋registration，夾帶偽造金額／幣別無效，**8/8 通過**。同 email／同課程雙送 200/200，1 profile、2 pending orders／registrations；併 QA-FS-M5 待去重規則。專用 profile、order、registration 已清理。
- `scripts/qa-register-local.mjs` 於隔離 API/DB 最新 **9/9 通過**：非法手機／弱密碼／非法 email 400；同手機三個 email 並發註冊 200/200/200，但 trial 只發 1 次，`trial_phone_claims`、30 點權益及 `trial_signup` 交易各 1；同 email 再註冊 409；正確／錯誤密碼登入 200／400；無效 refresh 401、有效 refresh 200 且新 token 可讀會員 API；忘記密碼對已知／未知 email 都回 200，不洩漏帳號是否存在。每輪清理並核對 Auth users、profiles、手機認領、權益、交易無殘留；本機未驗證真實重設信寄達與點擊後改密碼。
- `supabase migration list --local --workdir /Users/jasonmchen/.local/share/xunfeng-qa-supabase`：QA 唯讀核對隔離庫最後一筆 `20261011045641` 在 Local／Remote 欄相同；工程1回報乾淨 reset 共 48 份 migration 成功。此為本機隔離庫，不代表正式庫已套用。
- Ego Lite 正式站手機寬 390px：`/services`、`/cases`、`/courses`、`/booking`、`/member-pricing`、`/login`、`/member-ai/decision`、`/member-ai/face` 八頁的 `scrollWidth` 均為 390px，未見水平溢出；手機選單可開關。預約空表單顯示「請填寫姓名」，未產生有效預約。截圖：`docs/qa/evidence/2026-10-11/xunfeng-qa-home-desktop.png`、`xunfeng-qa-home-mobile.png`、`xunfeng-qa-courses-form-mobile.png`。
- `node --env-file=.env.local scripts/qa-paid-order-readonly.mjs`：目前環境的最新已付款訂單為 2026-09-08 02:32 UTC、TWD 980；付款 MAC／金額、權益、交易與發票均對上。台北時間 2026-10-07 全天在同一 Supabase 專案的 `orders`／`payments`／`invoices` 各 0 筆。這無法對應交接文件所述 10/07 刷卡回報，需交易號碼與正式部署環境核對，不能據此判定刷卡失敗。
- Vercel 正式環境變數唯讀核對：`ECPAY_MERCHANT_ID` 與交接所列 `3325455` 一致；`NEXT_PUBLIC_SUPABASE_URL` 為受保護值，CLI／API 未提供值，**尚不能證明**本機 `.env.local` 所指資料庫就是正式站資料庫。
- 既有 Council 正式站並行、輸入上限與每日 20 份驗證：見 `docs/qa/council-qa-2026-10-07.md` 與 `handoff.md`；本輪未重跑付費／LLM 流程。

狀態：**已驗**＝有本輪執行證據；**既有證據**＝交接紀錄有舊驗證；**待驗**＝只有設計、讀碼或單元測試；**不合格**＝有可重現的違反驗收條件。`已驗` 只適用於列出的情境，不表示整列功能全面通過。

機械盤點另見 [API 與頁面路由驗收缺口清單](route-inventory-2026-10-11.md)：目前列出 88 個 API route 檔與 50 個頁面檔，逐路由標明既有證據或待驗；可用 `node scripts/qa-route-inventory.mjs` 隨程式重建。此清單補足下表較粗的功能分組，不把「待驗」當通過。

## Test Matrix

| 功能 | Happy | Unhappy（含非法字元／繞過 UI） | 邊界／空狀態／超長 | 並發／重送 | 目前狀態 |
|---|---|---|---|---|---|
| 官網與內容 CMS | 首頁、關於、服務、案例、課程、方案及導覽正確 | CMS 缺欄位、圖片 404、HTML/XSS 文案安全顯示 | 空清單、超長標題、手機寬度、快取更新 | 同時編輯與讀取內容 | 正式站公開頁 SSR 唯讀煙霧 9/9（HTTP 200、title／h1／main、無錯誤文案）；M12/M13 隔離驗證服務下架與字串布林輸入。正式站完整視覺、hydration、CMS 互動及手機尺寸待驗 |
| 註冊與免費試用 | 新信箱建立 profile、30 點／30 天、通知 | 重複信箱、壞 email／手機、弱密碼、SQLi/XSS 字串 | 空姓名、超長欄位、同手機第二帳號不重領 | 同手機多帳號同時註冊只發一次 | 隔離 API/DB 9/9、同手機 N=3 只發 1 次已驗；通知信、UI 與效期精確邊界待驗 |
| 登入／登出／重設 | 有效密碼取得權杖、登出、重設成功 | 錯密碼、失效／過期 token、重設連結重用 | 空欄、超長密碼、郵件限流 | 同 token 登出與刷新競爭 | **C12 隔離 API 6/6＋Ego 會員／管理員雙分頁登出通過**，舊 access／refresh 均 401、雙 token 清空；故障時保留憑證並提示重試；其餘隔離 API 正確／錯密碼 200／400、無效 refresh 401、有效 refresh 200、已知／未知信箱忘密皆 200、過期 JWT 401；**C15 補修分支 Ego 隔離改密兩輪各 11/11，正式站舊版仍 crash，真實信件待驗**；M8 錯密碼英文、M9 過期 token 假空狀態 |
| 會員中心與資料隔離 | 只讀本人方案、點數、訂單、使用量 | A token 查 B 的 ID、直接打 API、管理員路由 403 | 無方案、0 點、到期瞬間、分頁尾頁 | 點數更新後多分頁同步 | 隔離庫 A/B 核心表讀取及會員訂單／使用量 API 11/11：付款已到但權益未開通可見、開通後輪詢更新；Ego UI 本人資料／空報告／pending 單已驗，過期 token 假 FREE/0 點 QA-FS-M9；其他表待驗 |
| 方案與訂單建立 | 後端定價、有效方案、發票資料入單 | 偽造金額／方案、內部方案、非 TWD、SQLi | 空方案、超長 `plan_code`、公司統編／載具邊界 | 雙擊結帳、兩個 pending order | M4 邊界及 `e2e_` 內部方案 code／ID 直打 API 拒絕，隔離 9/9；後台 pending 訂單／發票唯讀 8 項通過，非法訂單 id 三種 500 QA-FS-M10；雙送兩單 QA-FS-M5，完整付款待驗 |
| 綠界付款通知 | 合法 MAC、金額吻合後開通與寄信 | 偽造 MAC、錯金額、跨單交易號衝突、未知訂單、失敗通知 | ATM 取號≠已付款；付款後 DB 部分失敗重送 | 同 webhook N 次只開通／寄信一次 | QA-FS-C3 待對帳；C4 clean DB 四情境 20 輪通過（含 N=10 並發、跨單交易號 409），RPC／稽核表非 service role 5/5 拒絕；正式部署與寄信待驗 |
| 會員權益／續訂／加購 | 點數結轉、效期延長；加購只加點 | 逾期、退款後使用、錯方案 | 餘額 0、效期 now、結轉極值 | 同時付款通知、同時扣點 | **C9 現行 HEAD 不合格**：migration 已暫回退，未套 1600 的本機庫仍 2 筆 active／新列降級；先前會員／面相 11/11 限已套舊 migration 的 C9 隔離庫，不能放行 |
| 管理員補扣點 | 補點與交易明細、audit 一致 | 非管理員、無效會員、超額扣點、audit INSERT 故障 | 5 點扣 10 點、0 點、極大數字 | 雙管理員同時調整同會員 | **不合格 QA-FS-C2**：超額扣點餘額與交易 amount 不一致；替身另見 audit 故障時 HTTP 200、餘額與 ledger 已變但 audit 0，已併入 C2 |
| 啟用碼建立 | 管理員建立後碼、期限、點數與 audit 一致 | 匿名／會員拒絕，未知／SQLi 形狀方案碼、audit INSERT 故障 | 0／3650／3651 天、0／100000／100001 點、501 字備註 | N=10 同時建碼不重碼 | 隔離 API/DB 13/13，11 筆唯一碼及 audit 對帳；audit error 替身見 code 已新增並回傳、audit 0（QA-FS-C20）；正式站與真 DB 故障待驗 |
| 啟用碼兌換 | 未使用碼只開通一次 | 不存在、已用、void、SQLi | 空碼、超長碼、交易寫入失敗回滾 | 同碼雙送只能一成功 | **QA-FS-B2 隔離複驗通過，待部署**：QA route 4/4、QA API/DB N=10 與故障注入兩輪通過；正式站未複驗 |
| AI 即時問答 | 有權益、有點數才生成，成功依中文字數扣點 | 無／過期 token、LLM 失敗不扣、直接 API 注入 | 空訊息、4,000 字、40 則歷史、餘額 1 | 同會員雙送只能計費交付一份 | **QA-FS-B1 原缺陷已重現；整合候選 `d5758bb` 乾淨 49 migration＋production build 在專用 stack 以假模型真 HTTP N=10×3 輪全通過**：每輪僅 1 答／1 扣／1 模型呼叫、9 筆 409、順序重送正常；B3 同 stack A/B 直呼舊 RPC 5/5。真付費模型、main 整合與正式站仍待驗 |
| 易學決策報告 | 所選術數成稿、扣 20、歷史可找回 | 無權益、錯日期、prompt injection、provider 失敗 | 19／20 點、每日第 20／21 份、字數上限 | 同會員 4 份只成功 1；斷線找回 | 並發、schema、每日限額有既有正式站證據；隔離 API/DB A/B 歷史與直接寫入 5/5；瀏覽器找回／備援待驗 |
| 奇門校對與老師規則庫 | 三盤比對、版本簽核、文件選取生效 | 非管理員 403、不完整簽核 400、錯版失效 | 0 文件、150k 字總額、單份 24k 字、手機九宮格 | 同時發布／簽核版本 | 任意時間試排隔離 API 11/11（3×3、非法／超長／不存在日期、五路並發）；QA-FS-M25 面相規則發布 route＋替身 7/7；QA-FS-C21 prompt/school publish、Qimen signoff 三路 audit error 均 HTTP 200且變更已生效但 audit 0（combined suite 5/5）；真 DB 並發待驗；老師未簽核，最新規則庫未做完整 UAT |
| Provider 保留設定核准 | 具名管理員核准／撤銷、顯示正確狀態 | 會員／共用 key 拒絕、非法日期、疑似 token 字串 | 空機構／專案標籤、超長說明 | 雙管理員同時核准／撤銷 | QA-FS-C22 POST/DELETE route＋替身 audit 故障均 200、狀態已變、audit 0；真 DB／provider 未驗，Gemini 路由待測 |
| 老師文件與提示詞設定 | 管理員上傳／編輯／發布內容並留 audit；總字數一致 | 非管理員拒絕、audit 故障時不得悄悄生效、無效檔案拒絕 | 空檔、2MB／150k 字、超長標題、0 文件 | 同文件同時編輯／發布、audit 故障回滾 | **QA-FS-C19 不合格**：文件 POST/PATCH/DELETE audit 故障後 201/200/200 仍變更無 audit，隔離兩輪各 7/13；QA-FS-C21 prompt／school publish audit 故障 route 替身各回 200、已切換 profile、audit 0（兩者同屬 combined suite 5/5）。真 DB transaction／並發、正常上傳／刪除及正式站待驗 |
| 面相分析 | 同意、上傳、品質、分析、報告／PDF、扣點 | 非本人取圖／PDF、錯 MIME、無學理 422 不扣 | 空圖、尺寸上限、任務／保存上限、過期圖片；M20 三條 run 路由非法 ID 回 500；M21 空上傳耗盡五次品質檢查額度 | 同 run 雙 analyze、重送 requestId；同報告 N=20 DELETE 只抹一次 | 隔離 API/DB A/B 報告／照片 8/8、M2 RLS 4/4；C6 同卡 N=10 單／雙管理員各 11 輪，bulk/import HTTP 14/15（含故障回滾，M14 重複碼回 500），隔離 UI 409 即時保留草稿；C17 修復分支保留 10/10、並發／回滾 5/5 且 10 輪通過，C18 audit 故障後無稽核仍發布（4/6）；M19 刪除 stale claim/RPC 可重入（13/15）；PDF 隔離下載本人／跨會員／重取正常，run ID 六路由矩陣兩輪各 15/24（M20）、空上傳兩輪各 4/10（M21）；M24 本人照片 DELETE 失敗注入 route＋替身 8/8，DB／Storage 持久狀態未驗；後台知識卡匯出 28 卡 8/8；正式部署、完整 UI／提供者端到端待驗 |
| 顧問預約 | 送出後後台可見、狀態可更新 | 缺聯絡方式、非法 email、腳本字串、管理員越權 | 空欄、80／4,000 字、只有電話 | 雙擊、公開入口灌單 | 隔離 API 邊界 7/7；具名管理員列表／詳情／PATCH＋audit 及 limit 邊界 M6 複驗 11/11；`@@@` 電話 QA-FS-M1、雙送 QA-FS-M3；限流待驗 |
| 課程報名與結帳 | 新生／複訓價格由後端算、報名及訂單一致 | 非法 email／發票、未知課程、偽造價格 | 空選項、超長備註、課程停用 | 雙擊結帳、同 email 同時建立 profile | 隔離 API 8/8 驗證／定價；後台未付款名單／跟進／audit、列表 limit 與摘要修補後 17/17；同 email 雙送 1 profile、2 pending 訂單／報名，QA-FS-M5 待規則；付款後待驗 |
| 發票與退款 | 付款後開票、失敗可重試、退款帳務一致 | ezPay 失敗／重送、錯統編、未退款卻登錄 | B2C／B2B、載具、捐贈碼、部分退款 | 重試開票／雙重退款 | A/B 發票 RLS 已驗；C8 非法補開票 7/7；C10 分次退款核心帳務通過；C13/C14/M16 最新 migration 隔離 HTTP/DB 複驗：正常 20/20、同鍵重送與異金額 17/17、N=10 並發 4 輪各 15/15、audit 故障回滾 15/15；Ego Lite 後台斷線重送只留 1 筆退款／交易／audit。正式 migration、外部開票／退款、作廢／折讓未驗 |
| 寄件網域管理 | 管理員查 DNS 狀態、建立並請求驗證 | 未授權、缺 key、上游 403 | 空網域、重複建立、非法／超長 action | 重複請求不建立第二網域 | 路由＋Resend 替身 11/11；舊交接有正式網域 verified／測試告警寄達紀錄，當前狀態與本輪正式流程未重驗 |
| 通知與忘記密碼信 | 註冊／付款／警報郵件寄達 | provider 429／失敗不阻主交易 | 空收件人、退信、模板超長 | webhook 重送不重寄 | 待驗；Supabase custom SMTP 未接 |
| 推廣歸因／分潤 | 有效碼綁定，訂單可追溯 | 無效碼、停用碼、猜碼不洩資料 | 空碼、大小寫、特殊字元 | 註冊與下單同時／重送 | 隔離庫公開查碼 8/8、會員建單歸因／比例快照 4/4；C7 具名管理員建立／改率／停用及 N=10 audit 11 輪隔離複驗通過；C5 停用後帶他人 cookie 轉歸他人待規則決策；註冊當下與正式資料待驗 |
| 後台營運與 CMS | 具名管理員可管理會員、訂單、預約、課程、內容與 audit | 無 token／會員 token 403；未授權直接 API | 空表、分頁、上傳 2MB、超長內容 | 雙管理員編輯同一資料 | 73 個 handler × 匿名／無效 bearer／有效會員，共 219/219；具名管理員 23 個 GET 路由 23/23 冒煙、後台 23/23 靜態路由殼層導航、預約 11/11、建碼 13/13、課程跟進與列表修補後 17/17；C16 分支 205 筆分頁／搜尋 9/9＋Ego UI、1,001 筆規模 11/11，正式站待驗；各 GET 內容對帳及其他寫入待驗 |
| 排程與清理 | 到期權益、pending 訂單、面相圖片按時清理 | 無 CRON_SECRET 或偽造 token 拒絕 | 空候選、批次上限、剛付款競爭 | cron 重入與付款 webhook 同時 | **C11 隔離複驗 13/13 通過**：權益／舊 pending 清理、保留點數、audit 與重跑正常；面相圖片清理路由 QA 替身 7/7 通過（密鑰、空批、過期／未到期、Storage／DB 更新故障、100＋1 批次）。真 Storage、正式排程及付款／上傳競爭待驗 |
| RLS／資料安全 | 本人可讀、其他會員不可讀，service role 不外露 | 直接打 Supabase／API 越權、SQL injection 嘗試 | 空資料、異常 UUID、超長篩選字串 | 權限撤銷後舊 token | 匿名對 11 張有資料表的樣本讀取已驗；隔離庫 A/B 核心會員、財務、課程、使用量與報告跨會員讀取及直接寫入封鎖已驗；其他表／RPC 待驗 |

所有寫入型正常情境應使用獨立 QA 帳號、可清理測試資料及測試金流／發票環境。先記錄前後 DB 快照，再對照 API 與 UI；正式付款、開票或老師簽核需有可追溯的專用驗收交易。

**環境建議：**優先使用 preview 部署＋隔離 Supabase 專案＋綠界／ezPay 測試環境。優點是可重跑並發與故障注入、可清理資料；代價是先複製 migration、seed 與 provider 設定。直接用正式站 QA 帳號較快，但會產生真實訂單、郵件、LLM 成本與難清理的發票／付款紀錄；僅保留少量指定交易作最終正式驗收。

## 可重跑的自動化腳本

1. **安全入口 API 腳本（本輪 21/21）**：`node scripts/qa-safe-api-smoke.mjs --base-url=http://localhost:3100`。測試公開 GET、未登入／失效 token、空請求、超長內容、SQLi 形狀字串與假 MAC；每個 POST 在寫入前被擋，能安全重跑。
2. **財務與並發複驗**：`npx vitest run app/api/member/redeem/route.qa.test.ts app/api/ai/chat/route.qa.test.ts app/api/admin/credits/route.qa.test.ts app/api/payments/ecpay/notify/route.c4.test.ts`。啟用碼 QA route 已轉綠，AI 問答與管理員補扣點仍為 `expected fail`；C4 工程 route 測試及 QA 隔離 DB 20 輪回歸通過。啟用碼隔離 DB N=10／故障注入已由 QA 獨立複驗。綠界重送腳本 `scripts/test-ecpay-idempotency.mjs` 必須指定隔離訂單；Council 並發腳本 `scripts/qa-council-concurrency.mjs` 會扣點及呼叫 LLM，需專用帳號。
3. **匿名 RLS 抽樣（本輪 11/11）**：`node --env-file=.env.local scripts/qa-rls-anon-smoke.mjs`。只讀取一筆 ID 再以匿名 key 查同筆；不輸出資料與金鑰。無樣本表會跳過，不可視為通過。
4. **後台權限（219/219）**：`node scripts/qa-admin-authz-smoke.mjs --base-url=http://127.0.0.1:3101 --members-file=/private/qa-members.private.json`。從 route 檔自動列舉 GET／POST／PUT／PATCH／DELETE，對匿名、無效 bearer、有效一般會員各送空請求；先檢查會員 token 可讀 `/api/member/me`，再要求後台全部 403。不產生資料寫入；具名管理員正常流程仍待驗。
5. **已付款訂單唯讀對帳**：`node --env-file=.env.local scripts/qa-paid-order-readonly.mjs [--order-no=XF...]`。預設抽最近一筆，可指定交易號精確查；只輸出後四碼、狀態與筆數，不輸出會員個資。
6. **隔離庫會員 A/B 與過期權杖（本輪 7/7）**：`node scripts/qa-rls-member-isolation.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。只接受 localhost REST URL，直接用 A/B bearer 查本人與對方三張表，另以本機過期 JWT 驗證 401；不輸出金鑰與資料內容。
7. **綠界付款紀錄隔離複驗（clean DB 四情境連續 20 輪通過）**：`node scripts/qa-ecpay-notify-accounting-local.mjs --base-url=http://127.0.0.1:3103 --env-file=/private/connection.private.env --app-env-file=/private/run-local-app.sh`。只接受 localhost 與 stage/local 通知設定，建全新會員與訂單，測錯金額、paid 後失敗、同單 N=10 並發及跨單相同 provider trade number；稽核事件、canonical、權益與交易逐一核對，最後清理。舊版 3101 的訂單 A/B RLS 2/2 已另有執行證據；此腳本現專測 C4。
8. **啟用碼原子交易（隔離環境兩輪通過）**：`node scripts/qa-redeem-atomic-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。專用碼 N=10 並發及故障注入 rollback；核對 code、entitlement、credit transaction 前後狀態並清理。
9. **顧問預約邊界與雙送（7/7；重複 2 筆已觀察）**：`node scripts/qa-booking-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env`。唯一 source，驗空資料、無聯絡方式、非法 email、80/81 字姓名、4,000/4,001 字留言、無效電話及雙送，最後清理 DB。
10. **會員建單與定價（最新 9/9；雙送 2 單已觀察）**：`node scripts/qa-orders-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。3104 是獨立 production build。有效會員直接 API 建單，驗後端定價、發票輸入、SQLi 形狀、64／65／10,000 字方案碼、`e2e_` 內部方案 code／ID 拒絕與雙送；非法輸入核對零寫入，測試內部方案及 pending 訂單最後清理，不觸發真實付款。
11. **課程結帳與定價（8/8；雙送 2 單已觀察）**：`node scripts/qa-course-checkout-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env`。驗六種非法／邊界、兩種報名身分的 DB 訂單／報名／價格及同 email 雙送，最後清理專用 profile、order、registration。
12. **註冊／登入／同手機試用（最新 9/9）**：`node scripts/qa-register-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env`。用三個新 email 同手機並發，驗註冊、30 點只發一次、重複 email、錯密碼、refresh、忘密不洩漏帳號與非法欄位；最後刪並核對 Auth／DB 測試資料。
13. **會員直接寫入隔離（6/6）**：`node scripts/qa-rls-member-writes.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。僅 localhost 隔離 Supabase；有效會員 token 直接 PATCH 本人／他人 profile、他人訂單，及 POST paid 訂單／權益／交易；用 service role 核對 DB 未變動，finally 還原 fixture 與清理自建資料。
14. **付款 RPC／稽核表權限（5/5，連續三次）**：`node scripts/qa-ecpay-rpc-authz-local.mjs --env-file=/private/connection.private.env`。僅 localhost 隔離 Supabase；service role 預檢端點存在，匿名與有效簽章的 authenticated 角色直接呼叫 RPC 及讀稽核表均被拒絕。
15. **面相報告所有權（8/8）**：`node scripts/qa-face-owner-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。建立 A/B 專用已完成報告，驗列表、詳情、預覽、刪除與原始資料庫權限；不呼叫 provider，最後清理並核對。
16. **Council 報告所有權（5/5）**：`node scripts/qa-council-owner-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。建立 A/B 專用歷史報告，驗列表、詳情與 PostgREST 讀／改／插；不呼叫 LLM、不扣點，最後清理並核對。
17. **具名管理員預約管理（M6 隔離複驗 11/11）**：`node scripts/qa-admin-booking-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。建立獨立 Auth 管理員與預約，對列表、詳情、PATCH、audit、非法狀態、會員越權及非法 limit 做 API/DB 對照；最後清理 Auth/profile、預約及 audit。
18. **財務／課程／使用量 A/B 隔離（9/9）**：`node scripts/qa-finance-rls-local.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。建立 A/B 專用訂單、發票、課程報名及 usage log，直接用各自會員 token 查本人與對方，另試跨會員 PATCH 發票；逐表清理核對。
19. **公開推廣碼查詢（8/8）**：`node scripts/qa-referral-lookup-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env`。建立專用推廣人，測正確、大小寫、空值、SQLi 形狀、LIKE wildcard、超長、停用與匿名直查表；回應不得含分潤率／聯絡資料／內部 ID，最後清理。
20. **會員訂單推廣歸因（4/4＋一項規則待決）**：`node scripts/qa-referral-order-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。測綁定與 cookie 優先序、停用、比例快照；觀察已綁定業務停用後是否被新 cookie 改歸（QA-FS-C5）；測試列及會員原值均清理還原。
21. **正式站公開頁 SSR 唯讀煙霧（9/9）**：`node scripts/qa-public-page-smoke.mjs --base-url=https://www.xunfeng.tw`。逐頁 GET 首頁、關於、服務、案例、課程、預約、會員方案、隱私與 thanks，檢查 HTTP 成功、title／h1／main 及錯誤文案；不登入、不提交表單。此腳本不驗 hydration、視覺、手機版或頁面互動。
21. **面相知識庫 RLS（4/4）**：`node scripts/qa-face-knowledge-rls-local.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。要求隔離庫先套 M2 SQL；檢查兩表 RLS 開啟、匿名／會員拒絕、service role 讀寫及卡片刪除 cascade，最後清理核對。正式 migration history／部署另驗。

22. **面相知識庫具名管理員流程（C6 隔離複驗單／雙管理員各 11 輪 15/15）**：`node scripts/qa-face-knowledge-admin-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json --cas=true --two-admins=true`；省略 `--two-admins=true` 驗單管理員。隔離 API/DB 自建管理員與 draft 卡，驗匿名／會員 401／403、非法與超長輸入 400 且零寫入、建立／查詢／更新／封存、revision 與具名 audit；N=10 同卡並發 PATCH 恰一成功、其餘 409，勝者具名 audit／版本／快照一致。所有列與 Auth 帳號清理核對。正式部署與 UI 衝突提示待驗。
23. **具名管理員建立啟用碼（13/13）**：`node scripts/qa-admin-create-code-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。隔離 API/DB 驗權限、非法方案／期限／點數／備註、上下邊界及 N=10 建碼唯一性，核對 DB 和 audit，最後清理所有碼及帳號。
24. **課程未付款名單與管理員跟進（修補後 17/17；QA-FS-M7/M11）**：`node scripts/qa-admin-course-followup-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。專用報名／管理員，驗未付款仍可見、狀態時間戳與 audit、權限、超長備註、兩筆報名下 `limit=1` 的完整摘要及非法值；全部測試列清理核對。
25. **推廣人後台建立／修改／稽核（C7 隔離複驗 11 輪 13/13）**：`node scripts/qa-admin-referrals-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。自建管理員與推廣人，驗角色、非法輸入、重碼、列表／空統計、分潤率與停用 DB，建立及修改 audit 含具名操作者和修改前後值；再以 N=10 並發改比例，查每筆 audit 與最終值。最後清理；正式站待驗。
26. **後台訂單／發票唯讀對帳（8/11；QA-FS-M10）**：`node scripts/qa-admin-finance-read-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。專用 pending 訂單／發票與具名管理員，驗權限、列表、詳情、合法不存在 UUID 與三種非法 id；不觸發付款／開票，最後清理。
27. **手動補開票錯誤輸入（C8 route 測試 7/7）**：`npx vitest run app/api/admin/invoices/'[orderId]'/issue/route.qa.test.ts app/api/admin/invoices/'[orderId]'/issue/route.c8.test.ts`。mock paid 訂單、已存買受人與開票 helper；合法空 body 可沿用，無效公司統編／壞 JSON 在開票前 400；隔離真 API／DB 與正式部署待驗。
28. **VIP 加購 0 點 DB 邊界（QA-FS-C9，現行 HEAD 預期失敗）**：`bash scripts/qa-addon-zero-balance-local.sh /private/connection.private.env`。僅接受 localhost DB；交易內自建 VIP 0 點與 paid 加購單，按 active／未到期穩定排序選取。未套 1600 的主本機 QA DB exit 3：2 筆 active、新列非 VIP；C9 舊獨立庫已套被回退的 migration 才 exit 0。`--migration-preview` 對應檔案已由 `f0ae9b0` 刪除，暫不可用；交易均 rollback。
29. **手動補開票隔離 paid 訂單 API（C8 7/7）**：`node scripts/qa-invoice-issue-invalid-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。只接受 localhost API/DB；自建具名管理員及 paid 訂單，驗匿名／會員權限與四種非法 body 均在開票前被擋，invoice／audit 不新增，訂單不變，最後清理。合法 ezPay 開票需測試環境另驗。
30. **拆分退款點數取整（C10 隔離複驗通過）**：`bash scripts/qa-refund-rounding-local.sh /private/connection.private.env` 驗 99＋100／199 元回收 20、餘額 0；`bash scripts/qa-refund-boundaries-local.sh /private/connection.private.env` 驗直退、1＋1＋197、超額與全退後重送；`bash scripts/test-refund-cumulative-concurrency-local.sh /private/connection.private.env` 驗並發，QA 連跑 10 輪；`psql "$DB_URL" -f supabase/tests/refund_cumulative_shortfall.sql` 驗短缺。限 localhost DB；QA SQL 交易 rollback，工程並發腳本清理獨立 fixture。
31. **會員訂單／使用量 API（11/11）**：`node scripts/qa-member-read-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。只接受 localhost API/DB；A/B 各建測試訂單及 usage，驗身份、跨會員隔離、paid 尚未開通／開通後輪詢、SQLi 形狀訂單號，最後逐筆清理。
32. **公開 CMS 全下架空狀態（M12 隔離 1/1）**：`node scripts/qa-site-unpublish-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。只接受 localhost API/DB；本機服務先下架 1 筆時 API 9→8，全部下架後 `services=[]`；`finally` 還原並核對 9 筆原旗標。須在獨立內容庫執行，避免共享資源受短暫下架影響。
33. **排程正向清理（C11，修補後 13/13）**：`node scripts/qa-cron-cleanup-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`，本機 app 需 `CRON_SECRET=qa-cron-isolated-only` 並指向獨立 C4 庫。腳本先確認無既有待清候選，再建專用舊／新訂單與權益；驗匿名／錯密鑰、dry-run、真正清理、成功 audit、重跑與點數保留，最後刪除 fixtures/audit。C4 隔離庫已 13/13；正式排程待驗。
34. **CMS 發布型別直打 API（M13 隔離 4/4）**：`node scripts/qa-site-publish-type-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。獨立庫自建具名管理員與服務；`is_published:"false"` 在 POST/PATCH 都 400 且不發布，真布林上／下架正常；`finally` 清除服務、audit、Auth/profile。其他錯型與 `promo.active` 由工程單元案例覆蓋，正式站待驗。
35. **VIP 加購會員／面相 API（C9，指定舊隔離庫 11/11）**：`node scripts/qa-addon-member-api-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c9-connection.private.env`。本機 app 需 `FACE_ANALYSIS_ENABLED=true`；專用 Auth/profile、VIP 0 點及 paid 加購單；驗新 VIP/20、效期與 tier、會員 API 5 次、面相 run、重送／ledger 並清理。**C9 庫已套現被回退的 1600 migration**，11/11 不能放行現行 HEAD；須待商業決策後用新 fresh DB 重跑。
36. **面相知識庫 bulk／import（C6 14/15、M14）**：`node scripts/qa-face-knowledge-bulk-import-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。本機 app 需 `ADMIN_KEY=qa-face-shared-only`，隔離庫須套 C6 migration。驗五個共用 key 拒絕、具名 bulk 三狀態、import 新建／upsert 的版本／revision／audit、created_by、audit 故障注入時全交易回滾，以及同批重複 card_id 無部分寫入；目前重複碼 HTTP 500，修後目標 15/15。
37. **登出與 refresh 撤銷（C12 隔離 4/4）**：`node scripts/qa-logout-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。本機隔離帳號登入、讀會員 API、呼叫登出，原 refresh token 再換發 401；逐筆刪 Auth/profile。Ego Lite 另驗會員與管理員雙分頁、兩顆本機 token 清除，正式站待驗。
38. **具名管理員退款與故障回滾（C10/C13/C14/M16 隔離複驗通過）**：`node scripts/qa-refund-admin-api-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env` 驗角色、非法輸入、試算、99＋100 元、帳本與具名 audit，最新 migration 下 20/20；加 `--replay=true` 驗同鍵序列重送及異金額 409（17/17），`--replay=concurrent` 驗 N=10 並發（4 輪各 15/15），`--audit-fault=true` 驗 audit INSERT 故障全回滾（15/15）。只接受 localhost API/DB，專用帳號與訂單均清理；本機 app 設 `ADMIN_KEY=qa-face-shared-only`。正式 migration／站端仍待。
39. **管理員會員列表容量邊界（C16 分支 9/9）**：`node scripts/qa-admin-members-cap-local.mjs --base-url=http://127.0.0.1:3220 --env-file=/private/c4-connection.private.env`。自建具名管理員與 205 筆專用會員，驗預設首頁 50、全域 summary、五頁完整無重複、最舊 Email 搜尋及非法 page／q／cursor 400；分支 `d639e77` 9/9，`finally` 清理 Auth/profile。原主線固定 200、漏 5 的舊證據仍保留；正式部署待驗。
40. **具名管理員後台讀取冒煙（23/23）**：`node scripts/qa-admin-reads-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。逐一 GET 23 個不呼叫外部服務的後台 API，均為 200 JSON 且無 error；專用 Auth/profile 清 0。僅驗路由正常讀取；資料內容、寫入及正式站待驗。
41. **已發布面相教材的封存／刪除（C17 修復分支 10/10）**：`node scripts/qa-face-teaching-retention-local.mjs --base-url=http://127.0.0.1:3212 --env-file=/private/qa-c17-connection.private.env`。`7cae2cd`＋retention migration 的獨立 DB 上，直接或封存後刪曾發布規則均 409，未發布草稿可刪；資料清 0。正式整合／部署後重跑。
42. **四路由報告列表 limit（M17 隔離修復分支通過）**：以 `ced1432` 隔離 app 依序執行 `scripts/qa-face-list-limits-local.mjs`、`scripts/qa-council-list-limits-local.mjs`、`scripts/qa-admin-report-limits-local.mjs`，均帶 `--base-url=http://127.0.0.1:3211 --env-file=/private/c4-connection.private.env`。**8/8、8/8、16/16**；100／500 位數字及非法字串皆 400，合法預設與上限正常；每輪 fixture 清 0。正式整合／部署後需再跑。
43. **面相教材發布與 audit 原子性（C18 4/6，expected fail）**：`node scripts/qa-face-teaching-audit-atomic-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。只對專用 ruleId 注入 audit INSERT 故障，預期發布失敗且無 published 規則；現實 HTTP 200／published 1／audit 0。移除故障後正常發布與具名 audit 各 1；`finally` 清 trigger/function、規則、audit、Auth/profile。修後目標 6/6。
44. **奇門任意時間試排（11/11）**：`node scripts/qa-qimen-preview-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。隔離驗 3×3 九宮格、匿名與壞 token、空／越界／SQLi／500 字數字、不存在日期、五路並發確定性；專用 Auth/profile 清 0。盤面專業正確性待老師逐盤對照。
45. **管理員面相詳情與照片預覽（M18 13/19，expected fail）**：`node scripts/qa-admin-face-detail-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。合法報告、事件、audit、授權、隱藏 storage path 與 no-store、無照片／過期照片 410 通過；兩路由共六類非法 id 回 500。修後目標 19/19；專用資料在 `finally` 清 0。
46. **面相教材保留並發與刪除 audit 原子性（C17 修復分支 5/5）**：`node scripts/qa-face-teaching-retention-concurrency-local.mjs --base-url=http://127.0.0.1:3212 --env-file=/private/qa-c17-connection.private.env`。獨立 DB＋migration 上驗引文保留、發布／刪除兩管理員並發、會員直呼 RPC 403、audit 故障刪除回滾、正常重試具名 audit；並發／回滾另跑 10 輪各 4/4。QA fixture 清 0，正式整合／部署後重跑。
47. **會員面相報告刪除並發與冪等（M19 13/15，expected fail）**：`node scripts/qa-face-delete-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。A/B 專用報告，N=20 DELETE 與重送；PII 抹除、權限正常。已刪列仍可被 route 同款條件 claim、RPC 再 redact；修後 15/15 並多輪壓力回歸，資料清 0。
48. **會員面相 PDF 下載（M20 7/10，expected fail）**：`node scripts/qa-face-pdf-local.mjs --base-url=http://127.0.0.1:3214 --env-file=/private/c4-connection.private.env --members-file=/private/qa-members.private.json`。本機 app 必須設 `FACE_ANALYSIS_ENABLED=true`；腳本登入兩位 QA 會員，建立專用完成／未完成報告，驗所有權、狀態、PDF 位元組與重取；三種非法 id 目前回 500。逐輪清理 DB run 與 Storage PDF。
49. **會員面相 run ID 六路由矩陣（M20 15/24，expected fail）**：`node scripts/qa-face-run-id-routes-local.mjs --base-url=http://127.0.0.1:3214 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。本機 app 必須設 `FACE_ANALYSIS_ENABLED=true`；預檢有效會員後，六條方法／路由 × 四種 ID，無 fixture、無模型呼叫；修後應 24/24 且預覽／PDF／分析的有效流程仍須另驗。
50. **會員面相空上傳額度（M21 4/10，expected fail）**：`node scripts/qa-face-upload-empty-local.mjs --base-url=http://127.0.0.1:3216 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。本機 app 必須設 `FACE_ANALYSIS_ENABLED=true`；自建唯一 run，A/B 授權與非法 ID 後連送六次空 multipart，逐次核對 HTTP／`upload_attempts`／status；修後 10/10，fixture 清 0。有效圖片流程另驗。
51. **後台面相知識卡匯出（8/8）**：`node scripts/qa-face-knowledge-export-local.mjs --base-url=http://127.0.0.1:3217 --env-file=/private/connection.private.env`。隔離庫自建具名管理員與會員，驗授權、下載標頭、JSON 及卡片 ID 與 DB 一致；Auth/profile 清 0。此腳本只對現有 28 卡驗完整性，超過回傳上限與正式站另驗。
52. **老師文件三路由稽核故障原子性（C19 7/13，expected fail）**：`node scripts/qa-admin-document-audit-local.mjs --base-url=http://127.0.0.1:3218 --env-file=/private/c4-connection.private.env`。僅接受本機 C4 隔離 DB；腳本自建具名管理員／文件與精確匹配 action／`target_id` 或 QA 管理員的故障觸發器，驗上傳、PATCH、刪除與 audit 同結果，故障移除後正常寫入及完整清理。修後須 13/13，再盤點共用稽核 helper 的其他高風險路由。
49. **密碼重設 Ego Lite E2E（C15 修復分支兩輪各 11/11）**：`node scripts/qa-reset-recovery-ego-local.mjs --base-url=http://127.0.0.1:3218 --env-file=/private/c4-connection.private.env --space-id=81`。需先在既有 QA TaskSpace 81、`6bd59cd` 隔離 app 執行；腳本建／刪專用 Auth，驗有效／已用／無連結／無效 token、短密碼／不一致、改密、新／舊密登入及 hash 清空，僅清理 3218 origin。正式站、真實寄信與實際過期時間待驗。
50. **舊扣點 RPC 直接 HTTP 權限（B3 既有 QA 庫 6/6，僅作基礎探針）**：`node scripts/qa-credit-rpc-postgrest-local.mjs --env-file=/private/c4-connection.private.env --members-file=/private/qa-members.private.json`。使用不存在的 profile／權益 UUID，不會扣真實點數；匿名／會員直接呼叫 Chat／Council 各拒絕，service_role 可進函式後因無權益回 CR002。乾淨候選 stack 的真 A/B 驗證另見下一項，正式部署後仍須重跑。
51. **舊扣點 RPC fresh stack A/B 越權複驗（B3 兩輪各 5/5）**：`node scripts/qa-credit-rpc-isolated-local.mjs --env-file=/private/qa-b3-connection.private.env`。只接受 localhost Supabase，逐輪建立 A/B 專用 Auth/profile 與 B 5 點；A 直呼兩 RPC 被拒、B 餘額與 ledger 不變，service_role 可各扣 1 點且帳本對上；最後清理並核對 0。正式站仍待部署回歸。
52. **AI 問答租約並發（B1 先 1 輪、再 10 輪 N=10 全通過）**：`node scripts/qa-chat-slot-concurrency-local.mjs --env-file=/private/qa-b1-connection.private.env --rounds=10 --n=10`。每輪獨立 profile，同時搶租約與到期後重搶，各僅一個 token；舊 owner 不能釋放新租約，最後清理。
53. **AI 問答原子結算（B1 四輪各 5/5）**：`node scripts/qa-chat-atomic-commit-local.mjs --env-file=/private/qa-b1-connection.private.env`。測 3／1 點、usage 與 ledger 一致、故障注入回滾、同租約重試與已釋租約拒絕；專用 trigger／資料清理。
54. **AI 問答 API 無模型成本故障路徑（B1 兩輪各 7/7）**：`node scripts/qa-chat-route-failure-local.mjs --base-url=http://127.0.0.1:3215 --env-file=/private/qa-b1-connection.private.env`。候選 app 須明確不設 `OPENAI_API_KEY`；驗匿名、空／超長、預占租約 409、模型設定失敗釋放、不扣點與重試、零點拒絕。有效模型回覆與真正 HTTP 併發交付另待驗。
55. **AI 問答假模型 HTTP 並發（整合候選 `d5758bb` 專用 stack 3/3）**：`node scripts/qa-chat-concurrent-http-local.mjs --base-url=http://127.0.0.1:3215 --env-file=/private/qa-b1-connection.private.env --mock-port=3291 --rounds=3 --n=10`。候選 app 設 `OPENAI_API_KEY=qa-fake-only`、`OPENAI_BASE_URL=http://127.0.0.1:3291/v1`；腳本在 loopback 啟動延遲 1.2 秒的假 Responses API，應驗每輪唯一 200、九筆 409、模型呼叫／扣點／usage／ledger 各一次，再順序重送。先前環境中斷批次作廢；最新專用 stack 已三輪通過，不呼叫真實模型。

## 效能與壓力測試提案

以下是**驗收目標提案**，尚非量測結果。先在 preview／隔離庫以 1、5、20 並發階梯測 10 分鐘，記錄 p50／p95／p99、錯誤率、DB pool、供應商 429、成本及重試數；每批用獨立帳號與唯一資料前綴，清理後核對列數。

| 流量類型 | 起始目標 | 瓶頸假設 | 驗收與隔離方式 |
|---|---|---|---|
| 公開頁／公開 GET | 30 QPS、p95 < 1 秒、5xx < 1% | CMS JSON、冷啟動、圖檔 | k6／autocannon，固定內容版本；只打測試部署 |
| 登入／會員讀 API | 5 QPS、p95 < 2 秒、5xx < 1% | Supabase Auth／DB 連線 | 20 個 QA 帳號輪流，避免單 IP 供應商限流混入結果 |
| 預約／課程／訂單建立 | 2 QPS、p95 < 3 秒，無重複權益 | DB 多表寫入、外部金流參數 | 僅隔離庫／沙箱；每請求唯一 key，核對訂單與報名列 |
| AI 問答／報告／面相 | 每會員最多 1 進行中；報告 p95 < 240 秒 | LLM 429、300 秒 function 上限、寫入與扣點競爭 | 先 mock provider 壓 API，再用小批專用帳號真實提供者；設成本上限 |
| 綠界通知重送 | 同單 10 並發，開通／交易／通知各恰 1 | `commit_paid_entitlement`、課程報名狀態競爭 | 合法測試 MAC＋隔離訂單，逐表快照；不碰真實會員訂單 |
| 後台會員搜尋／分頁 | 5 QPS、p95 < 2 秒；1,000 會員全可找回 | 固定 200 上限、深分頁與權益關聯查詢 | 隔離庫 1,000 專用會員，按 Email 查首／中／尾頁，核對真實總數與跨頁唯一性；結束清 0 |

## 客戶 UAT 清單（逐項勾選）

客戶操作版草案見 [巽風 V2 客戶功能驗收清單](customer-uat-checklist-draft-2026-10-11.md)，逐項含操作、預期、結果與證據／複驗欄；目前未簽核，下列內部追蹤清單仍作缺陷 gate 依據。

### 官網、會員與付款

- [ ] 桌面與手機可瀏覽首頁、服務、案例、課程、方案、預約與隱私頁，導覽正確。
- [ ] 後台將服務、案例或課程全部下架後，公開頁與 API 不再顯示已下架內容；資料源故障時的備援內容符合營運規則。**QA-FS-M12 服務隔離 API 1/1；案例／課程與正式站頁面驗收前不可勾**。
- [ ] 後台新增或更新草稿時，只有明確勾選上架才公開；API 收到字串 `"false"` 等非法型別不會誤上架。**QA-FS-M13 服務隔離 API 4/4、型別單元測試通過；正式站 UI 前不可勾**。
- [ ] 新會員註冊成功，30 點試用與到期日正確；同手機第二個帳號不再取得試用點。
- [ ] 登入、登出、忘記密碼及重設密碼均可用；過期登入會要求重新登入。**QA-FS-C15 補修分支隔離 Ego E2E 兩輪各 11/11；正式部署、真實收信與站端複驗前不可勾**。
- [ ] 錯密碼顯示清楚的中文提示且不洩漏帳號是否存在；過期登入提供直接重新登入入口，不顯示可能誤導的點數。**QA-FS-M8/M9 修復前不可勾**。
- [ ] 會員中心只顯示自己的訂單、點數與報告，不能開啟其他會員資料。
- [ ] 購買方案顯示正確價格與發票資訊；付款成功後權益及點數只開通一次。
- [ ] VIP 方案點數歸零但尚未到期時，加購後會員中心立即顯示新點數並可使用，原 VIP 等級與專屬規則保留；同到期日也不會讀到舊 0 點。**QA-FS-C9 修復及複驗前不可勾**。
- [ ] 重複點結帳的訂單處理符合已確認規則；超長／錯誤方案碼有明確 4xx 回應。**M4 隔離複驗通過，正式部署及 M5 規則／複驗前不可勾**。
- [ ] 金額不符或後到的失敗／取號通知不會把已付款紀錄改錯；訂單、付款紀錄與權益一致。**QA-FS-C4 隔離庫已複驗；正式部署及指定交易複驗前不可勾**。
- [ ] 課程新生與複訓價格正確，報名單與訂單一致。
- [ ] 課程未付款報名仍出現在後台待聯繫名單；聯繫狀態、時間與具名稽核正確。**隔離 API 修補複驗 17/17，待正式部署及後台畫面驗收**。
- [ ] 個人／公司發票資料正確，失敗有後台重試與人工追蹤。
- [ ] 手動補開票輸入錯統編、壞 JSON 或非法載具時，不會沿用舊資料意外開票；錯誤回 4xx。**QA-FS-C8 隔離 paid 訂單 API 7/7 通過，正式部署前不可勾**。
- [ ] 退款先完成綠界操作，再於後台登錄；訂單、點數、報名及發票狀態一致。
- [ ] 一張訂單分次退款至全額時，未使用點數全部收回；每筆退款、點數交易及最終餘額可對帳。**QA-FS-C10 隔離 DB 與具名管理員 API 20/20；正式部署及金流／發票流程驗收前不可勾**。
- [ ] 管理員重按或網路重試同一筆退款登錄時，退款、點數交易與 audit 各只有一筆；相同冪等鍵而金額不同時明確拒絕。**C13 隔離 API/DB 及後台斷線重送 UI 已通過；正式 migration／站端複驗前不可勾**。
- [ ] 退款登錄的具名 audit 若寫入失敗，退款、扣點與訂單狀態一併回滾，不留下無稽核的財務動作。**C14 隔離故障注入已通過；正式 migration 複驗前不可勾**。
- [ ] 管理員建立啟用碼時，方案、期限、點數與稽核紀錄正確；同時建立多筆不重碼。**隔離環境已驗，正式站待驗**。
- [ ] 後台會員數超過 200 時，總數仍正確，較舊會員可依 Email 搜尋並進行管理。**QA-FS-C16 修復分支隔離 API 9/9＋Ego UI 通過；正式整合／部署前不可勾**。
- [ ] 面相教材規則發布後即使封存，也保留原規則與版本供舊報告引文追溯，不可由後台永久刪除。**QA-FS-C17 封存後禁止硬刪已隔離複驗通過；舊版正文還原未驗、正式整合／部署前不可勾**。
- [ ] 面相教材規則發布時，規則與具名稽核同時成功；稽核失敗不得留下已發布但無紀錄的規則。**QA-FS-C18 隔離故障注入不合格，修復／複驗前不可勾**。
- [ ] 啟用碼只可兌換一次；兩個視窗同時送出也只有一次成功。**QA-FS-B2 隔離複驗已通過，正式部署及站端回歸前不可勾**。

### 服務流程

- [ ] 顧問預約送出後在後台看得到，狀態與負責人可更新。
- [ ] 顧問預約聯絡資料可用，網路重送／雙擊不產生不必要的重複派案。**QA-FS-M1/M3 規則確定前不可勾**。
- [ ] AI 即時問答生成成功才扣點，回覆字數計費正確；並發不送免費答案。**QA-FS-B1 候選隔離 DB/API 無模型成本路徑通過；有效模型並發交付與正式站驗證前不可勾**。
- [ ] 易學決策報告只使用已選術數，完成扣 20 點，歷史與點數一致。
- [ ] 點數不足、日期錯誤、超長輸入、每日第 21 份會被明確擋下且不扣點。
- [ ] 雙分頁同時送易學決策，只完成一份；關閉分頁後可找回結果。
- [ ] 備援報告不扣點；AI 實際文字對未簽核奇門明示「尚待老師校對」。
- [ ] 老師核對三張奇門盤，確認晚子時設定並完成具名簽核。
- [ ] 面相照片不合格時可重拍且不扣點；空表單或缺照片不消耗五次照片品質檢查額度；合格後報告、歷史、PDF 與點數一致。PDF 隔離下載正常，但 QA-FS-M20 預覽／PDF／分析三條 API 的非法報告 ID 回 500、M21 空上傳耗盡嘗試次數，修復前不可勾。
- [ ] 面相圖片到期不可再取得，刪除報告後保存額度釋出；同時或重複刪除只抹除一次且 `run_deleted` 僅一筆。**QA-FS-M19 stale claim／RPC 可重入，修復與有效照片／PDF 驗證前不可勾**。

### 後台與安全

- [ ] 非管理員無法透過網址或直接 API 操作後台。
- [ ] 後台會員、訂單、發票、預約、課程、推廣、Token 用量資料可對上原始交易。
- [ ] 推廣人停用後，既有綁定會員的新訂單依已確認規則歸戶或不歸戶，分潤比例快照可追溯。**QA-FS-C5 決策與複驗前不可勾**。
- [ ] 管理員建立推廣人、修改分潤率或停用時，具名稽核可追查操作者及修改前後值。**QA-FS-C7 隔離環境 11 輪複驗通過，正式部署前不可勾**。
- [ ] 後台補扣點的交易明細與實際餘額變化相等；雙管理員同時調整不遺失任何一筆。**QA-FS-C2 修復前不可勾**。
- [ ] 到期權益排程將舊資格標為過期、保留原點數且不影響未到期會員；過期 pending 訂單會取消，已付款訂單不受影響。**QA-FS-C11 隔離複驗 13/13，正式部署及排程觸發驗收前不可勾**。
- [ ] 後台內容、老師文件、提示詞、排盤與面相規則的草稿／發布狀態清楚且有 audit log。**QA-FS-C19 老師文件上傳／啟用／刪除在 audit 故障時仍生效，修復與其他共用稽核入口盤點前不可勾**。
- [ ] 兩位管理員同時編輯同一面相知識卡時，每筆成功修改都有唯一版本與一致的修訂快照；衝突有明確提示且不流失草稿。**QA-FS-C6 單／雙管理員 N=10 各 11 輪、隔離 UI 409 即時保留通過；M15 刷新比對流程與正式部署前不可勾**。
- [ ] 面相知識卡批次送審／發布／封存及匯入後，每次成功都有版本、修訂快照與具名稽核；同批重複卡片代碼應提示輸入錯誤且不留下半套資料。**C6 隔離 HTTP 14/15（故障回滾通過）、QA-FS-M14 修復及 UI 驗收前不可勾**。
- [ ] 管理員可下載全部面相知識卡 JSON，會員不可下載，檔案不被瀏覽器或代理快取；大量卡片也不遺漏。**隔離 28 卡 API 8/8，正式站及大量資料待驗**。
- [ ] 後台手機畫面可讀，奇門九宮格及放大字級不重疊。
- [ ] 註冊／付款通知寄達；失敗可追查，重送付款通知不重寄。
- [ ] 登出後舊 refresh token 不可再換新 access token；會員與管理員裝置端憑證清除，其他分頁不可恢復已登出的登入狀態。**QA-FS-C12 隔離 API 4/4 與雙分頁 UI 通過；正式站部署回歸前不可勾**。
- [ ] 排程正確清除過期資料，不會取消剛付款訂單或刪除未到期圖片。**面相圖片清理路由替身 7/7；真 Storage、正式排程觸發與並發競爭前不可勾**。

## 派工票與未結風險

| 編號／等級 | 現象與證據 | 預期修復與複驗 | 狀態 |
|---|---|---|---|
| QA-FS-B1／BLOCKER | `app/api/ai/chat/route.ts` 扣點 CR002 時仍 200 送答；隔離 QA 測試 expected fail。另見獨立安全缺陷 B3 | 工程候選 `5d6cf68`：LLM 前搶會員租約，第二筆 409；扣點／usage／ledger 同交易，失敗不送答。工程最小 PG16 scratch 測試含 N=10 僅一筆搶鎖、回滾與權限；單元 5/5，typecheck/build 通過。X-QA 完整 49 migration stack 已獨立跑 N=10 租約 11 輪、1/多點與故障回滾四輪、API 409/失敗釋放兩輪。整合候選 `d5758bb` fresh 49 migration 後 PG N=10 再得 1/9；先前 Docker/Colima 逾時批次作廢；最新專用 stack production build＋本機假模型 HTTP N=10×3 輪全通過，每輪 1 答／1 扣／1 模型呼叫、9 筆 409，後續順序重送也正常。仍需真模型供應商、更新舊 expected-fail mock、同效期權益排序整合、正式站部署回歸 | **整合候選假模型完整 HTTP 並發隔離複驗通過；main／正式站仍未修，B1 不結案** |
| QA-FS-B3／BLOCKER | **持已知受害者 UUID 的跨會員越權扣點已在 C13 隔離 DB 動態重現**：`commit_chat_credit`／`commit_council_credit` 為 `SECURITY DEFINER` 且授一般會員執行；單一 BEGIN/ROLLBACK 建 A、B 專用會員，B 5 點；`SET LOCAL ROLE authenticated` 並令 `auth.uid()=A`，A 直接呼叫兩 RPC 傳入 B 的 profile／權益 ID，均成功，B 5→3 點、ledger 2 筆。ROLLBACK 後 QA profile 殘留 0。正式站未試 | 撤銷兩舊 RPC 對 PUBLIC／anon／authenticated 的 EXECUTE，保留 service_role；在**全新隔離 stack** 以 PostgREST 有效會員 bearer 證明 A 不能再扣 B、匿名不可執行、server Chat／Council 功能不受影響；X-QA 獨立複驗後才可結案 | 最小 hotfix 分支 `hotfix/b3-credit-rpc-execute`／`efc57dc` 基於 origin/main+1，只含撤權 migration 與 SQL 權限測試；C13 隔離 DB 單交易套用權限矩陣通過並已 ROLLBACK。B1 分支另有 `4162ce7` 同效補丁。X-QA 的共用 DB SET ROLE＋DO 直呼 harness 造成後端斷線且 fixture 一度殘留，已精確清零並刪除腳本；該輪**不算複驗**。X-QA fresh stack 48 migrations＋A/B 真受害者 ID 直接 HTTP 兩輪各 5/5、service_role 帳本對帳通過。整合候選 `d5758bb` 含 B3 migration；最新 QA 專用 49 migration stack 以 A/B 真 UUID 直接 PostgREST 5/5：匿名 401、會員跨人 403 且受害者點數不變、service_role 兩 RPC 200 且餘額／ledger 一致。完整 Chat／Council route、Tech Lead 審核及正式庫部署／回歸待辦，仍 BLOCKER |
| QA-FS-B2／BLOCKER | 原 route 先插權益後搶碼且不查 UPDATE 命中；工程1已改 `redeem_activation_code` 原子 RPC，QA route 4/4、隔離 API/DB N=10 與 rollback 兩輪通過 | X-PM 審核後套正式 migration 與部署，QA 以專用正式測試碼驗證同碼只成功一次及回滾 | 隔離環境複驗通過；正式站仍有舊漏洞，待部署與正式回歸 |
| QA-FS-C1／critical 待確認 | 已知發票無作廢／折讓流程；退款登錄後發票狀態可能不一致（`handoff.md`、後台發票 API） | X-PM 確認退款營運規則與實際開票環境，再排作廢／折讓驗收 | 待商業／財務決策 |
| QA-FS-C2／critical | 管理員 5 點扣 10 點時餘額變 0、交易卻記 -10；route 先讀後寫也會 lost update；隔離 QA 測試 expected fail。追加 route＋audit 替身：5→0 的正常 delta 與 ledger 寫入後，audit INSERT 回 error，API 仍 200、audit 0 | 決定超額扣點規則後，DB 原子更新餘額、交易與 audit；並發兩筆總額正確；audit 失敗不可靜默成功 | 已排入 X-PM 收件佇列，待規則決策與工程修復 |
| QA-FS-C20／critical | route＋audit helper 行為替身：有效啟用碼建立後 HTTP 200 且 code 已新增／回傳、audit 0；paid order 開票 helper stub 成功後 HTTP 200、helper 1 次、audit 0。未呼叫真 ezPay、未測真 DB | 啟用碼與 audit 原子建立，不留可兌換而無記錄之 code；invoice 使用隔離 provider stub、audit/outbox 可重試且重送不二次呼叫 provider；驗權限、正常流程與故障回復 | 已送 X-PM 定序／派工；真 DB／Provider 故障仍未驗 |
| QA-FS-C23／critical | 真實 `issueInvoiceFromOrder` helper＋本機 provider stub：首次 provider 回 success 後 `invoices` INSERT 故障，API 500、invoice/audit 0；同單重送再次呼叫 provider，第二次才存 row／audit。1/1 通過（缺陷重現），未打真 EZPay／未證其 MerchantOrderNo 去重 | provider success 後本地持久化故障再重送，不可盲目二次開票；以 provider idempotency/reference 查詢並恢復同一結果，invoice/outbox/audit 最終各一筆；驗 timeout、持續 DB 故障及 N=10 重送 | 待送 X-PM 排序／派工；provider 重複訂單號正式契約未知 |
| QA-FS-C21／critical | prompt／school profile publish 與 Qimen signoff 的 route＋audit 替身：三者皆 audit INSERT error 後回 200、資料已改／signoff row 已增、audit 0；未測真 DB | profile/status/cache 與 audit 原子；失敗時全回滾；Qimen signoff 不新增列；正常簽核／發布、權限與重送並發回歸 | 待送 X-PM 定序／派工；transaction/cache/consumer 未驗 |
| QA-FS-C22／critical | face-provider approval route＋替身：POST active、DELETE revoked 各在 audit INSERT error 後回 200且audit 0；未測真 DB/provider | 核准／撤銷狀態具可恢復 audit/outbox，重送冪等；具名 admin auth、非法輸入與不呼叫 provider 回歸 | 待送 X-PM 定序／派工；真 DB/供應商端未驗 |
| QA-FS-C3／critical | 本機 `.env.local` 所指 Supabase 專案於台北 10/07 無訂單／付款／發票；Vercel 正式 MID 與交接一致，正式 Supabase URL 受保護而未能核對 | 取得 MerchantTradeNo／TradeNo、金額、時間、MID 與付款入口；核對正式 Supabase URL 與各帳務表 | 已排入 X-PM 收件佇列，待交易資訊；不能宣告刷卡 E2E 通過 |
| QA-FS-C4／critical | 舊版錯金額留下假 paid、後到失敗通知覆寫 paid；第一版新 RPC 又在 N=10 並發 20 輪中 2 輪觸發 `23505 idx_payments_provider_trade_no_unique`／HTTP 500 | 最新 migration／clean DB 後，QA 獨立隔離庫四情境連續 20 輪通過：錯金額不入帳、paid 不降級、每輪 N=10 全 200／稽核 10／付款、權益、交易各 1；跨單 provider 交易號衝突 409，原付款不變；匿名／會員 RPC 與稽核表 5/5 拒絕。正式部署後用指定測試交易回歸 | 隔離環境複驗通過；正式 migration／部署／站端複驗待辦，仍追蹤 |
| QA-FS-C5／critical 待決策 | 會員 profile 綁 A、cookie 指 B；A 有效時新單歸 A，A 停用後相同情境新單歸 B。`lib/referral/attribution.ts` 同時承諾「終身歸戶」與「停用不歸戶」，實際 fallback 使分潤轉給別人；隔離腳本 4/4 及此觀察，資料清理還原 | 決策 A（QA 建議）：已綁定但停用→新單不歸因，cookie 不改歸；B：允許轉歸並明訂告知；C：既有綁定持續歸 A、停用只禁新歸戶。工程依決策實作並驗 active→inactive、不同 cookie、比例快照與建單不阻斷 | 已送 X-PM 排優先與商業規則討論；不可由 QA 擅定分潤 |
| QA-FS-C6／critical | 舊版同卡 N=10 並發曾 10 筆皆 200、覆用版本及遺失快照；工程 `73517cb` 改 DB 原子 CAS | QA 隔離庫單／雙管理員各 11 輪 N=10：每輪 1 筆 200／9 筆 409，版本／revision／具名 audit 一致；bulk/import HTTP 14/15，五寫入入口共用 key 403、具名序列版本一致、audit 故障注入全交易回滾；隔離 Ego UI 409 即時保留兩欄草稿且 DB 未覆寫。M14 重複碼 500、M15 刷新比對流程另列；再驗正式部署 | 隔離核心並發與 UI 衝突回應複驗通過；剩餘驗收仍追蹤 |
| QA-FS-C7／critical | 舊版具名管理員建立／修改分潤率及停用成功，但 `admin_audit_logs` 0 筆；工程 `d22a9ed` 改 DB 原子寫入 | QA 隔離庫 11 輪 13/13，建立及修改具名 before/after audit；每輪 N=10 並發改率均 200、各有 audit、最終值對上；RPC 權限與故障注入 SQL 通過。再驗正式 migration／部署 | 隔離複驗通過；站端仍追蹤 |
| QA-FS-C8／critical | 舊版手動補開票吞掉無效統編或壞 JSON，仍沿用舊資料開票；工程 `6dd756e` 補輸入驗證 | QA 兩個原 expected fail 已轉正常測試，與工程測試合計 7/7；隔離 paid 訂單 API 四種無效輸入及角色驗證 7/7、invoice／audit 零新增。合法 ezPay 開票與正式部署再驗 | 單元及隔離非法輸入複驗通過；站端仍追蹤 |
| QA-FS-C9／critical 待決策 | `0776141` 新會員／面相 API 在已套 1600 的 C9 隔離庫 11/11；但 `f0ae9b0` 因多 active 異 tier 在已付款 webhook 會拋錯而回退 migration。現行未套 1600 的本機庫 SQL exit 3：2 筆 active、新列非 VIP；真實 fresh DB 仍不合格 | 決策 A（建議過渡）：購買前辨識多 active 異 tier 帳號並暫停加購、提示人工整併；已付款單須補救／重試且不可漏開通。B：明訂保留最高 tier 的排序規則並原子整併。C：選最新／最晚到期 tier，但需明示可能降級。決策後以 fresh DB 跑 SQL、會員／面相／AI、已付款 webhook 和退款／後台全鏈回歸 | **BLOCKER 級上線閘門／critical ticket 未結**；需 X-PM 提商業規則與已付款補救方案供使用者決策，勿部署或宣告 C9 通過 |
| QA-FS-C10／critical | 原缺陷：199 元／20 點分次退 99＋100 後只回收 9＋10＝19、仍餘 1；工程 `7b55449`／`005caf4` 改累計比例並補舊紀錄 shortfall | QA 獨立 C4 庫套最新 SQL 後回收 9＋11＝20、餘額 0；直退、三段、短缺／舊紀錄對帳及兩退款並發 10/10 輪通過；最新 `6e6f4a4` 後具名管理員 HTTP/DB 正常 20/20，資料清 0。再驗正式 migration／管理員 UI、發票／外部退款 | **隔離 DB 與 API 核心複驗通過；正式流程待驗**，已回報 X-PM；同請求重送另列 C13 |
| QA-FS-C11／critical | 原缺陷：過期 active 權益 dry-run 候選 1，正式 GET 回 500，因寫入不存在的 `updated_at`。工程 `a692500` 後隔離 API／DB 13/13：權益 expired、點數保留、audit 正確、重跑候選 0，資料清 0；單元 3/3 | 正式部署後以專用過期測試資料驗排程觸發、狀態與 audit，再核對未到期／已付款不受影響 | **隔離複驗通過；正式排程待驗**，已回報 X-PM，不涉商業規則 |
| QA-FS-C12／critical | 原隔離登出 API 200 後 refresh 仍 200、會員 API 200；會員／後台登出只清 access。工程 `cf6dbc4` 撤銷 session 並清雙 token，`d1d3128` 修正撤銷失敗時的 UI 行為 | QA 隔離 API 6/6，舊 access／refresh 均立即拒絕，重複登出 200；Ego Lite 會員／管理員雙分頁登出同步生效。最新版會員 UI 故障注入 HTTP 500：停留原頁、雙 token 保留、錯誤提示；恢復後重試成功且雙 token 清除。QA Auth/profile 清 0。再驗正式站部署及管理員 UI 故障路徑 | **隔離 API/UI 複驗通過；正式站待驗**，已回報 X-PM |
| QA-FS-C13／critical | 原同單退款重送多記現金／扣點／audit；N=10 曾 2×200、8×500、雙重登帳。工程 `6e6f4a4` 加 UUID 冪等鍵與 DB 唯一約束 | QA C4 隔離 API/DB：同鍵序列重送 17/17，異金額 409 且零新效果；N=10 同鍵 4/4 輪均十筆 200、各 1 筆 refund/ledger/audit、餘額 11；工程 20 輪 N=10 也通過。Ego Lite UI 模擬首次回應遺失後重整與重送，UUID／表單保留、DB 恰 1 筆退款／ledger／audit，retry key 成功清除，資料清 0。再驗正式 migration／站端、實際快速雙擊 | **隔離 API/DB 與斷線重送 UI 複驗通過；正式站待驗**，已回報 X-PM；外部交易號與冪等鍵操作語意需 PM 確認 |
| QA-FS-C14／critical | 原 audit INSERT 故障時退款仍成功但無 audit；工程 `6e6f4a4` 改為同一 RPC 交易 | QA 專用訂單 audit trigger 注入故障：HTTP 500、refund/ledger/audit 0、點數 20、訂單 paid，15/15；工程整合腳本故障後同鍵重試通過，觸發器及資料清 0。再驗正式 migration／部署 | **隔離故障回滾複驗通過；正式站待驗**，已回報 X-PM，不涉商業規則 |
| QA-FS-C15／critical（驗收 BLOCKER） | 正式站先前僅顯 Application error；首修 `9a94721` 本機有效 recovery hash 無改密表單。補修 `6bd59cd` QA detached app／C4 隔離 Auth：Ego Lite 可重跑腳本兩輪各 11/11，涵蓋有效連結顯表單且清 hash、短密碼／不一致、改密成功、新密可登入舊密拒絕、無連結／已用連結／無效 token 拒絕；專用 Auth／browser origin 清 0 | 正式部署後重跑同等 E2E；由專用信箱驗真實 SMTP 收件及連結導向，確認正式站不再 crash；最小 release 已移除被 @supabase/ssr 覆寫的 detectSessionInUrl:false，QA 隔離庫以真 PKCE code 與調舊 flow state 的過期 code 驗證清除 URL 與拒絕。不得改動真實會員或輸出 token | 已送 X-PM；**隔離功能複驗通過，正式站仍待部署／回歸，驗收 gate 未解除**；不涉商業規則 |
| QA-FS-C16／critical | 原 205 筆時 API 只回 200、漏 5 且總數誤報 200；工程分支 `d639e77` 改 50 筆分頁、伺服器搜尋及全域總數 | QA 獨立 C4 隔離 API 9/9：205 專用會員跨五頁全部找回、最舊 Email 可搜、非法頁碼／搜尋／游標 400；Ego Lite 後台第 5 頁可見最舊會員，搜尋後全域 KPI 不變。另獨立跑工程 1,001 筆規模腳本 11/11，單次 dev 讀取 169／149ms，非負載 p95；Auth/profile/entitlement fixture 清 0。再驗整合後、正式站與壓力／寫入操作 | **隔離 API/UI 複驗通過；正式整合／部署仍追蹤**，已回報 X-PM；不涉商業規則 |
| QA-FS-C17／critical | 原缺陷：已發布規則 PATCH 封存後 DELETE 200，舊報告 `citedTeachings` 引文失去原規則。工程分支 `7cae2cd`＋`20261011210000` retention migration 以 `published_at` 持久標記及鎖列 RPC 阻擋硬刪，未發布草稿才可原子刪除並寫具名 audit | QA 全新獨立 DB／app：保留原腳本 10/10；舊 `rule_id` 仍可查、雙管理員 PATCH／DELETE、會員直呼 RPC 403、audit 故障回滾及正常重試 5/5；並發／回滾另 10 輪各 4/4，專用資料清 0。另須驗發布 v1 後原地改稿 v2 時舊報告能否還原 v1 正文；目前 `version` 會遞增，但無舊版正文快照，`citedTeachings` 只存 `rule_id`。正式整合與 migration 部署後重跑；C18 建立發布 audit 故障仍未修 | **禁止硬刪子項隔離通過；歷史正文追溯未證、正式整合／部署待驗，C17 不結案**；不涉商業規則取捨 |
| QA-FS-C18／critical | 原 C4 隔離庫 audit INSERT 故障仍 POST 200、published 1／audit 0，腳本 4/6。工程候選 `461f213`（含 `20261011220000` migration）把建立、PATCH、內建匯入與 audit 放進同一 DB RPC 交易 | QA 全新獨立 stack／3213 app：原腳本 6/6；新腳本連續兩輪各 7/7，PATCH 發布與內建匯入的 audit 故障皆 HTTP 500 並回滾，正常發布具名 audit 1 筆，匯入 67 筆、重跑冪等且 audit 具名；直接 RPC 403；工程 SQL 故障測試通過，C17 回歸 10/10。專用資料清 0；正式整合、migration／站端待驗 | **X-QA 隔離複驗通過；正式站待驗，C18 不結案**。共用 `ADMIN_KEY` 仍可令 `admin_user_id` 為 null；是否限具名管理員待使用者決策 |
| QA-FS-C19／critical | C4 專用隔離庫／3218 app，具名管理員對 QA 文件三條路由分別注入只匹配自身的 audit INSERT 故障。PATCH `include_in_prompt=true` 仍 HTTP 200、已納入 AI 提示；POST 上傳仍 201、DB／Storage 留文件；DELETE 仍 200、DB／Storage 已消失；三者對應 audit 都 0。原 PATCH 腳本兩輪各 5/7，擴充腳本兩輪各 7/13；無故障 PATCH 200 且具名 audit 1。每輪 trigger／文件／Storage／audit／Auth／profile 清 0。`lib/auth/admin.ts` 通用 helper 忽略 DB insert error，26 個路由呼叫點是待盤點風險，**尚未宣稱其他路由都可重現** | 文件上傳、提示啟用／停用、刪除與具名 audit 必須同一原子結果；audit 故障時 API 不得 2xx，DB／Storage／提示選取維持原狀。重跑腳本 13/13，再驗正常三流程、並發、總字數及其他高風險共用稽核入口；正式部署後回歸 | 已送 X-PM，擴大三路由範圍待補報；無商業規則取捨，正式站未驗 |
| QA-FS-M16／minor | 原超退 200／199 與全退後再送 1 元均回 500；工程 `6e6f4a4` 改錯誤映射 | QA 隔離 API 超退回 400、全退後新鍵回 409、零額外 refund/ledger/audit；正常腳本 20/20，工程整合 6/6；再驗正式 migration／部署 | **隔離複驗通過；正式站待驗**，已回報 X-PM |
| QA-FS-M17／minor | 原四個報告列表路由把 `abc`／SQLi 形狀 `limit` 當 200，三路由超 cap、一後台誤顯空；首修仍放行 100 位數字。補修 `ced1432` QA 隔離複驗：面相會員 8/8、Council 會員 8/8、後台兩路由 16/16，含 100／500 位數字 400；374 筆專用報告及 Auth/profile/權益清 0 | 合法與無參數維持預設及 cap（會員50／20、後台100／200），非法字元、超長／不安全整數 400；三腳本正式部署後重跑並保留 51／21／101／201 筆邊界資料測例 | 已回報 X-PM；**隔離複驗通過**，分支未合併、正式站未驗，ticket 不關 |
| QA-FS-M18／minor | 隔離具名管理員 GET `/api/admin/face-analysis/{id}` 及 POST `/{id}/preview` 對非法 id、SQLi 形狀及 500 字字串共六項均 500；合法詳情、授權、無照片／過期照片 410、拒絕預覽不寫 event 通過。腳本 13/19，專用 Auth/profile/report/event 清 0 | 兩路由入庫前驗 UUID 格式及長度，六非法 id 回 400；合法詳情 200、未知合法 UUID 404、無／過期照片 410；重跑腳本 19/19 | 已送 X-PM 補充範圍派工程1；無商業規則取捨，正式站未驗 |
| QA-FS-M19／minor | C4 隔離 A/B 會員專用面相報告，A 同時 N=5 DELETE 曾 HTTP 200×5 卻寫 `run_deleted` 2 筆；首次刪除後以 route 同款 `deletion_pending=false AND status<>analyzing` 可重新 claim 已 deleted 列，`redact_face_analysis_run` 再執行 HTTP 200。腳本 13/15；PII 抹除、B 越權 404、會員直呼 RPC 403 均通過，Auth/profile/run/event 清 0 | claim 與 RPC 都拒絕已 deleted 列；N=20 併發與稍後重送僅一次有效抹除、一筆 `run_deleted`，其他請求可回 409 或冪等 200；腳本 15/15 並多輪回歸，補有效照片／PDF 清理測試 | 已送 X-PM 排序派工程1；無商業規則取捨，正式站未驗 |
| QA-FS-M20／minor | 本機隔離庫／3214 app，具名會員 bearer 直接打六條面相 run 方法／路由 × 未知 UUID、`bad-id`、`sql'OR'1=1`、500 字 id，兩輪各 15/24。預覽 GET、PDF GET、分析 POST 對三種非法 id **各回 500**（每輪九項）；詳情 GET、報告 DELETE、照片 DELETE 同輸入均 404；未知 UUID 六路由均 404。舊 PDF 專用腳本兩輪各 7/10，正常完成報告 200 PDF、未完成 409、B 越權 404；專用資料清 0。影響三個會員 API 的非法輸入與錯誤監控，未觀察到越權或 SQL 注入成功 | 三路由入庫前一致校驗 UUID；非法／超長 id 回 400 或 404，不回 500、不產生報告／Storage 物件／點數交易；重跑六路由腳本 24/24、PDF 腳本 10/10，並回歸有效預覽、分析與 PDF 的權限／狀態／扣點 | 擴大範圍與證據已送 X-PM 更新既有 ticket 並排序派工。**無商業規則取捨**，正式站未驗 |
| QA-FS-M21／minor | 本機隔離庫／3216 app，具名會員 A 對唯一 `created` run 直接送空 multipart；前五次 HTTP 400 但 `upload_attempts` 由 0 逐次至 5，第六次 429，從未送照片或進品質檢查。匿名 401、B 越權 404、非法／未知 ID 404，均未增加次數；腳本兩輪各 4/10，run 每輪清 0。影響：會員可因無效請求耗盡同一任務五次上傳額度；尚未證明扣點或越權 | 檔案存在、大小與可解析格式驗證應在消耗品質檢查額度前；空表單／缺照片每次 400 且 `upload_attempts` 保持 0；有效圖片才按品質檢查次數計數，五次上限與並發 CAS 維持；重跑腳本 10/10，另驗有效圖品質拒絕／合格、N=2 同 run 併發、Storage／點數無異常 | 已送 X-PM 排序及確認防濫用規則；如產品刻意將無效請求計入額度，需明示規則與 UI 文案；正式站未驗 |
| QA-FS-M1／minor | 隔離 API 實測只有 `phone='@@@'`、無 email 仍回 200 並建立預約；公開入口未見程式內限流，外層 WAF 尚未量測 | 確認可接受電話／LINE 格式及防濫用門檻；非法聯絡方式 400，合法可送，隔離 DB 回歸 | 已交 X-PM 討論規則 |
| QA-FS-M2／minor | `20260809160300_face_knowledge_base.sql` 對面相知識庫兩表撤銷 anon／authenticated 權限，但未啟用 RLS；匿名抽樣原未暴露資料 | 工程1 `92e6ef7` 啟用兩表 RLS。QA 隔離庫直接套 SQL 後 4/4：`relrowsecurity=true`、service role CRUD／revision 寫入與清理、匿名／會員不可讀；正式 migration／後台 API 再複驗 | 隔離環境複驗通過；正式 migration／部署待辦 |
| QA-FS-M3／minor 待規則 | 隔離 API 同一預約表單並發 POST 兩次，HTTP 200/200、DB 建 2 筆；唯一 source 專用資料已清理 | 建議 client requestId 冪等，同 ID 重送只 1 筆、不同 ID 可分別送；也可由 PM 選時間窗去重或允許重複並後台標記；以 N=2 與相異 ID 複驗 | 已交 X-PM 討論商業規則 |
| QA-FS-M4／minor | 舊版有效會員直接 POST `/api/orders/create`，`plan_code` 10,000 字回 500、訊息 `[object Object]`；128／1,024／4,096 字回 404 | 工程1 `1185c12` 設 64 字上限；QA 獨立 production build／隔離 DB 7/7：64 字未知碼 404，65／10,000 字 400，非法輸入訂單增量 0；正式部署後再冒煙 | 隔離環境複驗通過；待遠端部署／正式站回歸 |
| QA-FS-M5／minor 待規則 | 會員同方案／發票資料雙送 200/200、兩張 pending 訂單；課程同 email／課程雙送亦 200/200、1 profile、2 pending 訂單與報名。測試列均已清理 | 建議兩個結帳入口共用 requestId 冪等，同 ID 各只一張、不同 ID 仍可建立；若業務接受多張，須明確 UI／清理規則；N=2 與重送複驗 | 已交 X-PM 討論商業規則 |
| QA-FS-M6／minor | 舊版具名管理員 GET `?limit=-1` 回 500、`limit=abc` 回 200；原隔離 API/DB 5/7 | 工程1 `9a8c33d` 驗證 1–500 整數。QA 於目前 main 獨立 Next clone／隔離庫最新 13/13：-1／abc／0／501 為 400，缺省 100、1／500 為 200，GET 前後 DB 不變，具名管理員列表／詳情／PATCH／audit、會員 403 均正確，測試資料清理 | 隔離環境複驗通過；正式部署／站端回歸待辦，不涉及商業規則 |
| QA-FS-M7／minor | 原缺陷：`limit=-1` 500、`abc`／`0`／`501` 200。修補 `48cd357` 後隔離 API 實測非法值全部 400，合法 1／500 均 200；全腳本 17/17，資料全清理 | 正式部署後重跑非法／合法 limit、未付款名單及稽核，確認 1–500 範圍一致 | **隔離複驗通過；正式站／UI 待驗**，已回報 X-PM；不涉及商業規則 |
| QA-FS-M8／minor | Ego Lite 本機會員登入頁使用 QA 信箱＋錯密碼，API 錯誤透傳成英文 `Invalid login credentials`；中文站其他文案為中文 | 錯密碼與帳號不存在都顯示一致中文訊息，維持 4xx 且不洩漏帳號是否存在；Ego UI 與直接 API 複驗 | 已送 X-PM；不涉及商業規則 |
| QA-FS-M9／minor | Ego Lite 用有效結構、已過期 QA JWT 打開 `/member`：頁面顯示登入過期，仍留 token、FREE／0 點／待啟用及功能入口，無重新登入連結；測後清除測試 token | 過期／失效 token 清除並導登入或顯示明確登入按鈕，不呈現假帳務空狀態；Ego UI 對過期／錯誤／有效 JWT 複驗 | 已送 X-PM；不涉及商業規則 |
| QA-FS-M10／minor | 具名管理員 GET `/api/admin/orders?id=` 後接非 UUID、SQLi 形狀或 10,000 字，三者均 500；合法未知 UUID 404，隔離帳務唯讀腳本 8/11，資料全清理 | 先驗 UUID 格式與長度，非法值 400 或一致 404，不查 DB、不回 500；重跑同腳本 11/11，確認清單與詳情未受影響 | 已送 X-PM；不涉及商業規則 |
| QA-FS-M11／minor | 原缺陷：兩筆報名、`limit=1` 時摘要誤為 1。修補 `48cd357` 後隔離 API summary.total/pendingContact=2/2，DB=2/2；全腳本 17/17，資料清理 | 正式部署後驗 `limit=1`／預設／500 及 contact_status filter，摘要與完整篩選集合一致 | **隔離複驗通過；正式站／UI 待驗**，已回報 X-PM；摘要範圍已由程式註明 |
| QA-FS-M12／minor | 原全下架服務 DB 0／API 靜態 9；工程 `9d3fc9a` 將成功查庫空清單保留為空 | QA 隔離 API 先下架 1 筆 9→8、全下架 DB 0／API 0，腳本 1/1 並還原 9 筆旗標；單元測試含 DB 故障 fallback。再驗案例／課程與正式站 UI | **隔離服務 API 複驗通過；正式站待驗**，已回報 X-PM |
| QA-FS-M13／minor | 原 POST/PATCH 字串 `"false"` 誤上架；工程 `9d3fc9a` 嚴格驗布林 | QA 隔離服務 API 4/4：兩種字串非法輸入 400 零發布、真布林上／下架通過、fixture 清 0；工程單元涵蓋數字／null／object 與 promo.active。再驗正式 CMS UI／其他內容型別 | **隔離服務 API 複驗通過；正式站待驗**，已回報 X-PM |
| QA-FS-M14／minor | 隔離 API 具名管理員同批匯入兩筆相同 `card_id`：HTTP 500，DB 無部分卡片；C6 bulk／import 腳本其餘 14/15 通過並清理 | 重複碼在寫入前或捕捉 DB 專屬錯誤時回 400，卡片／revision／audit 無增量；正常 bulk/import 不退化，腳本 15/15 | 已送 X-PM 排工；非法輸入應 4xx，不涉商業規則 |
| QA-FS-M15／minor 待確認 | 隔離 Ego UI 的 409 後，標題／觀察即時保留且 DB 未覆寫；但提示要求重新載入比對，`app/admin/face-knowledge/page.tsx` 的草稿僅存 `useState`，無持久化或載入新版本的比對操作。刷新流失草稿是程式碼推論，尚未做瀏覽器刷新實測 | 衝突時提供「載入最新版本並保留我的草稿」與欄位差異，或先持久化可恢復草稿，再引導刷新；以兩管理員 v1→v2 衝突、刷新／比對／重新送出 E2E 複驗，DB 最終 v3 且文字不流失 | 待 X-PM 討論 UX 優先序；不涉商業規則 |

另有待驗限制：Supabase Auth custom SMTP 未接；奇門老師未簽核且晚子時規則待確認；Council 備援真實失敗、AI 提示遵循與瀏覽器斷線找回未實測；後台字級及手機版未看實際畫面。這些不應被「build 通過」取代。

## 測試總結

- **BLOCKER：**QA-FS-B1（AI 問答並發免費回覆）候選 4162ce7 完整 49 migration 隔離 DB/API 無模型路徑通過，真正模型回覆與正式站待驗；QA-FS-B2（啟用碼並發重複發點）隔離複驗通過但正式站未部署；QA-FS-B3（一般會員角色持已知 UUID 可透過舊 Chat／Council RPC 扣其他會員點數）原缺陷隔離 DB 已重現，hotfix efc57dc 在全新 stack API A/B 兩輪各 5/5 通過，待正式部署與站端回歸。
- **Critical：**QA-FS-C1 發票退款一致性待營運規則確認；QA-FS-C2 管理員補扣點帳本不一致；QA-FS-C3 10/07 刷卡回報與本站帳務資料無法對應；QA-FS-C4 隔離庫 20 輪通過、正式 migration／站端未驗；QA-FS-C5 停用推廣人歸因待商業決策；QA-FS-C6 單／雙管理員 N=10 隔離庫各 11 輪及 UI 409 即時保留通過，正式站未驗；QA-FS-C7 推廣人建立／並發改率 audit 隔離庫 11 輪通過、正式站未驗；QA-FS-C8 route 單元與隔離 paid 訂單非法輸入 API 各 7/7 通過、合法 ezPay／正式站未驗；QA-FS-C9 migration 因已付款 webhook 風險回退，現行 HEAD 不合格且待商業規則／補救決策；QA-FS-C10 拆分退款隔離 DB/API 核心複驗通過、正式站未驗；QA-FS-C11 隔離排程複驗 13/13，正式部署觸發待驗；QA-FS-C12 隔離 API/UI 登出複驗通過、正式站未驗；QA-FS-C13 同鍵重送／並發及後台斷線重送、C14 audit 故障回滾隔離複驗通過，正式 migration／站端待驗；QA-FS-C15 最小 release 5631c7f 的 hash 兩輪各 11/11、真 PKCE code／過期／重用隔離 Ego 通過，正式站舊版仍崩潰，待部署／真實收信／站端回歸（驗收 BLOCKER）；QA-FS-C16 分頁／搜尋修復分支隔離 API 9/9、UI 通過，正式整合／部署待驗；QA-FS-C17 禁止硬刪隔離 10/10、並發／回滾 5/5 且 10 輪通過；舊版正文追溯未證、正式 migration／站端待驗；QA-FS-C18 工程候選 461f213 原子稽核 X-QA 獨立 stack 原腳本 6/6、新腳本兩輪各 7/7、C17 回歸 10/10，正式整合／部署及具名操作決策待辦。跨會員越權測試仍未涵蓋所有表與 RPC，暫不宣告全系統通過。
- **Minor：**QA-FS-M1 預約無效電話已實測、限流待判定；QA-FS-M2 面相知識庫 RLS 本機 SQL 複驗通過，待正式 migration；QA-FS-M3 預約雙送產生兩筆；QA-FS-M4 超長方案碼本地修補及隔離複驗通過，待正式站；QA-FS-M5 雙送建兩張 pending 訂單；QA-FS-M6 後台預約列表 limit 最新獨立 API 複驗 13/13，待正式站；QA-FS-M7/M11 課程列表 limit 與摘要修補後隔離複驗 17/17，待正式站／UI；QA-FS-M8/M9 會員登入訊息與過期 token UI 待修；QA-FS-M10 後台非法訂單 id 8/11；QA-FS-M12/M13 CMS 修補後隔離服務 API 通過，正式站待驗；QA-FS-M14 面相知識庫重複卡片匯入回 500；QA-FS-M15 衝突刷新比對可能流失草稿待確認；QA-FS-M16 退款錯誤碼隔離複驗通過、正式站待驗；QA-FS-M17 四路由非法 limit 補修分支隔離複驗 8/8、8/8、16/16，正式待驗；QA-FS-M18 管理員面相詳情／預覽非法 id 六項回 500，待修；QA-FS-M19 會員面相刪除 stale claim／RPC 可重入，待修；QA-FS-M20 會員預覽／PDF／分析三路由非法／SQLi 形狀／超長 id 各回 500，待修；QA-FS-M21 空上傳耗盡五次品質檢查額度，待規則確認與修補。M3/M5 待去重規則決策。
- **已驗收通過的範圍：**本機建置、TypeScript、589 個通過的單元案例（另有 2 個 expected fail）、21 項安全 API 冒煙、219 個後台匿名／無效 bearer／有效會員拒絕、5 個正式站 cron GET 匿名拒絕、11 張表匿名讀取抽樣、隔離庫 A/B 核心會員、訂單、發票、課程報名、使用量、面相報告與 Council 歷史跨會員讀取、會員訂單／使用量 API 11/11、直接寫入封鎖及過期 JWT、B2 原子兌碼隔離複驗、C4 clean DB 四情境 20 輪回歸、C6 同卡 N=10 單／雙管理員各 11 輪、C7 並發改率 audit 11 輪、C8 route 單元與隔離 paid 訂單非法輸入 API 各 7/7、M4 超長方案碼及內部方案 code／ID 隔離 9/9、預約邊界 7/7、具名管理員預約最新 13/13、建立啟用碼 13/13、課程跟進正常流程 10/10、課程結帳 8/8、註冊／同手機試用／refresh／忘密回應 9/9，以及正式站 8 頁手機寬無水平溢出與預約空表單提示；Council 先前正式站的並行／schema／日限額有交接證據。
- **整體結論：**全系統 UAT 尚未完成，正式驗收不可簽核。下一批優先驗證會員／金流／RLS 的隔離環境端到端流程，並複驗 X-PM 回傳的修復。

## 2026-10-11 補記：M18／M19／M20 隔離候選複驗

本節是上方 M18／M19／M20「待修」紀錄的較新結果；候選尚未合併、部署或正式站驗收。M18／M20 候選 `/private/tmp/xunfeng-m18-m20` HEAD `2f672f0`，使用本機 QA Supabase 與候選 Next dev `127.0.0.1:3215`；M19 候選 `/private/tmp/xunfeng-m19` HEAD `5f863e5`，在 C4 隔離 Supabase 與候選 Next dev `127.0.0.1:3216` 測試。兩者基底皆為 `origin/main 1935618`。

| 項目 | 隔離複驗與證據 | 剩餘風險 |
|---|---|---|
| M18 管理員詳情／預覽 | 原腳本 19/19；加入實際私有照片後 21/21。非法／SQLi 形狀／500 字 ID 均 400，合法未知 UUID 404；匿名 401、會員 403；具名管理員可讀詳情與取得有效簽名預覽，無圖／過期 410；會員本人有效預覽 200，相關 fixture、Storage、audit 已清。 | 候選未合併／部署；有效預覽由本機 Storage 驗證。 |
| M20 會員預覽／PDF／分析 ID | 六路由矩陣 24/24；本次三路由的三種非法 ID 嚴格要求 400，未知合法 UUID 404。PDF 原流程 10/10，加入完成報告 analyze 冪等重送後 11/11；本人 PDF 位元組與重取一致、他人 404、未完成 409。另用 `qa-face-analyze-invalid-side-effects-local.mjs` 驗 4/4：三種非法 ID 400，會員的 run／event／usage／credit 數量、權益餘額、Storage 物件前後快照相同。 | 未呼叫有效照片的 Vision／LLM 新分析及實際扣點；正式站待驗。 |
| M19 刪除一次性 | 原刪除腳本最初 14/15：測試自身的 stale-claim SQL 漏掉候選路由已有的 `status != deleted`，已修正測試。A/B 所有權、匿名 401、會員直呼 RPC 403、N=20 併發各輪 15/15（3 輪），事件各僅 1；再建立真正的私有照片與 PDF，16/16，兩物件均刪除、PII 抹除、後續重送 200 且無第二事件。Auth／profile／run／event／Storage fixture 均清除。 | C4 僅暫時直接套候選 SQL，測後原函式已還原、migration history 仍 0；正式 migration／部署後須重跑。 |

以上三項沒有新的產品缺陷 ticket，亦不涉及商業規則取捨。M18／M19／M20 的候選隔離複驗可標為通過；舊版正式站的缺陷仍開票至整合與部署完成。

### M20 有效新分析：受控 Vision／報告替身與真實隔離帳務

- 候選 `/private/tmp/xunfeng-m18-m20` HEAD `2f672f0`。將 QA 專用 `app/api/face-analysis/runs/[id]/route.m20.qa.test.ts` 複製到候選 worktree，在主 QA 隔離 Supabase 執行；`QA_FACE_M20_E2E=true` 才啟用，普通 unit suite 會略過。執行時明確清除 `OPENAI_API_KEY`、`GEMINI_API_KEY`，Vitest 替身攔住 `runFaceVisionProvider` 和 `generateFaceReport`；Auth、Storage、route、規則層、usage 寫入與 `commit_face_analysis_credit` RPC 均走真實隔離服務。測後已移除候選 worktree 的暫存測試檔，分支保持乾淨。
- **11/11 通過**：B 分析 A 的 uploaded run 回 404；A 有效新 run 分析 200 且回報扣 20；報告文字／JSON 持久化、usage 1 筆連到 run、debit ledger 1 筆 `-20`／`balance_after=20`、權益餘額 40→20；完成 run 重送 200，usage／ledger／餘額不變；另一新 run 的撰稿替身拋錯回 5xx，run 轉 failed、無報告、無新增 usage／ledger／扣點，B 對該 failed run 仍 404。每輪專用 Auth、profiles、runs、events、usage、ledger、entitlement、Storage 皆刪除並查無殘留。隔離測試重跑兩次通過，候選 `tsc --noEmit` 通過。
- **驗證邊界**：此測試證明新分析 route 與隔離帳務結算，不證明真實 Vision／LLM 輸出的正確性、完整報告 schema 或正式站效能。既有 provider/schema 單元與真模型 E2E 是不同證據；正式站與真實付費模型均未呼叫。使用方式：在候選 worktree 複製此 QA 測試檔，僅載入本機 QA Supabase 的 `API_URL`／`ANON_KEY`／`SERVICE_ROLE_KEY`，映射到對應 `NEXT_PUBLIC_*` 與 `SUPABASE_SERVICE_ROLE_KEY`，設定 `FACE_ANALYSIS_ENABLED=true QA_FACE_M20_E2E=true`，移除模型金鑰，再執行 `vitest run 'app/api/face-analysis/runs/[id]/route.m20.qa.test.ts' --disableConsoleIntercept --reporter=verbose`；禁止對正式 DB 執行。

## 2026-10-11 補記：C19 老師文件原子稽核候選獨立複驗

候選 `/private/tmp/xunfeng-c19` HEAD `a3c8507`（基底 `origin/main 1935618`，未部署）。在 C4 隔離 Supabase 直接暫套 `20261012010000_ai_documents_atomic_audit.sql`，以候選 Next dev `127.0.0.1:3217` 驗證；測後三個新 RPC 已移除，C4 migration history 原本與最後均為 0。**此節取代上方 C19「7/13、待修」的舊候選狀態；正式站票仍開啟。**

| 測試面 | 結果與證據 | 驗證邊界 |
|---|---|---|
| 三路由 audit 故障與正常流程 | 原 `qa-admin-document-audit-local.mjs` **13/13**；擴充後 **19/19**。POST／PATCH／DELETE 在 scoped audit INSERT 故障時回 500，文件列、提示選取、audit 與 Storage 各保持應有原狀；正常 PATCH 有具名 audit，正常 POST 201 建一列及 Storage 物件／audit，正常 DELETE 200 刪列及物件並留下 audit。故障上傳及完整生命週期後，專用 Storage 孤兒檔計數均 0。 | Storage 與 Postgres 無共同交易；若 Storage 刪除本身故障，候選回 503 並保留可盤點 audit 路徑，需營運補清。 |
| SQL 權限與原子性 | 候選 `supabase/tests/ai_documents_atomic_audit.sql` 在 C4 隔離庫完整執行並 rollback：三 RPC 為 `SECURITY INVOKER`，anon／authenticated 無 EXECUTE，service_role 可執行；故障回滾與正常 create→update→delete 稽核均通過。 | 正式 migration／權限尚未套用。 |
| 總字數並發 | QA 自有 `qa-admin-document-budget-concurrency-local.sh` 使用專用 UUID，在 C4 隔離庫同時啟用兩份各 80,000 字、可用預算 150,000 字：**1/1**，僅一份成功、一筆 audit，總字數未超額；文件與 audit fixture 查無殘留。 | 這是 DB RPC 並發驗證；沒有經過瀏覽器 UI。 |
| 程式回歸 | 候選 `route.c19.test.ts` **7/7**、`tsc --noEmit` 通過；SQL 專用 fixture、Auth/profile、Storage 與故障 trigger 查無殘留，候選工作樹未改動。 | 其他共用 `writeAdminAudit` 呼叫入口不屬本次三路由修補，仍待盤點。 |

**測試總結：**本次 C19 候選沒有新 BLOCKER／critical／minor 缺陷；三路由隔離複驗通過。原 C19 critical 票保留至整合、正式 migration、部署及站端回歸完成。Storage 清理失敗的運維程序與其他共用 audit 入口列為剩餘風險，不當作已驗收通過。

### C19 整合閘門：migration 版號衝突（後續唯讀核對）

X-PM 發現上述舊候選 `a3c8507` 的 `20261012010000_ai_documents_atomic_audit.sql` 與 M19 `20261012010000_face_analysis_delete_once.sql` 使用同一版號。工程1更新 C19 至 `8675390c749418585ad562042326e8710909b405`，補上「只有 PATCH 明確帶 `include_in_prompt=true` 才重查字數預算」的相容性條件；QA 唯讀核對後，**新版仍保留衝突的 `20261012010000` 版號**。因此上方 13/13／19/19 僅代表舊候選在單獨暫套 SQL 的 API 行為，不代表 M19+C19 可一起 migration replay、整合或部署。此版號衝突為整合 BLOCKER，已通知 X-PM／工程1；未對新版套 migration 或宣告通過。

QA 已在自有 `qa-admin-document-audit-local.mjs` 準備三項待跑案例：用專用已啟用文件模擬既有總字數超預算，驗「只改標題」仍 200 並有具名 audit；明確再次啟用仍 400 且無額外 audit。待 C19 換成唯一 migration 版號、工程完成 M19+C19 乾淨 replay 後，以新 SHA 重跑原 13 項、擴充正常流程／Storage 與這三項相容性案例，再核對並發和 fixture 清理。此段案例尚未執行，不列為通過。

### C19 新版號與相容性修正：最新獨立複驗

工程候選已更新至 `/private/tmp/xunfeng-c19` HEAD `78dff9c0d836d5b6b3f373bbdc6445c39a2d479f`；C19 migration 改為 `20261012020000_ai_documents_atomic_audit.sql`，M19 仍為 `20261012010000_face_analysis_delete_once.sql`，檔名版號不再衝突。工程1回報其獨立 stack 做 origin/main 47 版＋M19＋C19 共 49 migrations 乾淨重播；**QA 沒有重置該 stack**，改在 C4 隔離庫依序暫套兩個 SQL，完成複驗後移除 C19 三 RPC、還原 M19 原函式，兩版 migration history 前後皆 0。

| 項目 | QA 獨立結果 |
|---|---|
| 候選 HTTP／Storage | `qa-admin-document-audit-local.mjs` **22/22**：原三路由 audit 故障原子性、正常 POST／PATCH／DELETE、故障與正常生命週期後 Storage 孤兒檔為 0；新增已啟用但超預算的舊文件只改標題 200 且具名 audit，明確重新啟用 400 且 audit 不增加。 |
| 兩 migration 相容 | M19 SQL 後接 C19 SQL 均成功；C19 `ai_documents_atomic_audit.sql` 與 M19 `face_analysis_delete_once.sql` 專用 SQL 測試均在交易內通過並 rollback。QA 並未獨立執行 49 版乾淨 reset。 |
| 字數並發 | QA 自有 `qa-admin-document-budget-concurrency-local.sh` **1/1**：兩份各 80,000 字同時啟用、預算餘額 150,000 字，只一份成功、另一份被拒且僅一筆 audit；專用文件／audit 清 0。 |
| 程式與清理 | 候選 `route.c19.test.ts` **7/7**、`tsc --noEmit`、`git diff --check` 通過；C4 專用 Auth/profile/document/trigger/Storage 查 0，候選分支乾淨。 |

**最新測試總結：**先前 migration 版號衝突的整合 BLOCKER 已在候選檔案層解除，C19 新候選隔離複驗通過；正式 migration／站端回歸與其他共用 audit helper 入口仍待驗，C19 critical 票暫不關閉。DELETE 的 Storage 清理失敗會回 503 並留待盤點物件，須有營運補清程序；本輪無新增產品缺陷。

**Storage 故障狀態碼核對：**候選 `78dff9c` 的 POST 在 RPC audit 失敗後，若暫存檔補償刪除也失敗，回 **HTTP 500**；工程 route unit 有此案例與斷言。POST 外層 catch 的另一條補償刪除失敗路徑亦由程式碼核對為 **500**，本輪未另做故障注入。DELETE 已先完成 DB／audit，但 Storage 刪除失敗時回 **HTTP 503**，工程 route unit 有斷言。C4 HTTP 腳本測的是 audit 故障、補償成功及正常 Storage 刪除，沒有把 Storage 服務本身故障宣告為實際 HTTP 通過。相應孤兒檔需依 audit 路徑盤點並補清。

### C19 Storage 自身故障：隔離 route／Storage stub 注入

X-PM 指定的窄範圍驗證已在候選 `78dff9c` 的真實路由函式上執行，使用 QA 專用 `scripts/qa-c19-storage-fault.test.ts` 及 `scripts/qa-c19-storage-fault.vitest.mts`。命令：`npx vitest run --config scripts/qa-c19-storage-fault.vitest.mts`。測試把 Auth、RPC、Storage 換成具狀態的隔離替身；不連共用 C4 Storage、正式服務或付費模型。候選工作樹只暫放 QA 腳本以執行，工程提交未改動。

| 案例 | 注入及觀察 | 結果 |
|---|---|---|
| POST 外層 catch 補償失敗 | upload 成功後讓 create RPC **拋出例外**，Storage `remove` 回錯；路由回 500，錯誤訊息指出暫存檔清理失敗，log 含上傳 path 與 Storage 錯誤名；替身文件列／audit 均 0，孤兒掃描可列出唯一 path。 | 通過，測後人工清掉替身物件，fixture 0。 |
| DELETE Storage remove 失敗 | 替身 RPC 先刪文件列並寫一筆具 path 的 audit，再讓 Storage `remove` 回錯；路由回 503，log 可盤點 path、物件仍在；同 ID 重送回 404，audit 仍只有一筆，沒有再次呼叫 Storage。 | 通過，測後人工清掉替身物件／audit，fixture 0。 |

兩個 QA 案例 **2/2**，與工程既有 route unit 合跑 **9/9**，候選 `tsc --noEmit` 通過。此證據驗證路由在可控 Storage 故障下的分支與回應；DB 提交／audit 持久化和真實 Storage 孤兒盤點由替身模擬，**不等於真實 HTTP＋DB／Storage 故障注入通過**。既有 POST RPC-error 補償分支僅引用工程 unit 覆蓋，沒有宣稱 HTTP 實測。上節未做故障注入的敘述僅指先前 C4 HTTP 批次；本節補的是隔離 route 測試。正式部署、跨服務故障演練與孤兒補清程序仍是 C19 驗收風險。

### M21 空照片上傳額度：候選獨立回歸

工程候選 `/private/tmp/xunfeng-m21` HEAD `e821bd539fac1340bcebd9d0494ea4f5db1fa2d6`，未推送／部署。QA 用候選 Next dev `127.0.0.1:3219`、C4 本機隔離 Supabase 與新建兩個臨時 A/B 帳號驗證。C4 已有 `upload_claim_token`／`upload_claimed_at` 欄位及配對 constraint，但 `20261012030000` **沒有登記於 migration history**；本批只驗候選路由對現有隔離 schema 的行為，不宣稱 QA 完成乾淨 migration replay。沒有套正式庫。品質服務是回傳可控 face geometry 的本機 HTTP stub；合成 PNG 經真實 Sharp 解碼／正規化，DB、Storage、Auth、route 皆使用隔離服務，未呼叫付費模型。

| 面向 | 獨立結果 |
|---|---|
| 空上傳與權限 | 既有 `qa-face-upload-empty-local.mjs` **10/10**：匿名 401、B 傳 A 任務 404、非法／未知 ID 404，連送六次空表單皆 400 且 `upload_attempts=0`、status `created`；品質服務呼叫 0。 |
| 有效圖片與帳務 | 新 `qa-face-upload-m21-local.mjs` 用同一 A 任務先回品質拒絕，再回合格：前者 `quality_rejected`／attempt 1／Storage 0，後者 `uploaded`／attempt 2／Storage 1／claim 釋放；各一筆相應 event，B 越權 404；權益、ledger、usage 前後一致。 |
| 同任務並發 | N=2 **10/10 輪**：每輪新 run，一個 200、一個 409；只一個 quality provider 呼叫、attempt 1、Storage 物件 1、event 1、claim 釋放，點數無變。補充腳本總計 **19/19**。 |
| 回歸與清理 | 工程候選 route unit **6/6**、`tsc --noEmit` 通過。補充腳本連續三次完整成功（前一次 Auth 建帳暫時失敗，未產生 fixture；重跑後成功）。最後逐 run 核對 events／資料列／Storage 0，兩個 Auth/profile 與帳務 fixture 0；DB 額外查詢 `qa-m21-%@example.test` Auth/profile 均 0；3219 已停止。 |

**測試總結：**M21 原 4/10 缺陷在此候選隔離 HTTP 複驗已修至 10/10，圖片品質與 CAS 帳務也通過；原票可標記「隔離複驗通過、待整合／migration 乾淨重播／正式站驗收」。合成圖片配本機品質 stub 不證明真實人臉服務的判讀品質；正式站與付費提供者未測。QA 腳本用法：先以候選程式啟動本機 app，設定 `FACE_ANALYSIS_ENABLED=true`、本機 `FACE_QUALITY_PROVIDER_URL=http://127.0.0.1:3297`，清空付費模型金鑰，再執行 `node scripts/qa-face-upload-m21-local.mjs --base-url=http://127.0.0.1:<port> --env-file=<local-private-env> --provider-port=3297`。腳本自行建／刪隔離帳號與資料，拒絕非本機 Supabase URL。

### M21 lease 回收與 QA-FS-M22 event 故障：追加獨立驗收

X-PM 追加指定 stale 2 分鐘 lease 與獨立 event 故障。QA 延伸同一腳本，以候選 `e821bd5`、全新 A/B/run、C4 隔離 DB／Storage、3219 候選路由與本機品質 stub 再跑。工程1另回報其獨立臨時 stack 已由 origin/main 乾淨重播 50 migrations，含 M19 `12010000`→C19 `12020000`→M21 `12030000`；QA **未獨立重置該 stack**，C4 的 M21 migration history 仍為 0，正式整合 gate 保留。

| 測項 | 步驟、預期與實際 | 結果 |
|---|---|---|
| stale lease 舊 token | 暫停第一個有效圖請求於本機品質 provider，讀取 claim token，將該 run 的 `upload_claimed_at` 回撥 3 分鐘；第二請求回收 lease、200 完成 `uploaded`、attempt 2、Storage 1、event 1。釋放第一請求後舊 token 回 500，無法覆寫新結果；帳務不變。 | **4/4 通過**；這是時間欄位故障注入，未真的等待 2 分鐘。 |
| QA-FS-M22 event INSERT 故障 | 只對新專用 run ID 建 scoped `BEFORE INSERT` trigger，令 `face_analysis_events` 寫入拋錯；有效合成圖品質通過、Storage 上傳成功後呼叫路由。**預期**：失敗後 `storage_path` 不指向已刪物件；**實際**：HTTP 500、run `status=uploaded`、`storage_path` 非空、Storage 0、event 0、attempt 1。補償刪除物件已發生，但 DB row 更新獨立提交，會員後續可能無法預覽／分析。 | **1 項失敗，critical，新票，非 M21 空上傳修補造成。**無扣點；故障 trigger、函式、run/events/Storage/Auth/profile/帳務清 0。 |

最新腳本結果為 **24/25**，唯一失敗項是 QA-FS-M22；因此腳本以非零狀態結束，不能把 25 個測項宣稱全通過。原 M21 空上傳 **10/10**、有效圖／N=2×10／stale lease 回收均通過，仍待正式整合與部署。QA-FS-M22 派工 ticket：**嚴重度 critical**；影響為 `uploaded` 任務記錄指向不存在照片，可能使預覽、分析與續作失敗。驗收標準是 event 寫入故障時，DB 任務不得留下失效 `storage_path`，或系統須保留可復原物件與一致事件；正常品質拒絕／合格、CAS 與重送仍須通過。複驗方式：在專用 run 上重跑腳本 scoped trigger 案例，檢查回應、DB row/event、Storage 與清理；不使用正式資料。此票已送 X-PM 排序，待工程1獲派修復。

### M18／M20／M19／C19／M21 整合候選 production build 回歸

整合分支 `/private/tmp/xunfeng-face-release-m21` HEAD `b04b08e33e5d10533937d920f29446b965ad9e2f`，基底 `origin/main 1935618`，精選六個工程提交；QA 確認分支工作樹乾淨。候選 production build 在 `127.0.0.1:3231`，連 C4 本機隔離 API。QA 用自有腳本直接打 3231；腳本只建專用 fixture，使用工程保留的 repo 外 local-only A/B 憑證檔時沒有輸出或修改內容。未觸碰正式庫或付費模型。

| Slice | 整合端點代表案例 | 結果 |
|---|---|---|
| M18 | `qa-admin-face-detail-local.mjs`：具名管理員詳情／預覽、匿名／會員拒絕、壞 ID／SQLi／超長 ID、未知 UUID、無照片／過期 410、有效私有預覽、隱藏 Storage path。 | **21/21** |
| M20 | `qa-face-run-id-routes-local.mjs` 六路由 ID 矩陣；`qa-face-pdf-local.mjs` A/B、PDF 位元組與重取、完成分析重送；`qa-face-analyze-invalid-side-effects-local.mjs` 直接非法 analyze 與 DB／Storage／點數零副作用。 | **24/24＋11/11＋4/4** |
| M19 | `qa-face-delete-local.mjs`：A/B、會員直呼 RPC 拒絕、同 run DELETE N=20、PII redaction、一次事件、照片與 PDF 刪除、重送及已刪 claim 防重入。 | **16/16** |
| C19 | `qa-admin-document-audit-local.mjs`：三路由 audit 故障原子性、正常文件與 Storage 生命週期、超預算舊文件 title-only 相容；字數預算 DB 並發腳本。 | **22/22＋1/1** |
| M21 | `qa-face-upload-empty-local.mjs`：A/B、非法／未知 ID、六次空 multipart 均 400 且 attempt 0。 | **10/10** |

合計 **108/108 個整合端點代表檢查通過**，另 C19 DB 並發 **1/1**。整合候選 M21＋C19 route unit **13/13**、`tsc --noEmit`、`git diff --check` 通過。各腳本回報 run／event／Storage／audit／Auth／profile 清理；QA 額外查 `qa-face-detail-*`、`qa-face-delete-*`、`qa-document-audit-*`、`qa-m21-*` 的 Auth/profile、故障 trigger、文件皆 **0**。工程另回報獨立 DB 從 origin/main 乾淨 replay **50/50** 且最後 M19→C19→M21 migration 依序存在；QA **沒有獨立重播**，C4 migration history 仍為 0，不能用這批 HTTP 結果代替正式 migration gate。

**測試總結：**整合候選五個 slice 的代表 API 回歸通過，沒有新 BLOCKER；既有 **critical QA-FS-M22**（event INSERT 故障使 `uploaded` row 指向已刪 Storage）仍開票，這批 3231 代表腳本未重新故障注入，不把它列為通過。正式站、完整 UI、真品質提供者與 M20 有效新分析主流程在這個 production build 尚未重跑；先前各分支隔離證據仍有效，但不替代整合驗收。

**整合 production build 有效圖片補驗：**工程通知 3231 已連本機品質 stub `127.0.0.1:3222`，QA 唯讀檢查 stub 程式與監聽程序後，用自有 `qa-face-upload-integrated-local.mjs`、專用新 run、合成 PNG 直打 3231：品質合格 **5/5**（A/B 404、HTTP 200 uploaded、DB path 與私有 Storage 物件相符、event 1、claim 釋放、權益／ledger／usage 不變）。因 3222 的首筆拒絕計數已用過，QA 又以**同一份 `b04b08e` production build** 在獨立 3232 埠連自有 first-reject-then-pass 的 `qa-face-quality-stub-local.mjs`，同一新 run 首次 `quality_rejected` 無物件、第二次 `uploaded` 有一物件，事件數對應 attempt，**7/7**。兩批各自清除 run/event/Storage；QA 的 3232 與 stub 已停止，沒有對工程的 3231 執行停機。收尾時 3231 已無法連線，可能由工程端另行停止，這不影響測試時的 HTTP 證據。合計再補 **12/12** 有效合成圖端點檢查；品質幾何由 stub 控制，仍不代表真實人臉服務判讀。QA-FS-M22 的 event INSERT 故障在這兩批未注入，保持 critical 開票。

### QA-FS-M22 原子化上傳結果候選：獨立複驗

工程修復候選 `/private/tmp/xunfeng-face-release-m22` HEAD `15631e766bfe175ef3275d6121efe829ff13470b`，基於整合版 `b04b08e`，新增 `20261012040000_face_upload_result_atomic.sql`，以單一 `SECURITY INVOKER` RPC 提交 run 結果與 event。C4 隔離 DB 已暫套 SQL，但 M22 migration history **0**；QA 沒有在全新 stack 獨立 replay 51 版。候選 production build 在工程保留的 3233；為可控品質故障，QA 另以**同一份 build** 在自有 3234 埠連本機 stub，僅用合成 PNG 與全新臨時帳號／run，未碰正式 DB 或真實模型。

| 驗收面 | QA 獨立結果 |
|---|---|
| M22 故障主案 | `qa-face-upload-m21-local.mjs` 對專用 run 安裝 scoped `face_analysis_events` INSERT 故障：HTTP 500 後 DB `status=created`、`storage_path=null`、Storage 0、event 0、點數不變；移除故障後**同 run 重送 200**，DB `uploaded`、attempt 2、Storage 1、event 1、claim 釋放。先前 `uploaded` 指向已刪物件的 critical 症狀已在隔離候選消失。 |
| RPC ACL／M21 回歸 | anon／會員 bearer 直呼新 RPC 均拒絕；空上傳原腳本 **10/10**，有效圖拒絕→合格、A/B、N=2×10 輪、3 分鐘 stale lease 回收與舊 token 不覆寫均通過。完整 QA 腳本 **29/29**，exit 0。 |
| 整合代表案例 | 工程保留的 3233：M18 **21/21**，M20 ID **24/24**＋PDF **11/11**＋非法 analyze 零副作用 **4/4**，M19 **16/16**，C19 **22/22**＋DB 字數並發 **1/1**，M21 空上傳 **10/10**；端點合計 **108/108**。 |
| SQL／單元與清理 | 候選 `supabase/tests/face_upload_result_atomic.sql` 在 C4 隔離 DB 交易內 **BEGIN→故障回滾與 retry→ROLLBACK** 成功，驗 anon/authenticated 無 EXECUTE、service_role 有權；M21＋C19 route unit **14/14**、`tsc --noEmit`、diff check 通過。QA 專用 Auth/profile/trigger/function/document 額外查 0，各腳本 run/event/Storage/帳務清 0；候選 worktree 乾淨。自有 3234 已停止，工程 3233 測後仍 HTTP 200。 |

**測試總結：**QA-FS-M22 可標記「critical 隔離複驗通過、待整合／51 版乾淨 migration replay／正式站回歸」，不得直接關閉正式驗收票。此批沒有新 BLOCKER 或 minor 缺陷。真實人臉品質服務、完整 UI 與正式 DB／部署均未驗；工程的 C4 migration history 未登錄 M22，不能用 3233 HTTP 通過取代部署 gate。QA 建議先完成乾淨 migration replay 與正式整合審核，再安排安全的站端回歸。

### 面相圖片保存期限排程：隔離路由補驗

QA 新增 `scripts/qa-face-image-cron.test.ts`，以路由實際 `GET`／`POST` 配合 in-memory DB／Storage 替身驗證 **7/7**：未設密鑰 500、缺／錯密鑰 401 且不開 DB；空候選 0；過期圖片精確刪除並清 DB path、未到期圖片保留、重跑不重記 event；Storage remove 故障時保留原 DB path 並記失敗 event；DB 更新故障時 Storage 已刪但 DB path 暫時懸空、回 200 並報該筆 failed，替身在故障解除後重跑可清 path 並各留下失敗／成功 event；101 筆過期圖片按 100＋1 分兩批清完。重跑：`npx vitest run --config scripts/qa-face-image-cron.vitest.mts`，`npx tsc --noEmit` 通過。這是**路由與替身證據**，未連真 Supabase Storage，故「不存在物件重刪仍成功」只是假設，不能宣稱真環境可自癒；未觀察正式 scheduler，也未測與上傳／刪除並發。M23 的無 DB 引用孤兒檔不在此排程查詢範圍。fixture 僅存在測試記憶體，結束清 0；UAT 該項仍未勾選。

依 X-PM 要求嘗試在 QA 自有 `/private/tmp/xunfeng-qa-face-cron-20261011` 專用 stack 驗真 Storage：乾淨 DB 套完當前 **56 migrations** 並 seed；Auth／REST 曾回 200，但 Storage API 回 502，Storage 容器 log 顯示 Started Successfully 後仍持續 `health: starting`，health probe 對容器內 `127.0.0.1:5000` 連線被拒。改為包含 `imgproxy` 的標準依賴仍相同。沒有建立 Auth／run／照片 fixture，也未安裝故障 trigger或呼叫 cron；兩次 stack 均已停止並清除，容器與測試埠查 0。故真 Storage 對不存在 key 的 remove 回應、DB path 是否能清零、HTTP／failed 計數是否符合契約仍**未驗證**，不能由替身結果推論；目前無足夠證據開產品缺陷，這是環境阻擋的驗收缺口。M23 孤兒檔仍另案。

### B1／B3 整合候選：獨立完整 HTTP 假模型複驗

候選 `/private/tmp/xunfeng-b3-b1-release` 固定 SHA `d5758bb`。QA 專用 `/private/tmp/xunfeng-qa-b1-stack` 使用候選 49 份 migration 乾淨重播，history count/distinct `49/49`、最後 `20261012000000`；DB／Auth／REST／Kong 在專用 58921／58922 埠健康，App 用同一候選重建 production build 於 3215，`/api/plans`、Auth health、REST 預檢各 200。首次啟動因不必要的 Storage health check 失敗，CLI 已停止該輪；改為只啟動必要服務後重播成功。沒有共用 C4 或正式資源。

| 案例 | QA 實際結果 |
|---|---|
| B1 假模型真 HTTP N=10×3 輪 | `scripts/qa-chat-concurrent-http-local.mjs` **3/3**：每輪 1 筆 200 回「測試回覆」、9 筆 `CHAT_IN_PROGRESS` 409；模型呼叫、usage、`ai_chat` ledger 各 1，餘額 3→2、租約 0。其後順序再送 200、餘額 2→1、usage／ledger 各累計 2。每輪新建 Auth/profile／權益，均在 finally 清理。 |
| B3 直接 RPC 越權 | 同一整合候選專用 stack，`scripts/qa-credit-rpc-isolated-local.mjs` **5/5**：匿名直呼 Chat／Council 舊 RPC 各 401／42501；A 持有效 token 指向 B 真 UUID 各 403／42501，B 5 點／ledger 0；service_role 兩 RPC 各 200，B 5→4→3，兩筆 ledger 對上。 |
| 收尾核對 | SQL 計數：QA Auth、profile、chat slot、`ai_chat`／`ai_council` ledger、chat usage 均 0；App 與本機假模型無真實提供者費用。 |

**證據邊界與測試總結：**B1 的「真 HTTP、假模型」並發交付在整合候選隔離環境已補足，不再列為未測；真付費模型可靠性與正文品質仍未驗。B3 整合候選的 A/B 直接 RPC 權限已動態複驗，不代表正式庫已撤權。當前 main 的 `route.qa.test.ts` 兩個 expected fail 仍在，候選未合併／正式站未部署；B1、B3 均保持 BLOCKER 直到 Tech Lead 整合、正式遷移與站端回歸。QA 專用 app 與 stack 已停止，`3215`／`3291`／`58921`／`58922` listener 與專用容器均查 0。

### QA-FS-M24：會員照片刪除跨 DB／Storage 故障窗口

`scripts/qa-face-member-image-delete.test.ts` 以實際 DELETE route 搭配隔離 in-memory DB／Storage 替身驗證 **8/8**，`npx tsc --noEmit` 通過。越權／無 token、非法與跨會員 ID、analyzing／claim 衝突、已刪冪等、正常刪除均有覆蓋。兩個 critical 故障窗口已重現：Storage remove 成功但 DB finalize 失敗後，照片已不存在、DB path 懸空且 `deletion_pending=true`，重送 409；DB 與 Storage 已清後 event INSERT 失敗，首次回 500、重送 200 仍無 event。派工稿見 [QA-FS-M24](qa-fs-m24-member-image-delete-failure-recovery-2026-10-11.md)，X-PM 已接受並派工程1；**真 Supabase DB／Storage 故障尚未驗**，先前自有 Storage stack health check 失敗，不把替身結果當產品服務實測。待 M24 修復候選供隔離複驗。

**M24 候選 harness 準備：**工程 SHA `7d9f2856d4116b60d2e576293d55fb861595eca8` 仍使用與 M22 衝突的 migration 版號，依 X-PM 指示不作正式候選複驗。已新增 QA RPC route harness `scripts/qa-m24-image-delete-recovery.test.ts`，memory-stub preflight **5/5**、TypeScript 通過，涵蓋 finalize/event 故障同 operation 重試、N=20＋重送只一 event、Storage failure 釋放 claim、401／跨會員／analyzing／已刪邊界。該測試不證明真 RPC 交易或 SQL 並發；待唯一版號的新 SHA 與 clean replay 後再正式重跑，Storage health 200/healthy 前不啟動真 Storage 測試。

**本次階段測試總結：**本階段沒有 BLOCKER 新增；critical QA-FS-M22／M23 既有票維持，QA-FS-M24/M25 已由 X-PM 接受並派工程1（M25 是否改具名 admin 另待決）；C20 已送 X-PM；新增 C21/C22 待排序派工；C2 追加 audit 故障證據。M24/M25/C20/C21/C22 均為 route＋替身證據，真服務狀態尚未驗。M23 Option A focused suite 11/11；最新全套 Vitest：75 files passed、3 skipped；650 passed、2 expected fail、3 skipped。另本階段 M24 8/8、M25 7/7、C20 3/3、C21/C22 合併 suite 5/5，`npx tsc --noEmit` 通過。功能驗收清單與正式站回歸仍未完成，不可簽核全系統 UAT。

### QA-FS-M25：面相規則草稿／發布原子性與 audit

針對管理員 draft save 與 `POST /api/admin/face-rules/publish` 的 route＋替身腳本 `scripts/qa-face-rules-publish-audit.test.ts` **7/7**；`npx tsc --noEmit` 通過。正常發布、無 draft 400、81 字版本標籤 400 零寫入及共用 `ADMIN_KEY` 成功發布的 null actor audit 通過。按共用 helper 實作模擬 audit insert 回 `{ error }`：draft 已新增仍 HTTP 200、audit 0；發布時 profile 已切換仍 HTTP 200、audit 0。另注入 publish UPDATE 失敗，舊版先被 archived、API 500、分析回退 built-in rules。派工稿見 [QA-FS-M25](qa-fs-m25-face-rules-publish-atomicity-2026-10-11.md)，X-PM 已接受並派工程1。⚠ `requireAdmin` 允許共用 ADMIN_KEY，其 audit actor 為 null；是否改成只接受具名 admin 屬授權規則決策，本票按現有授權驗 actor attribution，不擅自改授權。證據是 route 控制流與記憶體替身，真 DB／transaction／雙管理員並發尚未驗。

### QA-FS-C23：EZPay provider success 後 invoice row 寫入失敗重試

`scripts/qa-invoice-provider-success-row-failure.test.ts` 走實際 invoice issue route 與 `issueInvoiceFromOrder` helper；僅將 EZPay provider 與 Supabase client 換成本機 stub。首次 provider 回成功後注入 invoice INSERT error，HTTP 500、invoice/audit row 均 0；同單重送時 active invoice 查無資料，provider 第二次收到相同 `merchantOrderNo`，第二次成功才寫 invoice row，HTTP 200、invoice/audit 各 1。**1/1 通過，代表缺陷重現**；`npx tsc --noEmit` 通過。執行：`npx vitest run --config scripts/qa-invoice-provider-success-row-failure.vitest.mts`。沒有呼叫真 EZPay、沒有連 DB，provider 是否因相同 `MerchantOrderNo` 冪等尚未知。派工稿見 [QA-FS-C23](qa-fs-c23-invoice-provider-retry-after-row-failure-2026-10-11.md)，待 X-PM 排序與派工。此票與 C20 audit 遺失分開追蹤；P05 客戶驗收維持未通過。

**本階段更新：**新增 critical QA-FS-C23（同單重試重呼 provider）並回報等待 X-PM；M23 選案仍待 Tech Lead，M24/M25/C20/C21/C22 仍待工程修復與真服務邊界內複驗。QA-owned C23 route/helper stub 1/1、TypeScript 與 diff check 通過。BLOCKER、critical 及 UAT 未結項仍存在，不得標記全系統驗收完成。

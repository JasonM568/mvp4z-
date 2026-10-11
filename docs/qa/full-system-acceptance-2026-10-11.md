# 全系統功能測試與客戶驗收追蹤（2026-10-11）

範圍：`xunfeng-official-v2` 當前 `main`，起始盤點基準 commit `1935618`；B2/C4/M4/M6/M2 修補已在本機提交至 `92e6ef7`，仍須核對遠端與部署。本文件是執行中的驗收清單，不把既有單元測試或讀碼推論當作正式站端到端驗收。交接紀錄若與程式及 migration 衝突，以實際程式及 migration 為準。

## 環境、證據與狀態

- 本機：macOS / Next.js 15.5.23 / Node 專案依賴；`.env.local` 已配置。本輪無正式資料寫入、無真實付款、無 LLM 呼叫。
- `npm run test:unit`：最新全套 589 passed、2 expected fail、2 skipped（含工程1提交的 C6／C7／C8 route test）。AI 問答與管理員補扣點的預期失敗代表已知缺陷，不代表功能通過；工程 pane 同時修改檔案，數量可隨修補變動。
- `npx tsc --noEmit`：通過；`npm run build`：通過，117 靜態頁產出。
- `node scripts/qa-safe-api-smoke.mjs --base-url=http://localhost:3100`：21/21 通過。涵蓋公開 GET、失效 token、SQLi 形狀字串、超長輸入、未授權或必定在寫入前被拒絕的 POST。
- `node scripts/qa-admin-authz-smoke.mjs --base-url=http://127.0.0.1:3101 --members-file=/private/qa-members.private.json`：**219/219 通過**。29 個 GET、44 個寫入方法，各以匿名、無效 bearer、有效一般會員 bearer 發送空請求；前兩者 401、一般會員 403。先對 `/api/member/me` 預檢有效 token 為 200，避免把失效 token 當會員角色測試；在 repo 外獨立 Next clone 執行，避開共用 `.next`。此結果不涵蓋具名管理員正常寫入。
- C4 原有 QA route 預期失敗測試已由隔離 API/DB 腳本取代並移除，避免工程改成 RPC 後只因舊 mock 失效而繼續顯示 expected fail。工程新增 `app/api/payments/ecpay/notify/route.c4.test.ts`，最新全套含其 5 個通過案例；真正驗收仍以隔離 DB 實測為準。`npx tsc --noEmit` 與 `git diff --check` 再次通過。
- 獨立 QA 執行 `scripts/qa-ecpay-notify-accounting-local.mjs` 於本機隔離 Supabase＋stage/local MAC 的 3101 API：**付款帳務 0/2 不合格；跨會員訂單讀取 2/2 通過**。① pending 訂單 980，成功通知 979 → HTTP 400，但付款列 `paid`、訂單仍 `pending`；② paid 訂單／付款，後到失敗通知 → HTTP 200，但付款列 `failed`、訂單仍 `paid`。每筆自建訂單 A 可讀、B 查同 ID 為 0；在 `finally` 刪除並核對 orders/payments 0 筆。未呼叫真實金流／開票。
- C4 新修補在另一套本機隔離庫（3102）初步複驗：錯金額 400、canonical payment 0、稽核事件 1；paid 後失敗通知 200、canonical 仍 paid、稽核事件 1，**2/2 通過**。10 並發重送初跑使用既有 fixture 會員，得到 1 權益與 2 交易；第二筆是合法 `plan_renewal_carryover`，非重複發點。該初跑使 fixture 原有效權益歸零；QA 已依其結轉交易 `balance_after=50` 恢復最新權益為 active/50，舊權益保留 expired/0，並告知工程1。腳本隨後改為每輪建立與刪除全新會員，在 3103 production build 上重跑，結果見下項。
- C4 新修補 production build 在同一獨立隔離庫由 QA 於 3103 跑全新會員／訂單回歸：錯金額與 paid 後失敗 2/2 通過；**同單 N=10 並發重送出現間歇 500**。20 輪中 2 輪各 1/10 回 `500 0|Payment notify failed`、稽核事件僅 9，canonical payment、權益、`ecpay_payment` 交易仍各 1；其餘 18 輪均 200、稽核事件 10。QA 另直接呼叫本機 PostgREST RPC，同碼 N=10 第 5 輪取得精確 SQL 錯誤 `23505 duplicate key ... idx_payments_provider_trade_no_unique`：RPC 的 `ON CONFLICT(provider,merchant_trade_no)` 無法處理另一個 provider_trade_no 唯一索引的並發競爭。每輪專用資料已清理；X-PM 與工程1已收到根因與驗收條件。
- 工程1新增 `20261011120001_ecpay_notification_lock_and_invoker.sql` 後，QA 在同一獨立隔離庫／3103 production build 重新執行腳本 **連續 20 輪全部通過**，每輪建立全新會員與三張訂單：錯金額回 400、不留 paid；已 paid 後的失敗通知回 200、不降級；同單 10 筆並發通知全回 200、稽核事件恰 10、canonical payment／權益／`ecpay_payment` 交易各恰 1。總計 60 個情境、200 筆並發重送，`failed_rounds=0/20`；各輪資料已清理。這是隔離環境回歸，正式 migration／部署及真實金流仍待複驗。
- 工程1隨後對 C4 專用庫做**乾淨 migration reset**，並把跨單 provider trade number 唯一衝突明確轉成 `trade_conflict`。QA 將腳本擴成第四情境：已存在的 paid 訂單占用同一 `provider_trade_no`，新 pending 訂單合法通知回 409；舊付款與訂單維持 paid，新單無 canonical payment／權益／交易，只追加一筆稽核事件。最新 production build／clean DB 上 **四情境連續 20/20 輪通過**，其中同單並發共 200 筆。中途隔離 stack 重啟曾導致連線拒絕與 PostgREST `PGRST002`／503，那批環境中斷測試作廢；服務穩定後完整重跑全綠。每輪自建會員／訂單、逐輪清理核對；正式部署與真實交易仍待驗。
- `scripts/qa-ecpay-rpc-authz-local.mjs` 對同一 C4 隔離庫驗證 5/5，連續三次通過：service role 可看稽核表、可抵達 RPC 且假 MAC 在寫入前遭拒；匿名角色呼叫 RPC／讀稽核表各 401，有效簽章的一般會員角色各 403。測試使用不存在訂單與無效 MAC，不會產生資料。此為本機角色權限驗證，正式庫授權需部署後核對。
- 正式站五個 `/api/cron/*` GET 入口匿名請求均回 401；未觸發排程寫入。
- `node --env-file=.env.local scripts/qa-rls-anon-smoke.mjs`：11/11 有樣本的敏感表對匿名身分隱藏；`face_knowledge_revisions` 無樣本而跳過。唯讀比較、未列印資料。這不代表已驗證「會員 A 看不到會員 B」。
- 獨立 QA 在 repo 外隔離 Supabase 用 A/B 專用帳號執行 `scripts/qa-rls-member-isolation.mjs`：7/7 通過。A、B 各可讀本人 profile、entitlements、credit transactions，對方三表各 0 筆；以過期 JWT 直接打 PostgREST 得 401。只讀、無帳密或個資輸出；驗證範圍是這三表與過期 token，其他資料表及寫入隔離待驗。
- `scripts/qa-rls-member-writes.mjs` 在同一隔離庫用有效一般會員 token 直接打 PostgREST：**6/6 通過**。修改本人／他人 profile 及他人 pending 訂單，DB 均無變化；直接插入 paid 訂單、9,999 點權益、9,999 點交易均回 403，DB 均 0 筆。自建訂單已刪、profile 原值及 4 類 QA ID 均再次核對，無殘留。尚未涵蓋其他表與 RPC 授權。
- `scripts/qa-face-owner-local.mjs` 使用 A/B 專用完成狀態面相報告在隔離 API/DB 做 **8/8 通過**：A 列表與詳情只見自己且回傳不含 `storage_path`／`model_trace`，A 對 B 詳情、預覽、整份刪除及照片刪除均 404；A 直接 PostgREST 讀 face run 回 403，跨會員請求後兩筆 DB 狀態不變，測試列已刪除並核對無殘留。此測試未呼叫 PDF、上傳或 AI provider。
- `scripts/qa-council-owner-local.mjs` 使用 A/B 專用報告在隔離 API/DB 做 **5/5 通過**：A 列表／詳情只見自己、查 B 詳情 404；直接 PostgREST A 可讀自己 1 筆、B 0 筆；A 改 B 報告回 200 但 DB 無變化，直接 INSERT 偽報告 403、DB 0 筆。自建與偽造 ID 均清理核對；未呼叫 LLM 或扣點。
- `scripts/qa-admin-booking-local.mjs` 原在隔離 API/DB **5/7 通過、2 項不合格**：`limit=-1` 回 500、`limit=abc` 回 200。工程1提交 `9a8c33d` 後，QA 以獨立 clone `92e6ef7` production build／隔離庫重跑 **11/11 通過**：具名管理員列表／詳情／PATCH＋audit、非法狀態及會員越權、非法 limit -1／abc／0／501 均 400，合法 1／500 均 200 且列表／summary 一致。Auth/profile、預約、audit 已清理核對；正式部署待驗。
- `scripts/qa-finance-rls-local.mjs` 在隔離庫建立 A/B 專用訂單、發票、課程報名及使用量列，**9/9 通過**：兩名會員對四表均只讀到自己的 1 筆、對方 0 筆；A 直接 PATCH B 發票回 200 但 DB 保持 pending。測試列逐表清理並核對 0 殘留；這驗的是資料隔離，不代表付款／開票端到端完成。
- `scripts/qa-referral-lookup-local.mjs` 對隔離庫專用推廣人做公開查詢 **8/8 通過**：正確／大小寫代碼只回名字，空碼、SQLi 形狀、LIKE wildcard、33 字與停用碼均不回推廣人；匿名直接查 `referral_partners` 被拒絕。資料已清理。
- `scripts/qa-referral-order-local.mjs` 在隔離 API/DB 用專用推廣人 A/B 與 QA 會員做訂單歸因：綁定 A 優先於 B cookie、未綁定採 B cookie、歷史訂單比例快照不受事後改率影響、停用 cookie 不歸因且不阻建單，**4/4 斷言通過**。另發現**已綁定 A 停用後，B cookie 使新單轉歸 B**；與 `lib/referral/attribution.ts` 的「終身歸戶／停用不歸戶」敘述可能衝突，列 QA-FS-C5 待商業規則決策。四張 pending 訂單、兩個推廣人已刪，會員原綁定值已還原並核對。
- 工程1提交 `92e6ef7` 的面相知識庫 RLS migration 後，QA 僅在主本機隔離庫以 `psql` 直接執行該 SQL（**未寫 migration history、非正式部署**）；`scripts/qa-face-knowledge-rls-local.mjs` **4/4 通過**：兩表 `relrowsecurity=true`，service role 讀兩表 200、匿名各 401、有效會員各 403；service role 建卡／revision／更新卡成功，刪卡後 revision cascade 清理且 0 殘留。M2 隔離複驗通過，正式 migration 待驗；後台 API 正常流程另見 QA-FS-C6。
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
- C9 已提交修補 `fbcb6bc` 後，QA 使用 `bash scripts/qa-addon-zero-balance-local.sh /private/connection.private.env --migration-preview` 在單一交易載入正式提交的 migration 並複驗。結果 exit 3：`active_count=1`、`old_active=f`、`purchased_credits=20`、`new_vip=t`，但 `selected_old=t`、`selected_credits=0`。同到期日的失效舊列仍可被 `getPublicMember()` 無 status 條件的排序選中；交易失敗自動回滾，本機庫沒有套用 migration。已將剩餘缺口交 X-PM；會員 API／畫面與 AI 成功回應的會員摘要須修復後複驗。
- M7／M11 工程修補 `48cd357` 後，QA 在本機隔離 DB／3104 dev API 重跑 `scripts/qa-admin-course-followup-local.mjs`，**17/17 通過**：`limit=-1/abc/0/501` 均 400，`limit=1/500` 均 200；兩筆報名時 `limit=1` 的 API `summary.total/pendingContact=2/2` 與 DB `2/2` 一致，具名管理員跟進／audit、匿名與會員拒絕也通過，fixtures 全清。工程 route 單元測試另有 **12/12 通過**；正式部署及後台畫面仍待驗。
- `scripts/qa-cron-cleanup-local.mjs` 在獨立 C4 本機 DB／3104 API 建逾 24 小時 pending 訂單、近 24 小時 pending、舊 paid，及過期／未到期 active 權益。兩路由匿名／錯密鑰皆 401、dry-run 均報 1 候選且不寫入；舊 pending 訂單正式清理成功。過期權益正式清理卻 HTTP 500：`member_entitlements` 沒有 `updated_at` 欄位；QA-FS-C11。`finally` 清理後 profile、訂單與 cron audit 均 0；此腳本須待修復後跑滿 12/12。
- `scripts/qa-site-publish-type-local.mjs` 在獨立 C4 本機 DB／3104 API 以具名管理員直打 CMS：POST 服務 `is_published:"false"` 回 201 且 DB `true`；先把測試服務重設為未上架，再 PATCH 同值回 200 且 DB 由 `false` 變 `true`。真正布林 `true/false` 的上架／下架正常，合計 **2/4 通過**（QA-FS-M13）。測後 QA profile、服務與 audit 均 0；非前端輸入可能誤上架。
- `scripts/qa-refund-rounding-local.sh` 在隔離 DB 以單一交易重現 QA-FS-C10：paid 199 元／20 點加購訂單依序退款 99＋100 元，訂單轉 `refunded`，但兩次只收回 9＋10＝19 點，權益仍有 1 點；腳本 exit 3。連線關閉自動回滾，QA profile 殘留 0，沒有綠界操作或正式資料寫入。
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
| 官網與內容 CMS | 首頁、關於、服務、案例、課程、方案及導覽正確 | CMS 缺欄位、圖片 404、HTML/XSS 文案安全顯示 | 空清單、超長標題、手機寬度、快取更新 | 同時編輯與讀取內容 | **不合格 M12/M13**：服務全下架仍回靜態 9 筆；管理 API 字串 `"false"` 被當 `true` 而意外上架；正式站 8 頁手機寬無水平溢出，完整視覺待驗 |
| 註冊與免費試用 | 新信箱建立 profile、30 點／30 天、通知 | 重複信箱、壞 email／手機、弱密碼、SQLi/XSS 字串 | 空姓名、超長欄位、同手機第二帳號不重領 | 同手機多帳號同時註冊只發一次 | 隔離 API/DB 9/9、同手機 N=3 只發 1 次已驗；通知信、UI 與效期精確邊界待驗 |
| 登入／登出／重設 | 有效密碼取得權杖、登出、重設成功 | 錯密碼、失效／過期 token、重設連結重用 | 空欄、超長密碼、郵件限流 | 同 token 登出與刷新競爭 | 隔離 API 正確／錯密碼 200／400、無效 refresh 401、有效 refresh 200、已知／未知信箱忘密皆 200、過期 JWT 401；Ego UI 正確登入／登出／再開受保護頁已驗，錯密碼英文 QA-FS-M8；重設信與改密碼待驗 |
| 會員中心與資料隔離 | 只讀本人方案、點數、訂單、使用量 | A token 查 B 的 ID、直接打 API、管理員路由 403 | 無方案、0 點、到期瞬間、分頁尾頁 | 點數更新後多分頁同步 | 隔離庫 A/B 核心表讀取及會員訂單／使用量 API 11/11：付款已到但權益未開通可見、開通後輪詢更新；Ego UI 本人資料／空報告／pending 單已驗，過期 token 假 FREE/0 點 QA-FS-M9；其他表待驗 |
| 方案與訂單建立 | 後端定價、有效方案、發票資料入單 | 偽造金額／方案、內部方案、非 TWD、SQLi | 空方案、超長 `plan_code`、公司統編／載具邊界 | 雙擊結帳、兩個 pending order | M4 邊界及 `e2e_` 內部方案 code／ID 直打 API 拒絕，隔離 9/9；後台 pending 訂單／發票唯讀 8 項通過，非法訂單 id 三種 500 QA-FS-M10；雙送兩單 QA-FS-M5，完整付款待驗 |
| 綠界付款通知 | 合法 MAC、金額吻合後開通與寄信 | 偽造 MAC、錯金額、跨單交易號衝突、未知訂單、失敗通知 | ATM 取號≠已付款；付款後 DB 部分失敗重送 | 同 webhook N 次只開通／寄信一次 | QA-FS-C3 待對帳；C4 clean DB 四情境 20 輪通過（含 N=10 並發、跨單交易號 409），RPC／稽核表非 service role 5/5 拒絕；正式部署與寄信待驗 |
| 會員權益／續訂／加購 | 點數結轉、效期延長；加購只加點 | 逾期、退款後使用、錯方案 | 餘額 0、效期 now、結轉極值 | 同時付款通知、同時扣點 | **不合格 QA-FS-C9**：已提交 migration 修好新列 VIP，會員查詢仍可能選中同到期日的失效舊 0 點；其他續訂情境待驗 |
| 管理員補扣點 | 補點與交易明細、audit 一致 | 非管理員、無效會員、超額扣點 | 5 點扣 10 點、0 點、極大數字 | 雙管理員同時調整同會員 | **不合格 QA-FS-C2**：超額扣點造成餘額與交易 amount 不一致 |
| 啟用碼建立 | 具名管理員建立後碼、期限、點數與 audit 一致 | 匿名／會員拒絕，未知／SQLi 形狀方案碼 | 0／3650／3651 天、0／100000／100001 點、501 字備註 | N=10 同時建碼不重碼 | 隔離 API/DB 13/13，11 筆唯一碼及 audit 對帳並清理；正式站待驗 |
| 啟用碼兌換 | 未使用碼只開通一次 | 不存在、已用、void、SQLi | 空碼、超長碼、交易寫入失敗回滾 | 同碼雙送只能一成功 | **QA-FS-B2 隔離複驗通過，待部署**：QA route 4/4、QA API/DB N=10 與故障注入兩輪通過；正式站未複驗 |
| AI 即時問答 | 有權益、有點數才生成，成功依中文字數扣點 | 無／過期 token、LLM 失敗不扣、直接 API 注入 | 空訊息、4,000 字、40 則歷史、餘額 1 | 同會員雙送只能計費交付一份 | **不合格 QA-FS-B1**：扣點衝突送免費答案，隔離測試已重現 |
| 易學決策報告 | 所選術數成稿、扣 20、歷史可找回 | 無權益、錯日期、prompt injection、provider 失敗 | 19／20 點、每日第 20／21 份、字數上限 | 同會員 4 份只成功 1；斷線找回 | 並發、schema、每日限額有既有正式站證據；隔離 API/DB A/B 歷史與直接寫入 5/5；瀏覽器找回／備援待驗 |
| 奇門校對與老師規則庫 | 三盤比對、版本簽核、文件選取生效 | 非管理員 403、不完整簽核 400、錯版失效 | 0 文件、150k 字總額、單份 24k 字、手機九宮格 | 同時發布／簽核版本 | 既有 API 冒煙；老師未簽核，最新規則庫未做完整 UAT |
| 面相分析 | 同意、上傳、品質、分析、報告／PDF、扣點 | 非本人取圖／PDF、錯 MIME、無學理 422 不扣 | 空圖、尺寸上限、任務／保存上限、過期圖片 | 同 run 雙 analyze、重送 requestId | 隔離 API/DB A/B 報告／照片操作 8/8、知識庫 M2 RLS 4/4；C6 同卡 N=10 單／雙管理員各 11 輪隔離複驗通過；正式部署、真實 UI／PDF／提供者端到端待驗 |
| 顧問預約 | 送出後後台可見、狀態可更新 | 缺聯絡方式、非法 email、腳本字串、管理員越權 | 空欄、80／4,000 字、只有電話 | 雙擊、公開入口灌單 | 隔離 API 邊界 7/7；具名管理員列表／詳情／PATCH＋audit 及 limit 邊界 M6 複驗 11/11；`@@@` 電話 QA-FS-M1、雙送 QA-FS-M3；限流待驗 |
| 課程報名與結帳 | 新生／複訓價格由後端算、報名及訂單一致 | 非法 email／發票、未知課程、偽造價格 | 空選項、超長備註、課程停用 | 雙擊結帳、同 email 同時建立 profile | 隔離 API 8/8 驗證／定價；後台未付款名單／跟進／audit、列表 limit 與摘要修補後 17/17；同 email 雙送 1 profile、2 pending 訂單／報名，QA-FS-M5 待規則；付款後待驗 |
| 發票與退款 | 付款後開票、失敗可重試、退款帳務一致 | ezPay 失敗／重送、錯統編、未退款卻登錄 | B2C／B2B、載具、捐贈碼、部分退款 | 重試開票／雙重退款 | A/B 發票 RLS 已驗；C8 非法補開票隔離 API 7/7；**不合格 C10**：199 元訂單拆成 99＋100 退款後仍餘 1 點；合法外部開票、退款流程待驗，作廢／折讓未實作 |
| 通知與忘記密碼信 | 註冊／付款／警報郵件寄達 | provider 429／失敗不阻主交易 | 空收件人、退信、模板超長 | webhook 重送不重寄 | 待驗；Supabase custom SMTP 未接 |
| 推廣歸因／分潤 | 有效碼綁定，訂單可追溯 | 無效碼、停用碼、猜碼不洩資料 | 空碼、大小寫、特殊字元 | 註冊與下單同時／重送 | 隔離庫公開查碼 8/8、會員建單歸因／比例快照 4/4；C7 具名管理員建立／改率／停用及 N=10 audit 11 輪隔離複驗通過；C5 停用後帶他人 cookie 轉歸他人待規則決策；註冊當下與正式資料待驗 |
| 後台營運與 CMS | 具名管理員可管理會員、訂單、預約、課程、內容與 audit | 無 token／會員 token 403；未授權直接 API | 空表、分頁、上傳 2MB、超長內容 | 雙管理員編輯同一資料 | 73 個 handler × 匿名／無效 bearer／有效會員，共 219/219；具名管理員預約 11/11、建碼 13/13、課程跟進與列表修補後 17/17；其他後台寫入與畫面待驗 |
| 排程與清理 | 到期權益、pending 訂單、面相圖片按時清理 | 無 CRON_SECRET 或偽造 token 拒絕 | 空候選、批次上限、剛付款競爭 | cron 重入與付款 webhook 同時 | **不合格 C11**：隔離 DB 舊 pending 訂單清理成功；過期權益 dry-run 候選 1，但正式執行因不存在的 `updated_at` 欄位回 500；其餘排程待驗 |
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
21. **面相知識庫 RLS（4/4）**：`node scripts/qa-face-knowledge-rls-local.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。要求隔離庫先套 M2 SQL；檢查兩表 RLS 開啟、匿名／會員拒絕、service role 讀寫及卡片刪除 cascade，最後清理核對。正式 migration history／部署另驗。

22. **面相知識庫具名管理員流程（C6 隔離複驗單／雙管理員各 11 輪 15/15）**：`node scripts/qa-face-knowledge-admin-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json --cas=true --two-admins=true`；省略 `--two-admins=true` 驗單管理員。隔離 API/DB 自建管理員與 draft 卡，驗匿名／會員 401／403、非法與超長輸入 400 且零寫入、建立／查詢／更新／封存、revision 與具名 audit；N=10 同卡並發 PATCH 恰一成功、其餘 409，勝者具名 audit／版本／快照一致。所有列與 Auth 帳號清理核對。正式部署與 UI 衝突提示待驗。
23. **具名管理員建立啟用碼（13/13）**：`node scripts/qa-admin-create-code-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。隔離 API/DB 驗權限、非法方案／期限／點數／備註、上下邊界及 N=10 建碼唯一性，核對 DB 和 audit，最後清理所有碼及帳號。
24. **課程未付款名單與管理員跟進（修補後 17/17；QA-FS-M7/M11）**：`node scripts/qa-admin-course-followup-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。專用報名／管理員，驗未付款仍可見、狀態時間戳與 audit、權限、超長備註、兩筆報名下 `limit=1` 的完整摘要及非法值；全部測試列清理核對。
25. **推廣人後台建立／修改／稽核（C7 隔離複驗 11 輪 13/13）**：`node scripts/qa-admin-referrals-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。自建管理員與推廣人，驗角色、非法輸入、重碼、列表／空統計、分潤率與停用 DB，建立及修改 audit 含具名操作者和修改前後值；再以 N=10 並發改比例，查每筆 audit 與最終值。最後清理；正式站待驗。
26. **後台訂單／發票唯讀對帳（8/11；QA-FS-M10）**：`node scripts/qa-admin-finance-read-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。專用 pending 訂單／發票與具名管理員，驗權限、列表、詳情、合法不存在 UUID 與三種非法 id；不觸發付款／開票，最後清理。
27. **手動補開票錯誤輸入（C8 route 測試 7/7）**：`npx vitest run app/api/admin/invoices/'[orderId]'/issue/route.qa.test.ts app/api/admin/invoices/'[orderId]'/issue/route.c8.test.ts`。mock paid 訂單、已存買受人與開票 helper；合法空 body 可沿用，無效公司統編／壞 JSON 在開票前 400；隔離真 API／DB 與正式部署待驗。
28. **VIP 加購 0 點舊方案邊界（QA-FS-C9，預期失敗）**：`bash scripts/qa-addon-zero-balance-local.sh /private/connection.private.env --migration-preview`。僅接受 localhost DB；交易內先載入已提交 migration，再自建 profile、0 點未到期 VIP 權益及 paid 加購訂單，RPC 加 20 點後按會員路由相同排序查詢。目前新列保留 VIP、舊列 expired，但查詢仍選中舊 0 點而 exit 3，連線後自動 rollback。修復後須加 API／會員中心、tier 與扣點複驗。
29. **手動補開票隔離 paid 訂單 API（C8 7/7）**：`node scripts/qa-invoice-issue-invalid-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。只接受 localhost API/DB；自建具名管理員及 paid 訂單，驗匿名／會員權限與四種非法 body 均在開票前被擋，invoice／audit 不新增，訂單不變，最後清理。合法 ezPay 開票需測試環境另驗。
30. **拆分退款點數取整（C10，預期失敗）**：`bash scripts/qa-refund-rounding-local.sh /private/connection.private.env`。只接受 localhost DB，交易內建 199 元／20 點 paid 訂單，退款 99＋100 元後要求總回收 20、餘額 0；目前只回收 19、餘額 1 而 exit 3，連線後自動 rollback。修復後擴驗直退、1＋198、多筆部分退款及超額拒絕。
31. **會員訂單／使用量 API（11/11）**：`node scripts/qa-member-read-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json`。只接受 localhost API/DB；A/B 各建測試訂單及 usage，驗身份、跨會員隔離、paid 尚未開通／開通後輪詢、SQLi 形狀訂單號，最後逐筆清理。
32. **公開 CMS 全下架空狀態（M12，預期失敗）**：`node scripts/qa-site-unpublish-local.mjs --base-url=http://127.0.0.1:3102 --env-file=/private/c4-connection.private.env`。只接受 localhost API/DB；暫把本機服務全部下架，要求公開 `services=[]`，目前回靜態 9 筆而 exit 1；`finally` 還原並核對原旗標。須在獨立內容庫執行，避免共享資源受短暫下架影響。
33. **排程正向清理（C11，預期失敗）**：`node scripts/qa-cron-cleanup-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`，本機 app 需 `CRON_SECRET=qa-cron-isolated-only` 並指向獨立 C4 庫。腳本先確認無既有待清候選，再建專用舊／新訂單與權益；驗匿名／錯密鑰、dry-run、真正清理、重跑與點數保留，最後刪除 fixtures/audit。目前過期權益更新因不存在 `updated_at` 回 500，修後目標 12/12。
34. **CMS 發布型別直打 API（M13，2/4）**：`node scripts/qa-site-publish-type-local.mjs --base-url=http://127.0.0.1:3104 --env-file=/private/c4-connection.private.env`。獨立庫自建具名管理員與服務；要求 `is_published:"false"` 在 POST/PATCH 都 400 且不發布，目前 201/200 並上架；真正布林上架／下架兩項通過。`finally` 清除服務、audit、Auth/profile；修後目標 4/4。

## 效能與壓力測試提案

以下是**驗收目標提案**，尚非量測結果。先在 preview／隔離庫以 1、5、20 並發階梯測 10 分鐘，記錄 p50／p95／p99、錯誤率、DB pool、供應商 429、成本及重試數；每批用獨立帳號與唯一資料前綴，清理後核對列數。

| 流量類型 | 起始目標 | 瓶頸假設 | 驗收與隔離方式 |
|---|---|---|---|
| 公開頁／公開 GET | 30 QPS、p95 < 1 秒、5xx < 1% | CMS JSON、冷啟動、圖檔 | k6／autocannon，固定內容版本；只打測試部署 |
| 登入／會員讀 API | 5 QPS、p95 < 2 秒、5xx < 1% | Supabase Auth／DB 連線 | 20 個 QA 帳號輪流，避免單 IP 供應商限流混入結果 |
| 預約／課程／訂單建立 | 2 QPS、p95 < 3 秒，無重複權益 | DB 多表寫入、外部金流參數 | 僅隔離庫／沙箱；每請求唯一 key，核對訂單與報名列 |
| AI 問答／報告／面相 | 每會員最多 1 進行中；報告 p95 < 240 秒 | LLM 429、300 秒 function 上限、寫入與扣點競爭 | 先 mock provider 壓 API，再用小批專用帳號真實提供者；設成本上限 |
| 綠界通知重送 | 同單 10 並發，開通／交易／通知各恰 1 | `commit_paid_entitlement`、課程報名狀態競爭 | 合法測試 MAC＋隔離訂單，逐表快照；不碰真實會員訂單 |

## 客戶 UAT 清單（逐項勾選）

### 官網、會員與付款

- [ ] 桌面與手機可瀏覽首頁、服務、案例、課程、方案、預約與隱私頁，導覽正確。
- [ ] 後台將服務、案例或課程全部下架後，公開頁與 API 不再顯示已下架內容；資料源故障時的備援內容符合營運規則。**QA-FS-M12 修復及複驗前不可勾**。
- [ ] 後台新增或更新草稿時，只有明確勾選上架才公開；API 收到字串 `"false"` 等非法型別不會誤上架。**QA-FS-M13 修復及複驗前不可勾**。
- [ ] 新會員註冊成功，30 點試用與到期日正確；同手機第二個帳號不再取得試用點。
- [ ] 登入、登出、忘記密碼及重設密碼均可用；過期登入會要求重新登入。
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
- [ ] 一張訂單分次退款至全額時，未使用點數全部收回；每筆退款、點數交易及最終餘額可對帳。**QA-FS-C10 修復及複驗前不可勾**。
- [ ] 管理員建立啟用碼時，方案、期限、點數與稽核紀錄正確；同時建立多筆不重碼。**隔離環境已驗，正式站待驗**。
- [ ] 啟用碼只可兌換一次；兩個視窗同時送出也只有一次成功。**QA-FS-B2 隔離複驗已通過，正式部署及站端回歸前不可勾**。

### 服務流程

- [ ] 顧問預約送出後在後台看得到，狀態與負責人可更新。
- [ ] 顧問預約聯絡資料可用，網路重送／雙擊不產生不必要的重複派案。**QA-FS-M1/M3 規則確定前不可勾**。
- [ ] AI 即時問答生成成功才扣點，回覆字數計費正確；並發不送免費答案。**QA-FS-B1 修復前不可勾**。
- [ ] 易學決策報告只使用已選術數，完成扣 20 點，歷史與點數一致。
- [ ] 點數不足、日期錯誤、超長輸入、每日第 21 份會被明確擋下且不扣點。
- [ ] 雙分頁同時送易學決策，只完成一份；關閉分頁後可找回結果。
- [ ] 備援報告不扣點；AI 實際文字對未簽核奇門明示「尚待老師校對」。
- [ ] 老師核對三張奇門盤，確認晚子時設定並完成具名簽核。
- [ ] 面相照片不合格時可重拍且不扣點；合格後報告、歷史、PDF 與點數一致。
- [ ] 面相圖片到期不可再取得，刪除報告後保存額度釋出。

### 後台與安全

- [ ] 非管理員無法透過網址或直接 API 操作後台。
- [ ] 後台會員、訂單、發票、預約、課程、推廣、Token 用量資料可對上原始交易。
- [ ] 推廣人停用後，既有綁定會員的新訂單依已確認規則歸戶或不歸戶，分潤比例快照可追溯。**QA-FS-C5 決策與複驗前不可勾**。
- [ ] 管理員建立推廣人、修改分潤率或停用時，具名稽核可追查操作者及修改前後值。**QA-FS-C7 隔離環境 11 輪複驗通過，正式部署前不可勾**。
- [ ] 後台補扣點的交易明細與實際餘額變化相等；雙管理員同時調整不遺失任何一筆。**QA-FS-C2 修復前不可勾**。
- [ ] 到期權益排程將舊資格標為過期、保留原點數且不影響未到期會員；過期 pending 訂單會取消，已付款訂單不受影響。**QA-FS-C11 修復及部署複驗前不可勾**。
- [ ] 後台內容、老師文件、提示詞、排盤與面相規則的草稿／發布狀態清楚且有 audit log。
- [ ] 兩位管理員同時編輯同一面相知識卡時，每筆成功修改都有唯一版本與一致的修訂快照；衝突有明確提示。**QA-FS-C6 單／雙管理員 N=10 各 11 輪隔離複驗通過，UI／正式部署前不可勾**。
- [ ] 後台手機畫面可讀，奇門九宮格及放大字級不重疊。
- [ ] 註冊／付款通知寄達；失敗可追查，重送付款通知不重寄。
- [ ] 排程正確清除過期資料，不會取消剛付款訂單或刪除未到期圖片。

## 派工票與未結風險

| 編號／等級 | 現象與證據 | 預期修復與複驗 | 狀態 |
|---|---|---|---|
| QA-FS-B1／BLOCKER | `app/api/ai/chat/route.ts` 扣點 CR002 時仍 200 送答；隔離 QA 測試 expected fail | LLM 前以會員級互斥或等效機制拒絕第二筆；並發 N 筆只產生一份、扣點／usage 一致 | 已排入 X-PM 收件佇列，待工程修復 |
| QA-FS-B2／BLOCKER | 原 route 先插權益後搶碼且不查 UPDATE 命中；工程1已改 `redeem_activation_code` 原子 RPC，QA route 4/4、隔離 API/DB N=10 與 rollback 兩輪通過 | X-PM 審核後套正式 migration 與部署，QA 以專用正式測試碼驗證同碼只成功一次及回滾 | 隔離環境複驗通過；正式站仍有舊漏洞，待部署與正式回歸 |
| QA-FS-C1／critical 待確認 | 已知發票無作廢／折讓流程；退款登錄後發票狀態可能不一致（`handoff.md`、後台發票 API） | X-PM 確認退款營運規則與實際開票環境，再排作廢／折讓驗收 | 待商業／財務決策 |
| QA-FS-C2／critical | 管理員 5 點扣 10 點時餘額變 0、交易卻記 -10；route 先讀後寫也會 lost update；隔離 QA 測試 expected fail | 決定超額扣點規則後，DB 原子更新餘額、交易與 audit；並發兩筆總額正確 | 已排入 X-PM 收件佇列，待規則決策與工程修復 |
| QA-FS-C3／critical | 本機 `.env.local` 所指 Supabase 專案於台北 10/07 無訂單／付款／發票；Vercel 正式 MID 與交接一致，正式 Supabase URL 受保護而未能核對 | 取得 MerchantTradeNo／TradeNo、金額、時間、MID 與付款入口；核對正式 Supabase URL 與各帳務表 | 已排入 X-PM 收件佇列，待交易資訊；不能宣告刷卡 E2E 通過 |
| QA-FS-C4／critical | 舊版錯金額留下假 paid、後到失敗通知覆寫 paid；第一版新 RPC 又在 N=10 並發 20 輪中 2 輪觸發 `23505 idx_payments_provider_trade_no_unique`／HTTP 500 | 最新 migration／clean DB 後，QA 獨立隔離庫四情境連續 20 輪通過：錯金額不入帳、paid 不降級、每輪 N=10 全 200／稽核 10／付款、權益、交易各 1；跨單 provider 交易號衝突 409，原付款不變；匿名／會員 RPC 與稽核表 5/5 拒絕。正式部署後用指定測試交易回歸 | 隔離環境複驗通過；正式 migration／部署／站端複驗待辦，仍追蹤 |
| QA-FS-C5／critical 待決策 | 會員 profile 綁 A、cookie 指 B；A 有效時新單歸 A，A 停用後相同情境新單歸 B。`lib/referral/attribution.ts` 同時承諾「終身歸戶」與「停用不歸戶」，實際 fallback 使分潤轉給別人；隔離腳本 4/4 及此觀察，資料清理還原 | 決策 A（QA 建議）：已綁定但停用→新單不歸因，cookie 不改歸；B：允許轉歸並明訂告知；C：既有綁定持續歸 A、停用只禁新歸戶。工程依決策實作並驗 active→inactive、不同 cookie、比例快照與建單不阻斷 | 已送 X-PM 排優先與商業規則討論；不可由 QA 擅定分潤 |
| QA-FS-C6／critical | 舊版同卡 N=10 並發曾 10 筆皆 200、覆用版本及遺失快照；工程 `73517cb` 改 DB 原子 CAS | QA 隔離庫單／雙管理員各 11 輪 N=10：每輪 1 筆 200／9 筆 409，版本、revision、勝者具名 audit、最新快照一致；RPC 權限與匯入來源測試通過。再驗 UI 衝突提示、正式 migration／部署 | 隔離核心並發複驗通過；剩餘驗收仍追蹤 |
| QA-FS-C7／critical | 舊版具名管理員建立／修改分潤率及停用成功，但 `admin_audit_logs` 0 筆；工程 `d22a9ed` 改 DB 原子寫入 | QA 隔離庫 11 輪 13/13，建立及修改具名 before/after audit；每輪 N=10 並發改率均 200、各有 audit、最終值對上；RPC 權限與故障注入 SQL 通過。再驗正式 migration／部署 | 隔離複驗通過；站端仍追蹤 |
| QA-FS-C8／critical | 舊版手動補開票吞掉無效統編或壞 JSON，仍沿用舊資料開票；工程 `6dd756e` 補輸入驗證 | QA 兩個原 expected fail 已轉正常測試，與工程測試合計 7/7；隔離 paid 訂單 API 四種無效輸入及角色驗證 7/7、invoice／audit 零新增。合法 ezPay 開票與正式部署再驗 | 單元及隔離非法輸入複驗通過；站端仍追蹤 |
| QA-FS-C9／critical | `fbcb6bc` migration 預覽：舊 VIP 0 點加購 20 點後，新列 VIP/20、舊列 expired，但會員查詢因同到期日仍選舊 0 點。腳本 `--migration-preview` exit 3，交易自動回滾 | 會員中心及 AI／報告只選有效新 20 點並保留 VIP plan／tier_features；驗同效期、多次重跑與並發續訂，點數交易對帳一致 | 部分修補已提交，剩餘讀取缺口已送 X-PM；不涉商業規則，正式收款／UI 待驗 |
| QA-FS-C10／critical | 隔離 DB：199 元／20 點訂單分次退 99＋100 元後訂單 `refunded`，點數只回收 9＋10＝19、仍餘 1。`commit_manual_refund` 對每筆金額各自 `floor`，腳本 exit 3、回滾後殘留 0 | 以累計退款比例計算**本次應追加**回收點數，至全額應回收原發點數（以可用餘額為上限並記短缺）；驗直退、拆退、多次退款、重送／超額拒絕及點數交易對帳 | 已送 X-PM 派工程；不涉規則取捨，正式退款未執行 |
| QA-FS-C11／critical | 隔離 DB：過期 active 權益 dry-run 回 200／候選 1，正式 GET `/api/cron/expire-entitlements` 回 500，錯誤為 `member_entitlements.updated_at` 欄位不存在；`0001_init.sql` 與實際 schema 均無此欄。舊 pending 訂單 cron 正常清理，測試資料／audit 清 0 | 過期權益轉 expired、保留原點數，未到期仍 active；重跑候選 0。`scripts/qa-cron-cleanup-local.mjs` 12/12、正式部署排程成功且 audit 可追 | 已送 X-PM 派工；排程有候選時必失敗，不涉商業規則 |
| QA-FS-M1／minor | 隔離 API 實測只有 `phone='@@@'`、無 email 仍回 200 並建立預約；公開入口未見程式內限流，外層 WAF 尚未量測 | 確認可接受電話／LINE 格式及防濫用門檻；非法聯絡方式 400，合法可送，隔離 DB 回歸 | 已交 X-PM 討論規則 |
| QA-FS-M2／minor | `20260809160300_face_knowledge_base.sql` 對面相知識庫兩表撤銷 anon／authenticated 權限，但未啟用 RLS；匿名抽樣原未暴露資料 | 工程1 `92e6ef7` 啟用兩表 RLS。QA 隔離庫直接套 SQL 後 4/4：`relrowsecurity=true`、service role CRUD／revision 寫入與清理、匿名／會員不可讀；正式 migration／後台 API 再複驗 | 隔離環境複驗通過；正式 migration／部署待辦 |
| QA-FS-M3／minor 待規則 | 隔離 API 同一預約表單並發 POST 兩次，HTTP 200/200、DB 建 2 筆；唯一 source 專用資料已清理 | 建議 client requestId 冪等，同 ID 重送只 1 筆、不同 ID 可分別送；也可由 PM 選時間窗去重或允許重複並後台標記；以 N=2 與相異 ID 複驗 | 已交 X-PM 討論商業規則 |
| QA-FS-M4／minor | 舊版有效會員直接 POST `/api/orders/create`，`plan_code` 10,000 字回 500、訊息 `[object Object]`；128／1,024／4,096 字回 404 | 工程1 `1185c12` 設 64 字上限；QA 獨立 production build／隔離 DB 7/7：64 字未知碼 404，65／10,000 字 400，非法輸入訂單增量 0；正式部署後再冒煙 | 隔離環境複驗通過；待遠端部署／正式站回歸 |
| QA-FS-M5／minor 待規則 | 會員同方案／發票資料雙送 200/200、兩張 pending 訂單；課程同 email／課程雙送亦 200/200、1 profile、2 pending 訂單與報名。測試列均已清理 | 建議兩個結帳入口共用 requestId 冪等，同 ID 各只一張、不同 ID 仍可建立；若業務接受多張，須明確 UI／清理規則；N=2 與重送複驗 | 已交 X-PM 討論商業規則 |
| QA-FS-M6／minor | 舊版具名管理員 GET `?limit=-1` 回 500、`limit=abc` 回 200；原隔離 API/DB 5/7 | 工程1 `9a8c33d` 驗證 1–500 整數。QA 於 `92e6ef7` 獨立 production build／隔離庫 11/11：-1／abc／0／501 為 400，1／500 為 200，具名管理員列表／詳情／PATCH／audit、會員 403 均正確，測試資料清理 | 隔離環境複驗通過；正式部署／站端回歸待辦，不涉及商業規則 |
| QA-FS-M7／minor | 原缺陷：`limit=-1` 500、`abc`／`0`／`501` 200。修補 `48cd357` 後隔離 API 實測非法值全部 400，合法 1／500 均 200；全腳本 17/17，資料全清理 | 正式部署後重跑非法／合法 limit、未付款名單及稽核，確認 1–500 範圍一致 | **隔離複驗通過；正式站／UI 待驗**，已回報 X-PM；不涉及商業規則 |
| QA-FS-M8／minor | Ego Lite 本機會員登入頁使用 QA 信箱＋錯密碼，API 錯誤透傳成英文 `Invalid login credentials`；中文站其他文案為中文 | 錯密碼與帳號不存在都顯示一致中文訊息，維持 4xx 且不洩漏帳號是否存在；Ego UI 與直接 API 複驗 | 已送 X-PM；不涉及商業規則 |
| QA-FS-M9／minor | Ego Lite 用有效結構、已過期 QA JWT 打開 `/member`：頁面顯示登入過期，仍留 token、FREE／0 點／待啟用及功能入口，無重新登入連結；測後清除測試 token | 過期／失效 token 清除並導登入或顯示明確登入按鈕，不呈現假帳務空狀態；Ego UI 對過期／錯誤／有效 JWT 複驗 | 已送 X-PM；不涉及商業規則 |
| QA-FS-M10／minor | 具名管理員 GET `/api/admin/orders?id=` 後接非 UUID、SQLi 形狀或 10,000 字，三者均 500；合法未知 UUID 404，隔離帳務唯讀腳本 8/11，資料全清理 | 先驗 UUID 格式與長度，非法值 400 或一致 404，不查 DB、不回 500；重跑同腳本 11/11，確認清單與詳情未受影響 | 已送 X-PM；不涉及商業規則 |
| QA-FS-M11／minor | 原缺陷：兩筆報名、`limit=1` 時摘要誤為 1。修補 `48cd357` 後隔離 API summary.total/pendingContact=2/2，DB=2/2；全腳本 17/17，資料清理 | 正式部署後驗 `limit=1`／預設／500 及 contact_status filter，摘要與完整篩選集合一致 | **隔離複驗通過；正式站／UI 待驗**，已回報 X-PM；摘要範圍已由程式註明 |
| QA-FS-M12／minor | 獨立本機 DB 9 筆服務先下架 1 筆，API 正確由 9→8；全部 `is_published=false` 後 DB 公開筆數 0，API 卻從 `content/services.json` 回 9 筆；腳本 exit 1、原旗標已還原 | 成功查庫但全部下架時公開清單應空；僅 DB 故障／表未建時 fallback。驗部分下架、全下架、空資料與故障備援，腳本轉綠且旗標清理 | 已送 X-PM 排工；不涉商業規則取捨，正式內容未改 |
| QA-FS-M13／minor | 隔離 CMS 管理 API：POST `is_published:"false"` 回 201、DB true；測試列重設未上架後，PATCH 同值回 200、DB false→true。真正布林上架／下架通過，腳本 2/4，fixtures/audit 清 0 | 僅接受 JSON 布林 true/false；字串／數字／null 等錯型 400、無發布副作用，正常布林與具名 audit 仍正確；同腳本 4/4 並擴驗 promo.active | 已送 X-PM 排工；不涉及商業規則，正式內容未改 |

另有待驗限制：Supabase Auth custom SMTP 未接；奇門老師未簽核且晚子時規則待確認；Council 備援真實失敗、AI 提示遵循與瀏覽器斷線找回未實測；後台字級及手機版未看實際畫面。這些不應被「build 通過」取代。

## 測試總結

- **BLOCKER：**QA-FS-B1（AI 問答並發免費回覆）待修；QA-FS-B2（啟用碼並發重複發點）本地修補、route 測試與隔離 API/DB 獨立複驗通過，但正式站 migration 尚未套用、部署回歸未完成。
- **Critical：**QA-FS-C1 發票退款一致性待營運規則確認；QA-FS-C2 管理員補扣點帳本不一致；QA-FS-C3 10/07 刷卡回報與本站帳務資料無法對應；QA-FS-C4 隔離庫 20 輪通過、正式 migration／站端未驗；QA-FS-C5 停用推廣人歸因待商業決策；QA-FS-C6 單／雙管理員 N=10 隔離庫各 11 輪通過，UI／正式站未驗；QA-FS-C7 推廣人建立／並發改率 audit 隔離庫 11 輪通過、正式站未驗；QA-FS-C8 route 單元與隔離 paid 訂單 API 各 7/7 通過、合法 ezPay／正式站未驗；QA-FS-C9 加購後會員摘要可能讀失效舊 0 點，保留 VIP 的 DB 修補已提交；QA-FS-C10 拆分退款全額後仍留 1 點待修；QA-FS-C11 過期權益排程有候選時回 500 待修。跨會員越權測試仍未涵蓋所有表與 RPC，暫不宣告全系統通過。
- **Minor：**QA-FS-M1 預約無效電話已實測、限流待判定；QA-FS-M2 面相知識庫 RLS 本機 SQL 複驗通過，待正式 migration；QA-FS-M3 預約雙送產生兩筆；QA-FS-M4 超長方案碼本地修補及隔離複驗通過，待正式站；QA-FS-M5 雙送建兩張 pending 訂單；QA-FS-M6 後台預約列表 limit 隔離複驗 11/11，待正式站；QA-FS-M7/M11 課程列表 limit 與摘要修補後隔離複驗 17/17，待正式站／UI；QA-FS-M8/M9 會員登入訊息與過期 token UI 待修；QA-FS-M10 後台非法訂單 id 8/11；QA-FS-M12 公開 CMS 全下架仍顯示舊內容；QA-FS-M13 CMS 字串 false 誤上架。M3/M5 待去重規則決策。
- **已驗收通過的範圍：**本機建置、TypeScript、589 個通過的單元案例（另有 2 個 expected fail）、21 項安全 API 冒煙、219 個後台匿名／無效 bearer／有效會員拒絕、5 個正式站 cron GET 匿名拒絕、11 張表匿名讀取抽樣、隔離庫 A/B 核心會員、訂單、發票、課程報名、使用量、面相報告與 Council 歷史跨會員讀取、會員訂單／使用量 API 11/11、直接寫入封鎖及過期 JWT、B2 原子兌碼隔離複驗、C4 clean DB 四情境 20 輪回歸、C6 同卡 N=10 單／雙管理員各 11 輪、C7 並發改率 audit 11 輪、C8 route 單元與隔離 paid 訂單非法輸入 API 各 7/7、M4 超長方案碼及內部方案 code／ID 隔離 9/9、預約邊界 7/7、具名管理員預約 11/11、建立啟用碼 13/13、課程跟進正常流程 10/10、課程結帳 8/8、註冊／同手機試用／refresh／忘密回應 9/9，以及正式站 8 頁手機寬無水平溢出與預約空表單提示；Council 先前正式站的並行／schema／日限額有交接證據。
- **整體結論：**全系統 UAT 尚未完成，正式驗收不可簽核。下一批優先驗證會員／金流／RLS 的隔離環境端到端流程，並複驗 X-PM 回傳的修復。

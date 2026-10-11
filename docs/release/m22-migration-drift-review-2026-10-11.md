# M22 release：正式 migration drift 一頁審查表（唯讀）

日期：2026-10-11｜候選：/private/tmp/xunfeng-face-release-m22，HEAD 15631e7｜正式 linked ref：pvasgmmjrodukudbzuhp
範圍：只讀 CLI migration list、Supabase schema_migrations 中來源名稱/長度/指紋、catalog/ACL SELECT，以及候選 SQL。本次無 secrets 輸出、無正式 DDL/DML/repair/db push/deploy。

## 版本逐項對照

| 正式 remote-only | 候選 candidate-only 對照 | 判定 | 正式現況 / 審核註記 |
|---|---|---|---|
| 20260905021553 trial_phone_claims | 20260905100000 trial_phone_claims | 已證等價 | 存檔 SQL source；保留函式本文、移除註解與外部空白後指紋一致。正式 trial_phone_claims 與 grant_signup_trial 存在。勿重播。 |
| 20260905023345 paid_entitlement_atomic | 20260905120000 paid_entitlement_atomic | 已證等價 | 正式 7-arg commit_paid_entitlement 存在；正規化 source 指紋一致。勿重播。 |
| 20260905025313 single_report_addon | 20260905140000 single_report_addon | 已證等價 | 正式 plans.is_addon 與 7-arg commit_paid_entitlement 存在；指紋一致。勿重播。 |
| 20260905031253 manual_refunds | 20260905160000 manual_refunds | 衝突 | refunds、preview RPC、6-arg commit RPC 均存在，但候選與正式存檔 SQL 指紋不同（函式本文有差異可能）；候選重播會重建/覆蓋退款邏輯。先由 Tech Lead 做逐句 diff，未核准不得跑或用新版本冒充等價。 |
| 20260908123633 face_report_pdf_bucket | 20260908120000 face_report_pdf_bucket | 已證等價 | 正式 face-analysis-reports bucket 存在；正規化 source 指紋一致。勿重播。 |
| 20260911080921 course_registration_followup | 20260911090000 course_registration_followup | 已證等價 | 正式三個 follow-up 欄位存在；正規化 source 指紋一致。勿重播。 |
| 20260921133000 cianrou_automatic_booking_reminders | — | 未證 | SQL 可由遠端 schema_migrations.statements 讀取（10 statements；無 rollback source），但不在 Xunfeng 候選；保留 remote-only，不匯入或操作 CianRou schema。 |
| 20260921133100 cianrou_line_only_customer_phone_nullable | — | 未證 | 遠端 statements source 可讀（3 statements；無 rollback source），候選無對應檔；保留 remote-only，不匯入或操作 CianRou schema。 |
| 20260923015611 council_provider_calls | 20260923100000 council_provider_calls | 已證等價 | 正式 view 存在；正規化 source 指紋一致。勿重播。 |
| 20261007141734 council_inflight_slot | 20261007100000 council_inflight_slot | 已證等價 | 正式 table 與 acquire/release RPC 存在；正規化 source 指紋一致。勿重播。 |
| 20261007155510 qimen_signoffs | 20261007120000 qimen_signoffs | 已證等價 | 正式 qimen_signoffs 存在；正規化 source 指紋一致。勿重播。 |
| — | 20261012010000 M19 face_analysis_delete_once | 衝突 | 正式 redact_face_analysis_run(uuid,uuid) 已存在且 ACL anon/auth=false、service_role=true，但現有 function body 不含「already deleted」拒絕條件；M19 是有意修補現存 RPC，不可視為已等價。 |
| — | 20261012020000 C19 ai_documents_atomic_audit | 未證 | ai_documents/admin_audit_logs 存在且 service_role 所需表權限存在；create/update/delete AI document audit RPC 均不存在，需按依賴 review 新增。 |
| — | 20261012030000 M21 face_upload_claim_lease | 未證 | face_analysis_runs 缺 upload_claim_token、upload_claimed_at；candidate migration 前置欄位尚未存在。 |
| — | 20261012040000 M22 face_upload_result_atomic | 未證 | face_analysis_events 存在；record_face_upload_result 簽章與 overload 均不存在，且依賴 M21 lease 欄位。 |

## 判定方法、history 與安全候選順序

- 正式 history 49 版，候選 51 版；交集 38、remote-only 11、candidate-only 13。八組「已證等價」有遠端 statements source 與候選 SQL；以保留 $$ 函式本文、去 SQL 註解與本文外空白的正規化指紋比對相同，且對應正式目標物件存在。此證明的是 source 等價及目前物件存在，不等於證明歷史 backfill 每筆資料都相同。
- 退款 migration 指紋不符且有財務 RPC 差異，故為明確衝突；不要執行 20260905160000，也不要把它單純 repair 為 applied。先比對 remote statements 與候選退款 SQL，確認是否已由後續正式版本涵蓋，再另交 Tech Lead 核准。
- CianRou 兩條 migration 的 SQL source 在遠端 metadata 可取得，但本候選無本機 SQL，remote-only 不等於 Xunfeng release 工作；保留遠端紀錄與 schema，取得負責方確認前不移除、不匯入。
- 建議先凍結本候選/49-row history snapshot；Tech Lead 審核退款差異與 CianRou 所有權。八個已證 source 對應版本不可再次執行；其 history 對映/repair 僅可另經核准決定，不先批次 repair。禁止 broad db push。
- Drift gate 通過後，逐版執行並立即驗後（使用核准的受控 migration runner，不跨版續跑）：20261012010000 M19 → 20261012020000 C19 → 20261012030000 M21 → 20261012040000 M22。每版驗版本記錄、物件/簽章、RLS/ACL；M19 已存 function ACL 必須維持 anon/auth=false、service_role=true；C19 audit/write RPC、M21 lease 欄、M22 atomic RPC 均需核實 service_role 可用而 anon/authenticated 無權。任何差異即停止。history reconcile 用獨立核准步驟，不以插入 history 取代 SQL/ACL 驗證。

## 證據與限制

- Release 審查文件：`docs/release/qa-fs-m22-review-2026-10-11.md`；本表由工程1唯讀盤點後納入審查附件。
- 版本與 SQL：supabase migration list --linked（只讀）；遠端 supabase_migrations.schema_migrations 的 version/name/statements metadata；候選上述 worktree 的 supabase/migrations。未讀取/輸出原始 migration SQL 作為報告內容，僅計算指紋。
- 正式 catalog：相關表/欄位、函式存在與 M19/C19/M21/M22 ACL/依賴皆以 SELECT 查詢。本次未重播任何 SQL，未觸正式 DB 寫入。
- 下一 gate：Tech Lead 簽核「退款 SQL 差異」「CianRou remote-only 保留方式」「8 個相同 SQL 版本如何維持 CLI history 一致」及 recovery plan；通過前不得做 history repair、定向套用或 db push。

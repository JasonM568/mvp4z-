# QA-FS-M24：會員刪除面相照片的跨儲存失敗復原

**嚴重度：critical**　**狀態：X-PM 已接受並派工程1；候選 full-schema SQL 隔離複驗通過，真 Supabase Storage／HTTP 與正式站仍待驗**

## 獨立複驗準備

QA-owned RPC harness 已建立於 `scripts/qa-m24-image-delete-recovery.test.ts`，設定為 `scripts/qa-m24-image-delete-recovery.vitest.mts`。它以 `QA_M24_ROOT` 指向候選，經實際 DELETE route 呼叫 RPC／Storage stub，覆蓋 finalize fault 後同 operation retry、row/event 原子失敗後 retry、N=20＋重送僅一 event、Storage fault 釋放 claim、credits／ledger 不變，以及 401／跨會員404／analyzing409／已刪200。新版候選 `3412b4993a354c50934f356e0396ad3dadf8b942` 將 migration 改為唯一版號 `20261012050000`；stub harness 對此 SHA **5/5**，TypeScript 通過。這是 route/mock preflight，**不列為 SQL/ACL、正式 DB 或 Storage 通過**。尚待工程提供 M19/C19/M21/M22/M24 clean replay 證據；真 Storage 健康前不做 Storage 10 輪。

## 重現範圍

路由：`DELETE /api/face-analysis/runs/{id}/image`。只用自有 run、合成照片；不可使用正式會員或正式 DB。QA route＋in-memory Storage/DB 替身腳本：`scripts/qa-face-member-image-delete.test.ts`（獨立設定 `scripts/qa-face-member-image-delete.vitest.mts`），8/8 通過。

### 情境 A：Storage 已刪，DB finalize 失敗

1. 建立 `status=completed`、`storage_path` 指向私有合成照片、`image_deleted_at=null`、`deletion_pending=false` 的專用 run。
2. 注入 Storage remove 成功，DB 第二階段 update 回錯誤。
3. 觀察首次 HTTP 與 run／Storage／event 狀態；移除故障後對同 run 重送 DELETE。

預期：系統應能收斂為 `storage_path=null`、`image_deleted_at` 有值、`deletion_pending=false`，只產生一次刪除事件；重送回成功或明確可復原狀態。

替身實際：首請求 500；照片物件已刪，但 row 仍保留原 path、`image_deleted_at=null`，且 `deletion_pending=true`。故障解除後重送 409，Storage 不再呼叫、event 仍 0；目前 claim 沒有路由內復原分支。

### 情境 B：DB 與 Storage 已清，audit event INSERT 失敗

1. 使用同型態專用 run，令 Storage remove、DB finalize 成功，注入 `face_analysis_events` INSERT 失敗。
2. 移除故障後對同 run 重送 DELETE，核對 response、DB、Storage、event。

預期：成功刪除須留一次可追溯事件；若事件持久化失敗，需明確、可重試地補記，不應讓使用者收到可重複誤判的失敗結果。

替身實際：首請求 500，但照片已刪、DB path 清空且 claim 釋放，event 0；重送 200，仍不補事件。結果是操作已成功但稽核永久缺失，且首次回應誤報失敗。

## 影響與驗收標準

情境 A 會卡住會員重試，並留下已不存在物件的 DB path，直到其他清理流程介入；情境 B 會遺失會員主動刪除的 audit。兩者觸及照片刪除／稽核完整性，列 critical，隔離替身結果尚非真 DB／Storage 證據。

修復後須在專用 Supabase DB／Storage 對上述兩種故障各跑至少 10 次：照片實際存在→故障注入→檢查 HTTP、DB、Storage、event；解除故障→同 run 重送或執行明確補償→狀態收斂、無永久 `deletion_pending`、storage path 不指不存在物件、刪除事件恰 1；同時驗匿名 401、跨會員 404、analyzing 409、已刪冪等 200。每輪 Auth/profile/run/event/object/trigger 清 0，並對成功流程做一次回歸。

## 證據限制

本 QA 只在替身驗證路由控制流程；真 Storage/DB 故障注入尚未執行。全系統隔離 Storage stack 曾因 Storage health check 失敗而中止，不能把替身結果當作正式產品實測。正式 DB 不可注入故障。

## 最新候選 preflight（2026-10-11）

候選 worktree `/private/tmp/xunfeng-m24-face-image-delete-recovery` 現為 clean HEAD `3412b4993a354c50934f356e0396ad3dadf8b942`，含 `7d9f285` 後續版號調整。QA 以該 SHA 重跑自有 route/RPC/Storage stub harness **5/5**；另將候選 commit 匯出至一次性副本並連接既有依賴，候選 route／Storage 單元測試 **6/6**。一次性副本已清除，工程 worktree 未修改。

候選 migration 檔名為 `20261012050000_face_image_delete_recovery.sql`。此 branch migration 目錄只含 M24 這份 `20261012*` migration；M19/C19/M21/M22 整合 migration 不在此候選樹內，因此本次只核對版號安排，**沒有 clean replay／整合順序證據**。依 X-PM 指示，本次未操作 C4 或任何共用 DB/Storage。工程診斷的候選隔離 stack 曾 Storage OOM exit 137；另有既存 `xunfeng-qa-isolated-20261011` stack 回報 Storage container healthy 且 GET `/storage/v1/status`=200，但目前無法證實它的 fixture 已清空、是否正供其他測試使用或其唯一 owner，故不拿它做 M24 故障寫入或停機。真 DB/Storage 10 輪仍未驗。候選 6/6 與替身 5/5 不解除 M24 critical gate。


## 2026-10-12｜M24 full-schema SQL 候選獨立複驗

候選 `/private/tmp/xunfeng-m24-full-schema-test` HEAD `85ba785ae7c971654cb17e38c846ff52beba3b62`，clean worktree；本 SHA 新增 guarded test，未改 M24 route／migration。QA 自有 `scripts/qa-m24-full-schema-local.sh` 以 native PostgreSQL 16.14 建兩個全新 disposable cluster，Unix socket／停用 TCP；每次依序執行候選 54 個 migration SQL，並記錄 54/54 unique versions。為原生 PG 補最小 `auth`／`storage` schema 與 Supabase API roles；這不是 Supabase CLI stack，也不是實際 Auth／Storage service。兩個 fresh DB 均通過 guarded `face_image_delete_recovery_full_schema.sql`：history 與 M19→C23 尾序 guard、anon/authenticated/service_role RPC ACL、RLS/grants、event INSERT 與 finalize UPDATE 故障各自原子回滾、解除故障後 retry `deleted`、重送 `already_deleted`、event 恰 1。QA run/event/profile fixtures 0；one-use marker 1，整個 DB 隨 cluster 刪除。

另以 `QA_M24_ROOT=/private/tmp/xunfeng-m24-full-schema-test` 執行 QA route/RPC stub harness **5/5**；候選副本 `tsc --noEmit` 通過。工程候選、正式 DB 與 C4 未修改。

**證據邊界：**這是 native PG 上全 migration SQL replay 與 Supabase schema/role compatibility shim，不是 Supabase CLI migration replay；沒有 HTTP、真 Storage object／remove fault、Auth 或部署後回歸。既有 route 替身的「Storage/DB 故障」仍非真服務故障。M24 保持 critical，不能由本輪 SQL 結果單獨結案；Storage service 可安全重現且健康後，仍需獨立執行票上的 A/B 故障、權限、冪等和 fixture 清理驗收。

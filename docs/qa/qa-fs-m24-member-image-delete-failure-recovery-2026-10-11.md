# QA-FS-M24：會員刪除面相照片的跨儲存失敗復原

**嚴重度：critical**　**狀態：X-PM 已接受並派工程1；待候選與隔離真 Storage／DB 複驗**

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

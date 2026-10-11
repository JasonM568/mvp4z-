# QA-FS-C22：面相 provider approval／撤銷缺 audit

**嚴重度：critical**　**狀態：候選 `a98d7ad66a05a7098f27e46afdc7e324583f372e` 隔離 DB／route 複驗通過；未部署，HTTP 整合／正式站 gate 未結**

## 範圍與證據

路由：`POST`／`DELETE /api/admin/face-provider-approval`（OpenAI 零資料保留核准）。兩個 handler 先 upsert active attestation 或更新為 revoked，再呼叫共用 `writeAdminAudit`；該 helper 忽略 Supabase insert 回傳的 error。

QA route＋記憶體 DB/audit 替身腳本 `scripts/qa-admin-policy-audit-failures.test.ts` 中的兩案例通過；最新重跑整體 C21/C22 suite **5/5**。注入 audit INSERT error 後，POST 仍 HTTP 200、approval active 且 `verified_by` 已寫但 audit 0；DELETE 仍 HTTP 200、approval 已 revoked 但 audit 0。這是**route／替身證據**，沒有連真 DB，也沒有呼叫 OpenAI 或驗證實際供應商保留設定。

## C22 候選獨立複驗

- 候選 `/private/tmp/xunfeng-c22-provider-approval`，HEAD `a98d7ad66a05a7098f27e46afdc7e324583f372e`，分支 `fix/c22-provider-approval-atomic-audit`，clean tree；未改工程候選。
- QA 一次性來源副本重跑 `route.c22.test.ts`：**8/8** 通過，涵蓋 GET、具名管理員、正常 approve/revoke、錯誤 RPC 回 500、false attestation／未來日期／token-like note 400 且不觸 RPC、401/403。`npx tsc --noEmit` 通過。此層仍是 route unit stub。
- QA 自有 DB-only Supabase stack 從空 DB replay **55/55 migrations**，history count/distinct 55/55，尾版 C22 `20261012080000`。`face_provider_approval_atomic_audit.sql` 連真 PostgreSQL 執行 **10/10**（每輪完整正常 approve/revoke/reapprove/update、相同輸入重送 no-op、audit INSERT fault rollback、null/non-admin actor 拒絕、function/table ACL/RLS assertion），每個 SQL test 以 rollback 清 fixture。
- QA-owned `scripts/qa-face-provider-approval-c22-concurrency-local.sh` 對同一 approval 做 N=2 並發 **10 輪**：每輪恰好一個 `changed=true`、一個 `changed=false`，active approval 1、audit 1，逐輪刪除；最後 approval/profile/audit fixture 均 0。該腳本拒絕非指定本機 DB URL／project marker。
- 測試 stack 與來源副本已停止／刪除；未使用 Auth／REST HTTP、未呼叫 OpenAI。故障回滾與競態是 DB function 證據，不是 `POST/DELETE` HTTP 整合測試；正式 ZDR 設定或供應商行為亦未驗。

重跑併發腳本時，先在專用 DB-only stack 設好 project id `qa-c22-independent-20261012`、DB port `59841`，再執行：

```sh
QA_C22_DISPOSABLE_PROJECT=qa-c22-independent-20261012 \
QA_C22_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:59841/postgres' \
bash scripts/qa-face-provider-approval-c22-concurrency-local.sh
```

## 影響與驗收

供應商資料保留核准與撤回缺少可追溯操作紀錄，無法由 audit 還原誰在何時核准／撤銷。修復需使狀態與 audit 原子化或採可補償的 durable outbox；若 audit 暫失，API 與管理畫面需顯示待處理，且重送不可重複建立核准或錯誤恢復已撤銷狀態。

隔離驗收：POST／DELETE 各 10 輪正常及 audit 故障；故障後狀態可查明、補記只一筆、重送冪等；匿名 401、會員 403、共用 `ADMIN_KEY` 拒絕（此路由使用 `requireNamedAdmin`）、無效 attestation／未來日期／疑似 token 字串 400；Auth／approval／audit fixture 清 0。只使用專用隔離資料，不呼叫 provider。

## 證據限制

替身只證明 route 控制流和 helper 的錯誤處理，不證明真 DB、供應商核准或外部行為。正式環境不得故障注入。無需變更商業規則或現行具名管理員授權。

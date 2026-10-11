# QA-FS-C22：面相 provider approval／撤銷缺 audit

**嚴重度：critical**　**狀態：已送 X-PM 定序／派工；待候選與隔離複驗**

## 範圍與證據

路由：`POST`／`DELETE /api/admin/face-provider-approval`（OpenAI 零資料保留核准）。兩個 handler 先 upsert active attestation 或更新為 revoked，再呼叫共用 `writeAdminAudit`；該 helper 忽略 Supabase insert 回傳的 error。

QA route＋記憶體 DB/audit 替身腳本 `scripts/qa-admin-policy-audit-failures.test.ts` 中的兩案例通過；最新重跑整體 C21/C22 suite **5/5**。注入 audit INSERT error 後，POST 仍 HTTP 200、approval active 且 `verified_by` 已寫但 audit 0；DELETE 仍 HTTP 200、approval 已 revoked 但 audit 0。這是**route／替身證據**，沒有連真 DB，也沒有呼叫 OpenAI 或驗證實際供應商保留設定。

## 影響與驗收

供應商資料保留核准與撤回缺少可追溯操作紀錄，無法由 audit 還原誰在何時核准／撤銷。修復需使狀態與 audit 原子化或採可補償的 durable outbox；若 audit 暫失，API 與管理畫面需顯示待處理，且重送不可重複建立核准或錯誤恢復已撤銷狀態。

隔離驗收：POST／DELETE 各 10 輪正常及 audit 故障；故障後狀態可查明、補記只一筆、重送冪等；匿名 401、會員 403、共用 `ADMIN_KEY` 拒絕（此路由使用 `requireNamedAdmin`）、無效 attestation／未來日期／疑似 token 字串 400；Auth／approval／audit fixture 清 0。只使用專用隔離資料，不呼叫 provider。

## 證據限制

替身只證明 route 控制流和 helper 的錯誤處理，不證明真 DB、供應商核准或外部行為。正式環境不得故障注入。無需變更商業規則或現行具名管理員授權。

# QA-FS-M23 design candidates — orphaned private face uploads

**For:** Tech Lead decision · **Basis:** QA evidence commit `038f20e`, M22 candidate `15631e7` read-only review · **Status:** design only; no prototype/migration/code changes.

## Problem and boundaries

QA reproduced an event INSERT failure followed by Storage remove failure. The first upload returns 500 with run `created`, `storage_path=NULL`, no event, claim released, attempt 1, and one private object. With the same extension, attempts 2–5 return 409 on the fixed `source.<ext>` plus `upsert:false`; request 6 returns 429. This is an unreferenced private-photo retention risk and same-run recovery failure, not evidence of public exposure. M22's run/event DB transaction remains atomic.

The M21 route increments `upload_attempts` when claiming, before quality/storage persistence. Neither candidate below silently decrements or resets this counter. Whether infrastructure failures should consume a quality-check attempt is a separate PM decision and remains a release gate if QA requires those failures not to exhaust the limit.

## Candidates

| | A. Durable per-attempt upload ledger + immutable object key (recommended) | B. Fixed key + restricted single-run reconciler/manual cleanup |
|---|---|---|
| Flow | After image normalization/quality check, persist an upload-intent row before Storage, keyed by `claim_token`; object key includes that token, e.g. `{profile}/{run}/attempts/{claim}/source.png`. Final service RPC atomically attaches `storage_path`, writes the quality event, and marks the intent attached. If it fails, the earlier intent survives; successful compensation marks it cleaned; failed compensation leaves a retryable pending row. | Keep `{profile}/{run}/source.<ext>`. An admin-only dry-run locates exactly one unreferenced object under a specified run. A confirmed cleanup records an append-only cleanup intent/result and removes only that key after server-side rechecks. No automatic deletion. The upload route continues returning 409 on collision until cleanup succeeds. |
| DB / Storage access | New private ledger table: RLS on, no client policies, revoke PUBLIC/anon/authenticated table access, grant only required DML to `service_role`; service-only RPCs, preferably invoker with explicit table grants. Storage bucket remains private; no client `storage.objects` policy. API never accepts an arbitrary cleanup path. | Same private bucket and client-deny policy. Cleanup endpoint requires a named admin and immutable cleanup audit/intent; only server `service_role` lists/removes. Recheck exact profile/run and current run pointer immediately before removal. |
| Old worker / claim races | Unique key per claim prevents an old worker from deleting a newer attempt's object. Cleanup worker acts only on pending intent older than lease TTL + route max duration + safety margin, claims that intent, and rechecks run pointer/claim before deleting. A newer successful run points to a different key, so old cleanup cannot remove it. Keep the 2-minute claim lease unchanged. | Fixed key cannot distinguish old/new object ownership. Must wait past the 2-minute lease + 30-second max duration and margin, require no active claim, and serialize cleanup against upload claim with a DB CAS/lock. Otherwise cleanup can remove a newly written object or a stale worker can recreate the key. This is harder to prove. |
| Observability | Durable states such as pending/uploaded/attached/cleanup_pending/cleaned plus attempt count, timestamps, sanitized last error; alert on oldest pending age and repeated failures. Never store signed URLs or image bytes in the ledger/logs. | Durable cleanup intent/result rows and structured alert logs; periodic dry-run scan needed because the original failed request may not have left a cleanup row. Detection depends on enumerating run prefixes and Storage list pagination. |
| Human runbook | Usually retry the exact pending intent automatically after a grace period. Manual fallback verifies run, pointer, claim, intent, and exact object; one-key removal only. | Operator runs dry-run for one profile/run, checks `storage_path IS NULL`, allowed run status, no successful event, no current claim, and no DB row referencing the exact object. Wait at least 150 seconds after the last request; show exact key/size/modified time; then separately approve `remove([exactKey])`. Never delete a prefix or `report.pdf`. Recheck absence and DB state. |
| Migration / rollback | Additive ledger migration and service-only RPC grants; no data backfill. New storage-path validator must accept both legacy `source.ext` and attempt-scoped keys. Rollback must retain readers for attempt-scoped keys and the ledger until all pending rows resolve; reverting to old route code after a new key is attached is unsafe. | Smaller additive audit/cleanup schema plus route. No path format change and easier code rollback, but fixed-key races and manual response time remain. Keep cleanup records; do not drop while unresolved orphan rows exist. |
| Cost / trade-off | Higher implementation and Storage/listing complexity; recurring small DB row per eligible upload and a scheduled reconciler. Best automatic recovery and fencing. | Lower automation cost, but recurring operator work, slower recovery, difficult race proof, and risk that scans miss orphans. Good emergency fallback, weaker primary fix. |

## Recommendation

Ask Tech Lead to choose **A** for M23: it makes every Storage object attributable to one claim, retains a durable cleanup record before the external write, and prevents a stale worker from deleting a later attempt's object. Keep a dry-run/manual single-key procedure as break-glass fallback. Do not use `upsert:true`, prefix-wide deletion, or silent attempt reset.

A does not make Postgres and Storage one atomic transaction. The durable intent makes the cross-service gap observable and retryable; the reconciler still needs fencing, grace period, idempotent exact-key removal, and alerts. QA must prove an old worker's cleanup cannot delete a newer key.

## Required acceptance before M22 release

1. Event INSERT fault + successful Storage remove: run/path/event consistent, intent closed, object absent; same run can retry subject to approved attempt semantics.
2. Event INSERT fault + Storage remove fault: run remains created/path NULL/event 0; exact intent remains pending and object remains private. Reconciler retries/removes only its key; no attempt counter reset.
3. Stale worker A vs newer claim B: A's failed RPC/compensation cannot delete B's object; B can commit run+event once. Exercise delayed upload, delayed RPC, cleanup retries, and repeated cleanup.
4. Normal quality reject/pass, N=2 CAS, stale lease recovery, A/B authorization, no credit/ledger changes, and zero fixtures after cleanup.
5. ACL matrix: anon/authenticated cannot read/write ledger or invoke RPC; service_role has only documented operations; no client Storage policy. Verify legacy stored `source.ext` and new key previews, PDF paths, and deletion.
6. Observability and runbook drill: pending-age alert, sanitized logs, dry-run count/path, one-key confirmation, post-delete verification, and stop conditions.

## Decisions still needed

- Whether valid-image infrastructure failures consume `upload_attempts`. This design preserves current counting and never auto-resets it; if product wants system failures excluded, approve that policy separately and define how to distinguish a quality inspection from an infrastructure failure.
- Reconciler schedule/grace period and accountable on-call owner for failed deletion.
- Whether deployments may use attempt-scoped Storage keys; if rejected, choose B and accept the manual-recovery delay/race controls.

No formal DB access, migration, Storage mutation, or candidate worktree modification occurred. M22 release remains gated until the chosen implementation passes isolated QA.

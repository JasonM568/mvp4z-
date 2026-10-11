# M22 upload event + Storage compensation double-failure review

**Scope:** local code review and disposable route fault-injection stub only. No Supabase connection, no formal data access, no candidate changes.

## Reproduced path and state

Reviewed candidate commit `15631e7` (`fix/m22-face-upload-event-atomic`) in `/private/tmp/xunfeng-face-release-m22`.

1. A valid normalized PNG claims the run first: `upload_attempts` increments and the claim token/time are stored. This claim is a separate update before Storage/RPC.
2. Storage writes the deterministic key `{profileId}/{runId}/source.png` with `upsert:false`.
3. The `record_face_upload_result` RPC updates the run and inserts its event in one DB transaction. Injected event INSERT failure rolls back both RPC writes.
4. Injected `deleteRunImage` failure is swallowed by `.catch(() => false)`. Route returns 500; `finally` clears the matching claim, while the earlier attempt increment remains committed.

Disposable route test with stateful DB/Storage stubs passed 1/1. After the first request the snapshot was: HTTP 500; run `created`, `storage_path=NULL`; events 0; Storage object present; claim/token/time cleared; attempts 1. The disposable test worktree was removed after the run.

Retrying the same normalized image type claims again, so attempts become 2. Storage `upsert:false` sees the existing deterministic object and rejects before the RPC; claim is cleared in `finally`, DB path/event remain unchanged, and attempts remain consumed. Supabase Storage SDK exposes an HTTP error status as `StorageApiError.status`; the route's `errorStatus()` maps a duplicate response with status 409 to HTTP 409. The controlled retry stub used that SDK-shaped status and the route returned 409. The actual hosted Storage response was not called in this test.

**Conclusion:** for the same normalized extension the run is blocked until the exact orphan object is removed; it is not a DB-state 409 from the claim/RPC. The storage duplicate 409 happens before the RPC. A different normalized extension maps to a different `source.*` key and may progress, but leaves the original orphan. Repeated same-key attempts consume the five-attempt budget; at 5, route returns 429 before trying Storage. If attempt budget is exhausted, storage cleanup alone does not restore upload eligibility; do not reset the quality-check counter without separate product/Tech Lead approval.

## Proposed manual single-object recovery (review only; not executed)

**Dry-run checks; stop if any check fails:**

- Identify exact `profile_id` and `run_id` from the isolated QA fixture. Read only that run's `status`, `storage_path`, `deletion_pending`, `upload_claim_token`, `upload_claimed_at`, and `upload_attempts`.
- Require `status IN ('created','quality_rejected')`, `storage_path IS NULL`, `deletion_pending=false`, and no claim token/time. Wait at least 150 seconds after the last failed request (2-minute M21 stale lease plus 30-second route max duration) and ensure no new request is running, so a stale worker cannot still touch the same key.
- Compute the one expected key from the exact profile/run UUIDs and observed normalized extension (`jpg|png|webp`). List that exact run prefix in the private face-analysis bucket and require exactly the expected object. Check `face_analysis_runs` has zero rows referencing the exact key and no successful upload event exists for this run. Do not use prefix-wide deletion or include `report.pdf`.
- Require `upload_attempts < 5` for retry. If it is already 5, stop and use a new run or obtain a separately approved recovery decision; do not lower the counter as routine cleanup.

**Only after explicit operator approval:** call Storage remove with a one-element array containing the validated exact object key. Then verify that exact object is absent, the run remains unpointed (`storage_path=NULL`), and no run/event/credit state changed. Fix the event INSERT cause before retrying; retry only after all checks still hold. Preserve the isolated QA evidence and record the cleanup result without logging credentials or signed URLs.

## Assessment / Tech Lead decision

Recommend a separate critical recoverability/privacy ticket rather than silently expanding M22: a dual failure can leave an unreferenced private face image and can block same-format retries while consuming the limited attempt counter. The object is not publicly served by the run APIs when `storage_path` is NULL, but it remains stored and requires exact-path cleanup. Candidate solutions for review include a durable cleanup/outbox record or a narrowly scoped orphan reconciler with a grace period, exact run/profile ownership checks, claim fencing, dry-run report, and auditable one-key deletion. Do not add an automated prefix purge or counter reset without review.

No direct edit was made to M22 or its tests. Candidate worktree remained clean; the disposable fault-probe worktree was removed.

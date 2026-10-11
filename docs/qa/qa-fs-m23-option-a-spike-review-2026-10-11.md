# QA-FS-M23 Option A spike review

Date: 2026-10-11
Candidate: `/private/tmp/xunfeng-m23-spike`, HEAD `42175c1e00e3d8f12de4ee4e413852961de544b1`
Base: M22 `15631e7`
Disposition: feasibility evidence only; neither M23 nor M22 is approved as a formal release by this review.

## Scope and safety

Read-only review of the candidate source, SQL draft, and design note. Re-ran its focused Vitest files from a disposable QA copy at `/private/tmp/xunfeng-m23-qa-copy`; the engineering worktree was not changed. No database, Supabase Storage, production account, C4 shared stack, or real image was used. The temporary QA copy uses the main repository's existing `node_modules` symlink.

Command:

```sh
./node_modules/.bin/vitest run 'app/api/face-analysis/runs/[id]/upload/route.m21.test.ts' lib/face-analysis/storage.m23.test.ts
```

Result: 2 test files passed, 11 tests passed, 0 failed (Vitest 4.1.10, 275 ms).

Independent QA boundary rerun against the same candidate SHA:

```sh
QA_M23_SPIKE_ROOT=/private/tmp/xunfeng-m23-spike npx vitest run --config scripts/qa-m23-option-a-spike.vitest.mts
```

Result: 1 test file passed, 3 tests passed, 0 failed. The QA-owned route/storage stub confirms the double-failure state, preserves an attached object after an ambiguous RPC response, isolates stale worker A cleanup from worker B, and accepts a legacy fixed path for preview while rejecting traversal. The candidate route and storage helper in the disposable QA copy match the files at the reviewed SHA. This remains in-memory route/helper evidence; it adds no SQL, ACL, database persistence, or real Storage proof.

### Additional independent verification

Re-ran both candidate focused suites from a one-time `git archive` source copy, linked to the existing repository `node_modules` without editing the engineering worktree:

```sh
vitest run --config vitest.config.mts 'app/api/face-analysis/runs/[id]/upload/route.m21.test.ts' 'lib/face-analysis/storage.m23.test.ts'
```

Result: **2 files / 11 tests passed**. Then created a disposable native PostgreSQL cluster under `/private/tmp`, applied the unversioned M23 SQL draft against a minimal fixture schema, and exercised its real PL/pgSQL functions with fixture roles:

- `claim_face_upload_intent_cleanup` changed a pending intent to `cleanup_pending`; `note_face_upload_cleanup_failure` retained `STORAGE_REMOVE_FAILED`, one attempt, and the run remained `created` with `storage_path = NULL`.
- After `record_face_upload_result` committed and attached the intent, a subsequent cleanup claim returned `attached` and `may_delete = false` (the simulated lost-response case).
- After A's intent became cleanup-pending, B's distinct attempt key attached to the run; A's cleanup response remained scoped to A's exact key.

The temporary PostgreSQL cluster and data directory were stopped and removed. This is independent SQL-function/state evidence, but the minimal fixture schema is not a clean replay of the real Supabase schema. It does not model a real HTTP response loss, test ACL under real Supabase roles, or call Storage. Legacy path compatibility and traversal rejection remain covered by the focused route/Storage tests only.

### 2026-10-12 independent recheck

- Re-ran the two focused candidate suites from a new one-time `git archive` copy of the same SHA: **2 files / 11 tests passed** (Vitest 4.1.10). The candidate worktree remained clean.
- Started a separate native PostgreSQL **16.14** cluster on a private Unix socket and applied the unversioned draft to a minimal fixture schema. A scoped event-insert trigger made `record_face_upload_result` fail; the function transaction rolled back the run update and event, then the cleanup RPC persisted `cleanup_pending` and the sanitized `STORAGE_REMOVE_FAILED` code. A successful result RPC followed by cleanup returned `attached / may_delete=false`. A no-intent legacy fixed-key upload result was accepted, and local fixture-role grants confirmed anon/authenticated lacked intent-table access while service_role had the required access.
- The earlier route/Storage stub test still supplies A/B exact-key isolation and legacy preview/traversal coverage. This recheck did not call Supabase or Storage, test an actual HTTP response loss, run a complete migration replay, or verify ACL behavior in Supabase. It does not change the feasibility-only disposition.
- Re-ran QA-owned isolated route/Storage suite against the candidate SHA: **3/3 passed**. It reproduced the double-failure `cleanup_pending` state, simulated committed-RPC response loss without deleting the attached object, proved stale A removes only A's key while B remains, and signed a legacy fixed path for preview. No candidate or shared stack was modified.
- Added and ran `bash scripts/qa-m23-cleanup-reclaim-local.sh`, which verifies the exact candidate SHA, creates a disposable native PostgreSQL cluster, and applies the candidate's unversioned SQL draft to a minimal fixture schema. Runtime result: first cleanup claim returns `may_delete=true`; after persisting `STORAGE_REMOVE_FAILED`, a second claim returns `cleanup_pending / may_delete=false`, with `cleanup_attempts=1`. The script stops and deletes its cluster automatically. This reproduces the retry gap in the PL/pgSQL function, not in Supabase or real Storage.

## Reviewed invariants and evidence

| Scenario | Evidence | QA assessment |
|---|---|---|
| Event/result write and intent attachment are atomic | SQL draft orders run update, event insert, and intent `pending → attached` in one RPC transaction; scratch success path committed run/event/intent together | Function success path ran on a minimal PostgreSQL fixture; event-insert fault rollback and real Supabase transaction behavior were not injected |
| Double failure leaves cleanup discoverable | Route test injects result RPC failure and Storage remove failure; independent PostgreSQL 16.14 scratch injects event-insert failure and verifies transaction rollback plus persistent `cleanup_pending` and error code | Route + SQL-state evidence passes. No real Storage remove fault or future reconciliation is exercised |
| RPC committed but HTTP response was lost does not delete attached image | Route test simulates committed state; PostgreSQL scratch runs the real result RPC followed by cleanup claim | Route + SQL-state evidence passes. No real network response loss or concurrent transaction timing is exercised |
| Old worker A cannot remove new worker B key | Storage test uploads attempt-specific A/B paths; PostgreSQL scratch claims A cleanup and attaches B's key | Exact-key separation is supported by stub and SQL-state evidence; real Storage behavior is not exercised |
| Existing fixed path remains readable | Storage test signs a legacy `{profile}/{run}/source.jpg` path and rejects traversal | Preview compatibility passes in a stub. Independent download and delete compatibility were not exercised |
| Retry a failed `cleanup_pending` removal | `bash scripts/qa-m23-cleanup-reclaim-local.sh` executes the candidate PL/pgSQL function on disposable native PostgreSQL | **Reproduced:** after the first claim and persisted `STORAGE_REMOVE_FAILED`, the next claim returns `may_delete=false`; attempt count remains 1. This is function runtime evidence on a minimal local schema, not Supabase or Storage evidence |

## Design review and remaining gaps

- The attempt-specific object key and intent-before-upload record give compensation a narrow, exact object identity. The result RPC serializes intent attachment with cleanup through the row lock, which is the right shape for the ambiguous-response race.
- The candidate is not release-ready. The SQL is intentionally a draft outside `supabase/migrations` and has no version. The new scratch run exercises selected function state transitions on a minimal schema; it is not a clean migration replay or independent Supabase ACL test.
- A production reconciler and its CAS cleanup lease are absent. Until that exists, an intent left `cleanup_pending` is durable evidence but not automatic recovery. Adoption needs an audited, exact-key worker, retry/age metrics, bounded retention for attached rows, and tests for concurrent workers.
- The draft's cleanup RPC cannot currently support that reconciler's retry: after a failed Storage remove, the row stays `cleanup_pending`; the next `claim_face_upload_intent_cleanup` call hits `state <> 'pending'` and returns `may_delete=false`. The QA-owned native PostgreSQL harness reproduced this exact repeated-claim result after persisting `STORAGE_REMOVE_FAILED`. `cleanup_claimed_at` is set but never used as a lease-expiry predicate. A safe fix needs bounded, atomic reclaim of stale `cleanup_pending` rows with row locking/CAS, while continuing to reject `attached`, verify the run does not reference the exact key, and prevent overlapping workers. This remains a blocker for adopting the spike.
- If Storage upload can persist an object but the client receives an ambiguous error, `storePrivateImage` throws before the result-RPC compensation block; the route releases the claim but leaves the intent pending. A reconciler must account for both `pending` and `cleanup_pending`, with a grace/lease policy and a check that no run references the exact path.
- The design itself records the stale-worker termination boundary: a Storage request that completes after the reconciler's grace window could create a late orphan. The proposed grace is not validated against platform termination behavior.
- The candidate route tests stub RPC outcomes and Storage. Their “committed but response lost” case is a route-state simulation; the QA scratch separately exercised persisted attached state but did not simulate an HTTP transport loss. The double-failure scratch persisted cleanup state but did not inject a real Storage remove failure. Real Storage failure modes and real cleanup recovery remain unverified.
- The candidate explicitly changes photo keys to `attempts/{claim}/source.ext`. The old M22 reader rejects this format, so rollback to the unmodified M22 binary after a successful M23 upload would break preview/download/delete. A forward-compatible rollback artifact or a forward-only rollout gate is required.
- QA did not verify attempt-counter effects, helper authorization under actual `anon`/`authenticated` roles, run deletion behavior without the documented no-FK intent, or full route consumers (member/admin preview, analyze, PDF-related flows, cron expiry) against a database and Storage stack.

## Exit recommendation

Treat Option A as feasible at route/key-prototype level, with focused unit/stub tests and selected PostgreSQL state transitions passing. Keep deployment and formal acceptance blocked pending Tech Lead design selection, versioned migration, full clean replay and ACL checks, persisted event-failure/ambiguous-commit tests, a reconciler covering ambiguous upload and exact-key cleanup with lease/retry behavior (including reclaim of `cleanup_pending`), rollback compatibility, and isolated real Supabase Storage recovery tests. This evidence does not establish formal M22 or M23 pass status.

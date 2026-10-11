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

## Reviewed invariants and evidence

| Scenario | Evidence | QA assessment |
|---|---|---|
| Event/result write and intent attachment are atomic | SQL draft orders run update, event insert, and intent `pending → attached` in one RPC transaction; missing matching intent raises an exception | Plausible by PostgreSQL transaction semantics; not executed against PostgreSQL in this independent run |
| Double failure leaves cleanup discoverable | Route test injects result RPC failure and Storage remove failure; cleanup helper is configured to return `cleanup_pending`; route records a sanitized failure code and returns 500 | Route branch passes. Test mocks the durable intent state and does not prove a persisted row or later reconciliation |
| RPC committed but HTTP response was lost does not delete attached image | Route test injects RPC rejection followed by cleanup RPC response `attached`; expects 200 and no Storage deletion | Route branch passes. The mock does not simulate a real committed transaction or locking race |
| Old worker A cannot remove new worker B key | Storage test uploads attempt-specific A/B paths, removes A, and confirms B remains and can be previewed | Object-key isolation passes in an in-memory Storage stub; claim-token rejection and real Storage semantics are not exercised |
| Existing fixed path remains readable | Storage test signs a legacy `{profile}/{run}/source.jpg` path and rejects traversal | Preview compatibility passes in a stub. Independent download and delete compatibility were not exercised |

## Design review and remaining gaps

- The attempt-specific object key and intent-before-upload record give compensation a narrow, exact object identity. The result RPC serializes intent attachment with cleanup through the row lock, which is the right shape for the ambiguous-response race.
- The candidate is not release-ready. The SQL is intentionally a draft outside `supabase/migrations`, has no version, and received no clean replay or independent ACL/transaction test in this run.
- A production reconciler and its CAS cleanup lease are absent. Until that exists, an intent left `cleanup_pending` is durable evidence but not automatic recovery. Adoption needs an audited, exact-key worker, retry/age metrics, bounded retention for attached rows, and tests for concurrent workers.
- The design itself records the stale-worker termination boundary: a Storage request that completes after the reconciler's grace window could create a late orphan. The proposed grace is not validated against platform termination behavior.
- The route tests stub both the RPC outcome and Storage. The test named “committed but response lost” does not itself commit a database transaction; the double-failure test does not persist/query an intent row. Real Storage failure modes and real cleanup recovery remain unverified.
- The candidate explicitly changes photo keys to `attempts/{claim}/source.ext`. The old M22 reader rejects this format, so rollback to the unmodified M22 binary after a successful M23 upload would break preview/download/delete. A forward-compatible rollback artifact or a forward-only rollout gate is required.
- QA did not verify attempt-counter effects, helper authorization under actual `anon`/`authenticated` roles, run deletion behavior without the documented no-FK intent, or full route consumers (member/admin preview, analyze, PDF-related flows, cron expiry) against a database and Storage stack.

## Exit recommendation

Treat Option A as feasible at route/key-prototype level, with 11/11 focused tests passing. Keep deployment and formal acceptance blocked pending Tech Lead design selection, versioned migration, clean replay and ACL checks, persisted ambiguous-commit/double-failure tests, a reconciler with exact-key lease/retry behavior, rollback compatibility, and isolated real Supabase Storage recovery tests. This evidence does not establish formal M22 or M23 pass status.

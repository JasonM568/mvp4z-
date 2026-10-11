# `manual_refunds` migration drift review

**For:** Tech Lead review · **Scope:** read-only comparison only · **Observed:** 2026-10-11

## Finding

Formal linked project `pvasgmmjrodukudbzuhp` has migration `20260905031253 / manual_refunds` exactly once (49 history rows; latest `20261007155510`). Candidate `20260905160000_manual_refunds.sql` is absent from formal history. The remote stored migration source (7,979 characters) and candidate file (9,277 characters) have identical SQL token streams after removing SQL comments; the difference is explanatory comments/formatting, not executable SQL tokens. This supports **SQL-effect equivalence**, not matching migration identity/history.

| Dimension | Formal `20260905031253` | Candidate `20260905160000` | Assessment |
|---|---|---|---|
| RPC signature | `commit_manual_refund(uuid, uuid, text, integer, text, text)`; last provider-reference arg defaults NULL; 5-column refund result. `preview_order_refund(uuid)` returns 11 columns. | Same signatures, defaults, and return shapes. | Equivalent SQL tokens. |
| Behavior | Adds `partially_refunded`, creates append-only `refunds`, enables RLS; preview is read-only. Commit locks order and user, validates named admin/reason/amount/remaining refund amount, calculates each request's expected credits with per-request `floor(granted × amount / order_amount)`, reclaims up to the active entitlement balance, records shortfall, updates order; full course refund also updates registrations. No idempotency key or audit insert in the RPC. | Same. | Equivalent; legacy per-request rounding remains. |
| Permissions | Both RPCs are `SECURITY DEFINER`, `search_path=public`. Migration revokes `PUBLIC` and explicitly revokes `anon`/`authenticated`; it contains no explicit `GRANT service_role`. | Same. | Equivalent SQL, but service grant depends on default ACL. Formal effective RPC ACL: anon=false, authenticated=false, service_role=true. Catalog default function ACL for `postgres` grants execute to anon/authenticated/service_role; explicit revokes account for the first two. Verify this default ACL in any clean replay environment. |
| `refunds` table access | RLS enabled, zero policies. Formal table ACL reports anon/authenticated and service_role all have SELECT/INSERT/UPDATE/DELETE privileges, but no RLS policy permits anon/authenticated rows or writes; service_role has full DML. | Same table/RLS definition; no policies or explicit table grants in the migration. | Row isolation currently relies on RLS's empty-policy deny behavior, not narrow table grants. Keep this in the security review. |
| Backfill | No historical `refunds` row backfill (`INSERT ... SELECT` absent); creates the table and functions. | Same; no row backfill. | Equivalent. No existing finance rows were queried. |

## Later formal migrations and C9→C22 dependency

Seven formal versions follow `20260905031253` through latest `20261007155510`; none of their stored SQL mentions `refunds`, `commit_manual_refund`, or `preview_order_refund`. The live `commit_manual_refund` still has per-request floor allocation and no idempotency key, consistent with no later formal override. Local candidate migrations `20261011190000_manual_refund_cumulative_credit_allocation.sql` (cumulative credit allocation) and `20261011200000_refund_idempotency_atomic_audit.sql` (request idempotency/atomic audit) are **not present in formal history**.

The M19 `20261012010000`, C19 `20261012020000`, M21 `20261012030000`, and M22 `20261012040000` candidate SQL files contain no references to `refunds` or these two RPCs. No direct SQL dependency was found; this does not resolve the broader migration-history drift or authorize deployment.

## Safe history / apply candidates for Tech Lead

**A — preferred for this migration only:** align the release repository to the already-applied version: retain the exact remote source under version `20260905031253`, remove the duplicate `20260905160000` candidate from that release lane, and verify the migration list maps one local file to the existing formal version. This avoids rerunning refund DDL and avoids adding a duplicate history row. It is repository work only; do not alter formal history as part of this review. Other drift still blocks a broad `db push`.

**B — preserve the candidate filename:** do not run its SQL against formal. Only after Tech Lead approval and the full drift plan, decide whether an explicit history reconciliation is acceptable. Marking `20260905160000` applied would add a second version for equivalent SQL and leave the original `20260905031253`; this is less clear and is not recommended without a documented reason. Never use broad `db push` to resolve this mismatch.

For M19→M22, first resolve the entire local-only/remote-only history mapping under a separately approved plan. Then the intended candidate order is `20261012010000` → `20261012020000` → `20261012030000` → `20261012040000`, with preflight assertions, per-version postchecks, and stop-on-first-difference. No formal migration or data was changed in this review.

## Evidence / limits

Read-only catalog and migration-history SELECTs confirmed versions, signatures, `SECURITY DEFINER`/search path, effective function ACL, RLS/policy counts, table privileges, and current function behavior flags. The source comparison used token equality after stripping comments; it is not a cryptographic identity check and does not independently prove every runtime edge case. No raw refund/order/credit rows, credentials, or secret values were read or included. Formal DB operations in this review were SELECT only.

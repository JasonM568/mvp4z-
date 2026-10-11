#!/usr/bin/env bash
# Local-only refund accounting regression. Fixtures roll back with the transaction.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/local/connection.private.env" >&2
  exit 2
fi
source "$1"
if [[ ! "${DB_URL:-}" =~ ^postgres(ql)?://[^@]*@(localhost|127\.0\.0\.1):[0-9]+/ ]]; then
  echo "Refusing non-local database" >&2
  exit 2
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $qa$
DECLARE
  v_user uuid;
  v_admin uuid;
  v_plan uuid;
  v_order uuid;
  v_entitlement uuid;
  v_first record;
  v_second record;
  v_remaining integer;
  v_reclaimed integer;
  v_status text;
  v_tag text := substr(gen_random_uuid()::text, 1, 10);
BEGIN
  SELECT id INTO STRICT v_plan FROM public.plans WHERE code = 'single_report';
  INSERT INTO public.profiles(email, role)
    VALUES ('qa-refund-member-' || v_tag || '@example.test', 'member') RETURNING id INTO v_user;
  INSERT INTO public.profiles(email, role)
    VALUES ('qa-refund-admin-' || v_tag || '@example.test', 'admin') RETURNING id INTO v_admin;
  INSERT INTO public.orders(order_no, user_id, plan_id, amount, status)
    VALUES ('QARF' || v_tag, v_user, v_plan, 199, 'paid') RETURNING id INTO v_order;
  SELECT entitlement_id INTO v_entitlement
    FROM public.commit_paid_entitlement(v_order, v_user, v_plan, 20, 30, 'QARF' || v_tag, true);

  SELECT * INTO v_first FROM public.commit_manual_refund(
    v_order, v_admin, 'qa-refund-admin@example.test', 99, 'QA partial refund 1', null);
  SELECT * INTO v_second FROM public.commit_manual_refund(
    v_order, v_admin, 'qa-refund-admin@example.test', 100, 'QA partial refund 2', null);
  SELECT credits_remaining INTO v_remaining
    FROM public.member_entitlements WHERE id = v_entitlement;
  SELECT sum(r.credits_reclaimed) INTO v_reclaimed
    FROM public.refunds r WHERE r.order_id = v_order;
  SELECT status INTO v_status FROM public.orders WHERE id = v_order;
  RAISE NOTICE 'refund 99+100/199: first=%, second=%, reclaimed=%, remaining=%, status=%',
    v_first.credits_reclaimed, v_second.credits_reclaimed, v_reclaimed, v_remaining, v_status;
  IF v_status <> 'refunded' OR v_reclaimed <> 20 OR v_remaining <> 0 THEN
    RAISE EXCEPTION 'QA-FS-C10: fully refunded order retains purchased credits';
  END IF;
END
$qa$;
ROLLBACK;
SQL

#!/usr/bin/env bash
# Reproduces a paid add-on after an unexpired entitlement reaches zero credits.
# All fixtures live inside one transaction and are rolled back on success or failure.
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
  v_addon uuid;
  v_old uuid;
  v_order uuid;
  v_new uuid;
  v_selected uuid;
  v_active_count integer;
  v_selected_credits integer;
  v_expires timestamptz := now() + interval '30 days';
  v_tag text := substr(gen_random_uuid()::text, 1, 12);
BEGIN
  SELECT id INTO STRICT v_addon FROM public.plans WHERE code = 'single_report';
  INSERT INTO public.profiles(email, name)
    VALUES ('qa-addon-' || v_tag || '@example.test', 'QA add-on') RETURNING id INTO v_user;
  INSERT INTO public.member_entitlements(user_id, plan_id, status, credits_remaining, expires_at)
    VALUES (v_user, v_addon, 'active', 0, v_expires) RETURNING id INTO v_old;
  INSERT INTO public.orders(order_no, user_id, plan_id, amount, currency, status)
    VALUES ('QAADD' || v_tag, v_user, v_addon, 0, 'TWD', 'paid') RETURNING id INTO v_order;
  SELECT entitlement_id INTO v_new
    FROM public.commit_paid_entitlement(v_order, v_user, v_addon, 20, 30, 'QAADD' || v_tag, true);
  SELECT count(*) INTO v_active_count
    FROM public.member_entitlements WHERE user_id = v_user AND status = 'active';
  -- Mirrors getPublicMember() and the AI route's expires_at-descending selection.
  SELECT id, credits_remaining INTO v_selected, v_selected_credits
    FROM public.member_entitlements WHERE user_id = v_user
    ORDER BY expires_at DESC LIMIT 1;
  RAISE NOTICE 'active_count=%, old_active=%, purchased_credits=%, selected_old=%, selected_credits=%',
    v_active_count,
    (SELECT status = 'active' FROM public.member_entitlements WHERE id = v_old),
    (SELECT credits_remaining FROM public.member_entitlements WHERE id = v_new),
    v_selected = v_old, v_selected_credits;
  IF v_selected_credits <> 20 THEN
    RAISE EXCEPTION 'QA-FS-C9: member entitlement selection hides paid add-on credits';
  END IF;
END
$qa$;
ROLLBACK;
SQL

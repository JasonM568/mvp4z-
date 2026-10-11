#!/usr/bin/env bash
# Reproduces a paid add-on after an unexpired entitlement reaches zero credits.
# All fixtures live inside one transaction and are rolled back on success or failure.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && "$2" != "--migration-preview" ) ]]; then
  echo "usage: $0 /path/to/local/connection.private.env [--migration-preview]" >&2
  exit 2
fi
source "$1"
if [[ ! "${DB_URL:-}" =~ ^postgres(ql)?://[^@]*@(localhost|127\.0\.0\.1):[0-9]+/ ]]; then
  echo "Refusing non-local database" >&2
  exit 2
fi

{
  printf 'BEGIN;\n'
  if [[ ${2:-} == --migration-preview ]]; then
    migration="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations/20261011160000_addon_preserves_entitlement_tier.sql"
    if [[ ! -f "$migration" ]]; then
      echo "Migration preview unavailable: C9 migration is currently reverted" >&2
      exit 2
    fi
    printf '\\i %s\n' "$migration"
  fi
  cat <<'SQL'
DO $qa$
DECLARE
  v_user uuid;
  v_addon uuid;
  v_vip uuid;
  v_old uuid;
  v_order uuid;
  v_new uuid;
  v_new_plan uuid;
  v_selected uuid;
  v_selected_plan uuid;
  v_active_count integer;
  v_selected_credits integer;
  v_expires timestamptz := now() + interval '30 days';
  v_tag text := substr(gen_random_uuid()::text, 1, 12);
BEGIN
  SELECT id INTO STRICT v_addon FROM public.plans WHERE code = 'single_report';
  SELECT id INTO STRICT v_vip FROM public.plans WHERE code = 'vip';
  INSERT INTO public.profiles(email, name)
    VALUES ('qa-addon-' || v_tag || '@example.test', 'QA add-on') RETURNING id INTO v_user;
  INSERT INTO public.member_entitlements(user_id, plan_id, status, credits_remaining, expires_at)
    VALUES (v_user, v_vip, 'active', 0, v_expires) RETURNING id INTO v_old;
  INSERT INTO public.orders(order_no, user_id, plan_id, amount, currency, status)
    VALUES ('QAADD' || v_tag, v_user, v_addon, 0, 'TWD', 'paid') RETURNING id INTO v_order;
  SELECT entitlement_id INTO v_new
    FROM public.commit_paid_entitlement(v_order, v_user, v_addon, 20, 30, 'QAADD' || v_tag, true);
  SELECT plan_id INTO v_new_plan FROM public.member_entitlements WHERE id = v_new;
  SELECT count(*) INTO v_active_count
    FROM public.member_entitlements WHERE user_id = v_user AND status = 'active';
  -- Effective-entitlement contract shared by member/AI/face consumers.
  SELECT id, credits_remaining, plan_id INTO v_selected, v_selected_credits, v_selected_plan
    FROM public.member_entitlements
    WHERE user_id = v_user AND status = 'active' AND expires_at >= now()
    ORDER BY expires_at DESC, created_at DESC, id DESC LIMIT 1;
  RAISE NOTICE 'active_count=%, old_active=%, purchased_credits=%, new_vip=%, selected_old=%, selected_credits=%, selected_vip=%',
    v_active_count,
    (SELECT status = 'active' FROM public.member_entitlements WHERE id = v_old),
    (SELECT credits_remaining FROM public.member_entitlements WHERE id = v_new),
    v_new_plan = v_vip,
    v_selected = v_old, v_selected_credits, v_selected_plan = v_vip;
  IF v_active_count <> 1 OR v_selected <> v_new OR v_selected_credits <> 20 OR v_selected_plan <> v_vip THEN
    RAISE EXCEPTION 'QA-FS-C9: paid add-on must preserve VIP tier and expose one active 20-credit entitlement';
  END IF;
END
$qa$;
SQL
  printf 'ROLLBACK;\n'
} | psql "$DB_URL" -v ON_ERROR_STOP=1

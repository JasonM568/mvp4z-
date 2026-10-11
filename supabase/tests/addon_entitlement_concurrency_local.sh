#!/usr/bin/env bash
# Local-only N=10 paid add-on idempotency/concurrency regression.
# Usage: supabase/tests/addon_entitlement_concurrency_local.sh /private/qa-c9.private.env
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/qa-c9.private.env" >&2
  exit 2
fi
source "$1"
if [[ ! "${DB_URL:-}" =~ ^postgres(ql)?://[^@]*@(localhost|127\.0\.0\.1):[0-9]+/ ]]; then
  echo "Refusing non-local database" >&2
  exit 2
fi
if [[ "${DB_CONTAINER:-}" != supabase_db_xunfeng-c9-isolated-20261011 ]]; then
  echo "Refusing non-C9 isolated database container" >&2
  exit 2
fi
docker inspect "$DB_CONTAINER" >/dev/null

psql_local() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"
}

run_no=0
for plan_code in trial basic pro vip single_report; do
  for repetition in 1 2 3 4; do
    run_no=$((run_no + 1))
    tag="$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-12)"
    order_no="QAC9C${tag}"
    if [[ "$plan_code" == vip ]]; then
      features='{"council_cost":5,"council_free_quota_monthly":3}'
    else
      features='{}'
    fi

    fixture="$(psql_local -F '|' -c "
      with addon as (select id from public.plans where code='single_report'),
      base as (select id from public.plans where code='${plan_code}'),
      profile as (
        insert into public.profiles(email,name)
        values ('qa-c9-concurrency-${tag}@example.test','C9 concurrency') returning id
      ),
      old_entitlement as (
        insert into public.member_entitlements(user_id,plan_id,status,credits_remaining,expires_at,tier_features)
        select profile.id,base.id,'active',0,now()+interval '30 days','${features}'::jsonb
        from profile cross join base returning user_id
      ),
      order_row as (
        insert into public.orders(order_no,user_id,plan_id,amount,currency,status)
        select '${order_no}',old_entitlement.user_id,addon.id,199,'TWD','paid'
        from old_entitlement cross join addon returning id,user_id
      ) select id,user_id from order_row;
    ")"
    IFS='|' read -r order_id user_id <<< "$fixture"
    if [[ -z "$order_id" || -z "$user_id" ]]; then
      echo "round ${run_no}: fixture creation failed" >&2
      exit 1
    fi

    results="$(seq 1 10 | xargs -P 10 -I '{}' docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 -c \
      "select provisioned from public.commit_paid_entitlement('${order_id}','${user_id}',(select id from public.plans where code='single_report'),20,30,'${order_no}',true);")"
    true_count="$(printf '%s\n' "$results" | grep -cx t || true)"
    false_count="$(printf '%s\n' "$results" | grep -cx f || true)"
    if [[ "$true_count" != 1 || "$false_count" != 9 ]]; then
      echo "round ${run_no} (${plan_code}): expected one provisioned + nine idempotent calls; got ${true_count}+${false_count}" >&2
      exit 1
    fi

    checks="$(psql_local -F '|' -c "
      select
        (select count(*) from public.member_entitlements where user_id='${user_id}' and status='active' and expires_at>=now()),
        (select e.credits_remaining from public.member_entitlements e where e.user_id='${user_id}' and e.status='active' and e.expires_at>=now()),
        (select p.code from public.member_entitlements e join public.plans p on p.id=e.plan_id where e.user_id='${user_id}' and e.status='active' and e.expires_at>=now()),
        ((select e.tier_features from public.member_entitlements e where e.user_id='${user_id}' and e.status='active' and e.expires_at>=now()) = '${features}'::jsonb),
        (select count(*) from public.credit_transactions where user_id='${user_id}' and source='ecpay_payment' and ref_id='${order_no}' and type='grant' and amount=20),
        (select count(*) from public.credit_transactions where user_id='${user_id}' and source='plan_renewal_carryover' and ref_id='${order_no}');
    ")"
    actual="${checks%%|*}"
    checks="${checks#*|}"
    balance="${checks%%|*}"
    checks="${checks#*|}"
    effective_plan="${checks%%|*}"
    checks="${checks#*|}"
    features_match="${checks%%|*}"
    checks="${checks#*|}"
    grants="${checks%%|*}"
    carryovers="${checks#*|}"
    if [[ "$actual" != 1 || "$balance" != 20 || "$effective_plan" != "$plan_code" || "$features_match" != t || "$grants" != 1 || "$carryovers" != 0 ]]; then
      echo "round ${run_no} (${plan_code}): canonical balance/tier/transaction assertion failed" >&2
      exit 1
    fi

    psql_local -c "
      delete from public.credit_transactions where user_id='${user_id}';
      delete from public.member_entitlements where user_id='${user_id}';
      delete from public.orders where id='${order_id}';
      delete from public.profiles where id='${user_id}';
    " >/dev/null
    echo "round ${run_no}/20 ${plan_code}: 10/10 RPC calls succeeded; one 20-credit tier-preserving entitlement"
  done
done

# Two different renewals for one member serialize and carry each prior balance once.
tag="$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-12)"
order_prefix="QAC9R${tag}"
fixture="$(psql_local -F '|' -c "
  with base as (select id from public.plans where code='basic'),
  vip as (select id from public.plans where code='vip'),
  profile as (
    insert into public.profiles(email,name) values ('qa-c9-renewal-${tag}@example.test','C9 renewal') returning id
  ),
  old_entitlement as (
    insert into public.member_entitlements(user_id,plan_id,status,credits_remaining,expires_at,tier_features)
    select profile.id,vip.id,'active',10,now()+interval '30 days',jsonb_build_object('council_cost',5,'council_free_quota_monthly',3)
    from profile cross join vip returning user_id
  ),
  order_rows as (
    insert into public.orders(order_no,user_id,plan_id,amount,currency,status)
    select '${order_prefix}A',old_entitlement.user_id,base.id,980,'TWD','paid' from old_entitlement cross join base
    union all
    select '${order_prefix}B',old_entitlement.user_id,base.id,980,'TWD','paid' from old_entitlement cross join base
    returning id,user_id,order_no
  ) select id,user_id,order_no from order_rows order by order_no;
")"
renewal_a="$(printf '%s\n' "$fixture" | sed -n '1p')"
renewal_b="$(printf '%s\n' "$fixture" | sed -n '2p')"
IFS='|' read -r order_a user_id order_no_a <<< "$renewal_a"
IFS='|' read -r order_b _ order_no_b <<< "$renewal_b"
renewal_plan="$(psql_local -c "select id from public.plans where code='basic'")"
tmpdir="$(mktemp -d)"
chmod 700 "$tmpdir"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 -c \
  "select provisioned from public.commit_paid_entitlement('${order_a}','${user_id}','${renewal_plan}',100,30,'${order_no_a}',false);" > "$tmpdir/a" &
pid_a=$!
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 -c \
  "select provisioned from public.commit_paid_entitlement('${order_b}','${user_id}','${renewal_plan}',100,30,'${order_no_b}',false);" > "$tmpdir/b" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"
if [[ "$(cat "$tmpdir/a")" != t || "$(cat "$tmpdir/b")" != t ]]; then
  echo "concurrent renewals did not both provision" >&2
  exit 1
fi
renewal_state="$(psql_local -F '|' -c "
  select
    (select count(*) from public.member_entitlements where user_id='${user_id}' and status='active' and expires_at>=now()),
    (select e.credits_remaining from public.member_entitlements e where e.user_id='${user_id}' and e.status='active' and e.expires_at>=now()),
    (select p.code from public.member_entitlements e join public.plans p on p.id=e.plan_id where e.user_id='${user_id}' and e.status='active' and e.expires_at>=now()),
    (select count(*) from public.member_entitlements where source_order_id in ('${order_a}','${order_b}')),
    (select count(*) from public.credit_transactions where user_id='${user_id}' and source='ecpay_payment' and type='grant' and amount=100),
    (select count(*) from public.credit_transactions where user_id='${user_id}' and source='plan_renewal_carryover' and type='adjustment');
")"
rm -rf "$tmpdir"
if [[ "$renewal_state" != '1|210|basic|2|2|2' ]]; then
  echo "concurrent renewals balance/source-order assertion failed" >&2
  exit 1
fi
psql_local -c "
  delete from public.credit_transactions where user_id='${user_id}';
  delete from public.member_entitlements where user_id='${user_id}';
  delete from public.orders where user_id='${user_id}';
  delete from public.profiles where id='${user_id}';
" >/dev/null
echo 'concurrent renewals: 2/2 provisioned; 210 credits (10+100+100), one active row, 2 order links/grants/carryovers'

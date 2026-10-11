#!/usr/bin/env bash
# Local-only concurrent refund regression. Creates and removes isolated fixtures.
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

tag="QAC10$(openssl rand -hex 5)"
member_email="${tag}-member@example.test"
admin_email="${tag}-admin@example.test"
order_no="$tag"
ids=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -F '|' \
  -v member_email="$member_email" -v admin_email="$admin_email" -v order_no="$order_no" <<'SQL'
begin;
insert into public.profiles(email, role) values (:'member_email', 'member') returning id as member_id \gset
insert into public.profiles(email, role) values (:'admin_email', 'admin') returning id as admin_id \gset
insert into public.orders(order_no, user_id, plan_id, amount, status)
select :'order_no', :'member_id', p.id, 199, 'paid' from public.plans p where p.code = 'single_report'
returning id as order_id \gset
select entitlement_id from public.commit_paid_entitlement(:'order_id', :'member_id',
  (select id from public.plans where code = 'single_report'), 20, 30, :'order_no', true)
\gset
select :'member_id', :'admin_id', :'order_id', :'entitlement_id';
commit;
SQL
)
IFS='|' read -r member_id admin_id order_id entitlement_id <<<"$ids"
if [[ -z "$order_id" || -z "$entitlement_id" ]]; then
  echo "Fixture setup failed" >&2
  exit 1
fi

cleanup() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -v order_id="$order_id" -v member_id="$member_id" \
    -v admin_id="$admin_id" -v entitlement_id="$entitlement_id" >/dev/null <<'SQL'
begin;
delete from public.credit_transactions where ref_id in (select order_no from public.orders where id = :'order_id');
delete from public.refunds where order_id = :'order_id';
delete from public.member_entitlements where id = :'entitlement_id';
delete from public.orders where id = :'order_id';
delete from public.profiles where id in (:'member_id', :'admin_id');
commit;
SQL
}
trap cleanup EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 -v order_id="$order_id" -v admin_id="$admin_id" \
  -v admin_email="$admin_email" >/dev/null 2>&1 <<'SQL' &
select * from public.commit_manual_refund(:'order_id', :'admin_id', :'admin_email', 99, 'QA concurrent refund A', null);
SQL
pid1=$!
psql "$DB_URL" -v ON_ERROR_STOP=1 -v order_id="$order_id" -v admin_id="$admin_id" \
  -v admin_email="$admin_email" >/dev/null 2>&1 <<'SQL' &
select * from public.commit_manual_refund(:'order_id', :'admin_id', :'admin_email', 100, 'QA concurrent refund B', null);
SQL
pid2=$!
wait "$pid1"
wait "$pid2"

result=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -At -F '|' \
  -v order_id="$order_id" -v entitlement_id="$entitlement_id" <<'SQL'
select o.status,
       (select count(*) from public.refunds r where r.order_id = o.id),
       (select coalesce(sum(r.credits_expected), 0) from public.refunds r where r.order_id = o.id),
       (select coalesce(sum(r.credits_reclaimed), 0) from public.refunds r where r.order_id = o.id),
       (select coalesce(sum(r.credits_shortfall), 0) from public.refunds r where r.order_id = o.id),
       (select credits_remaining from public.member_entitlements where id = :'entitlement_id')
from public.orders o where o.id = :'order_id';
SQL
)
if [[ "$result" != "refunded|2|20|20|0|0" ]]; then
  echo "FAIL concurrent refund accounting: $result" >&2
  exit 1
fi
echo "PASS concurrent 99+100/199: refunded, 2 rows, expected/reclaimed 20, shortfall/balance 0"

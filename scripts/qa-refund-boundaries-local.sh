#!/usr/bin/env bash
# Local-only refund boundaries; every fixture rolls back with the transaction.
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
begin;
do $qa$
declare
  v_tag text := substr(gen_random_uuid()::text, 1, 10);
  v_member uuid;
  v_admin uuid;
  v_plan uuid;
  v_order uuid;
  v_entitlement uuid;
  v_case integer;
  v_expected integer;
  v_reclaimed integer;
  v_shortfall integer;
  v_balance integer;
  v_status text;
  v_count integer;
  v_rejected boolean;
begin
  select id into strict v_plan from public.plans where code = 'single_report';
  insert into public.profiles(email, role)
    values ('qa-refund-boundary-admin-' || v_tag || '@example.test', 'admin') returning id into v_admin;
  for v_case in 1..3 loop
    insert into public.profiles(email, role)
      values ('qa-refund-boundary-member-' || v_tag || '-' || v_case || '@example.test', 'member')
      returning id into v_member;
    insert into public.orders(order_no, user_id, plan_id, amount, status)
      values ('QARB' || v_tag || v_case, v_member, v_plan, 199, 'paid') returning id into v_order;
    select entitlement_id into v_entitlement from public.commit_paid_entitlement(
      v_order, v_member, v_plan, 20, 30, 'QARB' || v_tag || v_case, true);

    if v_case = 1 then
      perform public.commit_manual_refund(v_order, v_admin, 'qa@example.test', 199, 'QA direct full', null);
    elsif v_case = 2 then
      perform public.commit_manual_refund(v_order, v_admin, 'qa@example.test', 1, 'QA split 1', null);
      perform public.commit_manual_refund(v_order, v_admin, 'qa@example.test', 1, 'QA split 2', null);
      perform public.commit_manual_refund(v_order, v_admin, 'qa@example.test', 197, 'QA split 3', null);
    else
      v_rejected := false;
      begin
        perform public.commit_manual_refund(v_order, v_admin, 'qa@example.test', 200, 'QA over amount', null);
      exception when others then
        v_rejected := position('超過訂單金額' in sqlerrm) > 0;
      end;
      if not v_rejected then raise exception 'QA C10 over-refund was not rejected'; end if;
      select count(*) into v_count from public.refunds where order_id = v_order;
      select credits_remaining into v_balance from public.member_entitlements where id = v_entitlement;
      select status into v_status from public.orders where id = v_order;
      if v_count <> 0 or v_balance <> 20 or v_status <> 'paid' then
        raise exception 'QA C10 rejected over-refund changed DB';
      end if;
      raise notice 'PASS over-refund 200/199 rejected without writes';
    end if;

    if v_case < 3 then
      select count(*), coalesce(sum(credits_expected), 0),
             coalesce(sum(credits_reclaimed), 0), coalesce(sum(credits_shortfall), 0)
        into v_count, v_expected, v_reclaimed, v_shortfall
      from public.refunds where order_id = v_order;
      select credits_remaining into v_balance from public.member_entitlements where id = v_entitlement;
      select status into v_status from public.orders where id = v_order;
      if v_count <> (case when v_case = 1 then 1 else 3 end) or v_expected <> 20
         or v_reclaimed <> 20 or v_shortfall <> 0 or v_balance <> 0 or v_status <> 'refunded' then
        raise exception 'QA C10 case % accounting mismatch: rows %, expected %, reclaimed %, shortfall %, balance %, status %',
          v_case, v_count, v_expected, v_reclaimed, v_shortfall, v_balance, v_status;
      end if;
      v_rejected := false;
      begin
        perform public.commit_manual_refund(v_order, v_admin, 'qa@example.test', 1, 'QA repeat after full', null);
      exception when others then
        v_rejected := position('只有已付款的訂單' in sqlerrm) > 0;
      end;
      if not v_rejected then raise exception 'QA C10 repeat after full not rejected'; end if;
      raise notice 'PASS case %: rows %, expected/reclaimed 20, balance 0, repeat rejected', v_case, v_count;
    end if;
  end loop;
end
$qa$;
rollback;
SQL

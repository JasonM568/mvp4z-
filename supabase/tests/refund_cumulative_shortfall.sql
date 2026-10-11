-- Regression: partial refunds reclaim only the incremental cumulative target;
-- credits no longer available are recorded as shortfall.
begin;

do $qa$
declare
  v_tag text := substr(gen_random_uuid()::text, 1, 10);
  v_member uuid;
  v_admin uuid;
  v_plan uuid;
  v_order uuid;
  v_entitlement uuid;
  v_expected integer;
  v_reclaimed integer;
  v_shortfall integer;
  v_balance integer;
begin
  select id into strict v_plan from public.plans where code = 'single_report';
  insert into public.profiles(email, role)
    values ('qa-c10-shortfall-member-' || v_tag || '@example.test', 'member') returning id into v_member;
  insert into public.profiles(email, role)
    values ('qa-c10-shortfall-admin-' || v_tag || '@example.test', 'admin') returning id into v_admin;
  insert into public.orders(order_no, user_id, plan_id, amount, status)
    values ('QAC10S' || v_tag, v_member, v_plan, 199, 'paid') returning id into v_order;
  select entitlement_id into v_entitlement from public.commit_paid_entitlement(
    v_order, v_member, v_plan, 20, 30, 'QAC10S' || v_tag, true
  );
  update public.member_entitlements set credits_remaining = 10 where id = v_entitlement;

  perform public.commit_manual_refund(
    v_order, v_admin, 'qa-c10-shortfall-admin@example.test', 99, 'QA shortfall partial A', null, gen_random_uuid()
  );
  perform public.commit_manual_refund(
    v_order, v_admin, 'qa-c10-shortfall-admin@example.test', 100, 'QA shortfall partial B', null, gen_random_uuid()
  );

  select sum(credits_expected), sum(credits_reclaimed), sum(credits_shortfall)
    into v_expected, v_reclaimed, v_shortfall
  from public.refunds where order_id = v_order;
  select credits_remaining into v_balance from public.member_entitlements where id = v_entitlement;

  if v_expected <> 20 or v_reclaimed <> 10 or v_shortfall <> 10 or v_balance <> 0 then
    raise exception 'C10 shortfall regression failed: expected %, reclaimed %, shortfall %, balance %',
      v_expected, v_reclaimed, v_shortfall, v_balance;
  end if;
  raise notice 'C10 shortfall pass: expected=%, reclaimed=%, shortfall=%, balance=%',
    v_expected, v_reclaimed, v_shortfall, v_balance;
end
$qa$;

rollback;

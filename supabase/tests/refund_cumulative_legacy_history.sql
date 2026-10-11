-- Legacy refunds used floor(grant * each_amount / order_amount) independently.
-- Three early amounts total 10/199 but each expected 0; after upgrade, the final
-- refund must recover the historical one-point rounding gap and reach 20 total.
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
  v_status text;
begin
  select id into strict v_plan from public.plans where code = 'single_report';
  insert into public.profiles(email, role)
    values ('qa-c10-legacy-member-' || v_tag || '@example.test', 'member') returning id into v_member;
  insert into public.profiles(email, role)
    values ('qa-c10-legacy-admin-' || v_tag || '@example.test', 'admin') returning id into v_admin;
  insert into public.orders(order_no, user_id, plan_id, amount, status)
    values ('QAC10L' || v_tag, v_member, v_plan, 199, 'paid') returning id into v_order;
  select entitlement_id into v_entitlement from public.commit_paid_entitlement(
    v_order, v_member, v_plan, 20, 30, 'QAC10L' || v_tag, true
  );

  -- Equivalent to three legacy partial refunds: floor(20*1/199) three times
  -- is 0, while the cumulative target for 10/199 is 1.
  insert into public.refunds
    (order_id, user_id, method, kind, amount, credits_expected, credits_reclaimed,
     credits_shortfall, reason, admin_profile_id, admin_email)
  values
    (v_order, v_member, 'manual_ecpay', 'partial', 1, 0, 0, 0, 'legacy 1a', v_admin, 'qa-c10-legacy-admin@example.test'),
    (v_order, v_member, 'manual_ecpay', 'partial', 1, 0, 0, 0, 'legacy 1b', v_admin, 'qa-c10-legacy-admin@example.test'),
    (v_order, v_member, 'manual_ecpay', 'partial', 8, 0, 0, 0, 'legacy 1c', v_admin, 'qa-c10-legacy-admin@example.test');
  update public.orders set status = 'partially_refunded' where id = v_order;

  perform * from public.commit_manual_refund(
    v_order, v_admin, 'qa-c10-legacy-admin@example.test', 189, 'QA legacy remainder refund', null, gen_random_uuid()
  );

  select sum(credits_expected), sum(credits_reclaimed), sum(credits_shortfall)
    into v_expected, v_reclaimed, v_shortfall
  from public.refunds where order_id = v_order;
  select credits_remaining into v_balance from public.member_entitlements where id = v_entitlement;
  select status into v_status from public.orders where id = v_order;

  if v_expected <> 20 or v_reclaimed <> 20 or v_shortfall <> 0 or v_balance <> 0 or v_status <> 'refunded' then
    raise exception 'C10 legacy rounding regression failed: expected %, reclaimed %, shortfall %, balance %, status %',
      v_expected, v_reclaimed, v_shortfall, v_balance, v_status;
  end if;
  raise notice 'C10 legacy history pass: expected=%, reclaimed=%, shortfall=%, balance=%, status=%',
    v_expected, v_reclaimed, v_shortfall, v_balance, v_status;
end
$qa$;

rollback;

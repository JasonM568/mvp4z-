-- Isolated selector regression for equal-expiry legacy active rows.
begin;

do $test$
declare
  v_user uuid;
  v_admin uuid;
  v_plan uuid;
  v_old uuid;
  v_new uuid;
  v_tiebreak uuid;
  v_order uuid;
  v_order_no text := 'QASEL-' || substr(gen_random_uuid()::text, 1, 12);
  v_expires timestamptz := now() + interval '20 days';
  v_preview record;
  v_refund record;
begin
  select id into strict v_plan from public.plans where code = 'basic';
  insert into public.profiles(email, name)
    values ('qa-selector-member-' || substr(gen_random_uuid()::text, 1, 8) || '@example.test', 'Selector member')
    returning id into v_user;
  insert into public.profiles(email, name, role)
    values ('qa-selector-admin-' || substr(gen_random_uuid()::text, 1, 8) || '@example.test', 'Selector admin', 'admin')
    returning id into v_admin;

  insert into public.member_entitlements(id, user_id, plan_id, status, credits_remaining, expires_at, created_at)
    values ('10000000-0000-0000-0000-000000000099', v_user, v_plan, 'active', 11, v_expires, now() - interval '2 days')
    returning id into v_old;
  insert into public.member_entitlements(id, user_id, plan_id, status, credits_remaining, expires_at, created_at)
    values ('10000000-0000-0000-0000-000000000001', v_user, v_plan, 'active', 21, v_expires, now() - interval '1 day')
    returning id into v_new;
  insert into public.member_entitlements(id, user_id, plan_id, status, credits_remaining, expires_at, created_at)
    values ('10000000-0000-0000-0000-000000000002', v_user, v_plan, 'active', 31, v_expires, now() - interval '1 day')
    returning id into v_tiebreak;
  insert into public.orders(order_no, user_id, plan_id, amount, currency, status)
    values (v_order_no, v_user, v_plan, 100, 'TWD', 'paid') returning id into v_order;
  insert into public.credit_transactions(user_id, entitlement_id, type, amount, balance_after, source, ref_id)
    values (v_user, v_tiebreak, 'grant', 5, 31, 'ecpay_payment', v_order_no);

  select * into strict v_preview from public.preview_order_refund(v_order);
  if v_preview.active_entitlement_id <> v_tiebreak or v_preview.credits_available <> 63 then
    raise exception 'refund preview did not use stable latest-created tie-break: %', row_to_json(v_preview);
  end if;

  select * into strict v_refund from public.commit_manual_refund(
    v_order, v_admin, 'qa-selector-admin@example.test', 100, 'selector regression'
  );
  if v_refund.credits_reclaimed <> 5
     or (select credits_remaining from public.member_entitlements where id = v_new) <> 21
     or (select credits_remaining from public.member_entitlements where id = v_tiebreak) <> 26
     or (select credits_remaining from public.member_entitlements where id = v_old) <> 11
     or not exists (select 1 from public.credit_transactions where entitlement_id = v_tiebreak and type = 'refund' and ref_id = v_order_no) then
    raise exception 'refund commit selector mismatch: refund=%, old=%, new=%, tie=%, tx=%',
      row_to_json(v_refund),
      (select credits_remaining from public.member_entitlements where id = v_old),
      (select credits_remaining from public.member_entitlements where id = v_new),
      (select credits_remaining from public.member_entitlements where id = v_tiebreak),
      (select count(*) from public.credit_transactions where entitlement_id = v_tiebreak and type = 'refund' and ref_id = v_order_no);
  end if;
end
$test$;

rollback;

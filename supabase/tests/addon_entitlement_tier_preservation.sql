-- C9 isolated regression. Run with `supabase test db`; all fixture writes roll back.
begin;

do $test$
declare
  v_user uuid;
  v_addon_plan uuid;
  v_old_plan uuid;
  v_order uuid;
  v_new uuid;
  v_row record;
  v_expiry timestamptz := now() + interval '21 days';
  v_code text;
  v_features jsonb;
  v_tag text := substr(gen_random_uuid()::text, 1, 10);
  v_tx_count integer;
  v_active_count integer;
  v_admin uuid;
  v_refund record;
  v_failed boolean := false;
begin
  select id into strict v_addon_plan from public.plans where code = 'single_report';
  insert into public.profiles(email, name, role)
    values ('qa-c9-admin-' || v_tag || '@example.test', 'C9 admin', 'admin') returning id into v_admin;

  foreach v_code in array array['trial', 'basic', 'pro', 'vip', 'single_report'] loop
    select id into strict v_old_plan from public.plans where code = v_code;
    v_features := case when v_code = 'vip'
      then '{"council_cost":5,"council_free_quota_monthly":3}'::jsonb
      else '{}'::jsonb end;
    insert into public.profiles(email, name)
      values ('qa-c9-' || v_code || '-' || v_tag || '@example.test', 'C9 regression')
      returning id into v_user;
    insert into public.member_entitlements
      (user_id, plan_id, status, credits_remaining, expires_at, tier_features)
      values (v_user, v_old_plan, 'active', 0, v_expiry, v_features);
    insert into public.orders(order_no, user_id, plan_id, amount, currency, status)
      values ('QAC9-' || v_code || '-' || v_tag, v_user, v_addon_plan, 199, 'TWD', 'paid')
      returning id into v_order;

    select * into strict v_row from public.commit_paid_entitlement(
      v_order, v_user, v_addon_plan, 20, 30, 'QAC9-' || v_code || '-' || v_tag, true
    );
    v_new := v_row.entitlement_id;
    if not v_row.provisioned or v_row.carried_credits <> 0 or v_row.total_credits <> 20 or v_row.expires_at <> v_expiry then
      raise exception 'C9 %: unexpected grant result: %', v_code, row_to_json(v_row);
    end if;
    if (select plan_id from public.member_entitlements where id = v_new) <> v_old_plan
       or (select tier_features from public.member_entitlements where id = v_new) <> v_features then
      raise exception 'C9 %: original plan/tier_features not carried forward', v_code;
    end if;
    if (select status from public.member_entitlements where user_id = v_user and id <> v_new) <> 'expired' then
      raise exception 'C9 %: old zero-credit entitlement remains active', v_code;
    end if;
    select count(*) into v_active_count from public.member_entitlements
      where user_id = v_user and status = 'active' and expires_at >= now();
    if v_active_count <> 1 or (select credits_remaining from public.member_entitlements where id = v_new) <> 20 then
      raise exception 'C9 %: expected one active 20-credit row', v_code;
    end if;

    select count(*) into v_tx_count from public.credit_transactions where entitlement_id = v_new;
    select * into strict v_row from public.commit_paid_entitlement(
      v_order, v_user, v_addon_plan, 20, 30, 'QAC9-' || v_code || '-' || v_tag, true
    );
    if v_row.provisioned or v_row.entitlement_id <> v_new
       or (select count(*) from public.credit_transactions where entitlement_id = v_new) <> v_tx_count then
      raise exception 'C9 %: retry was not idempotent', v_code;
    end if;

    if v_code = 'vip' then
      select * into strict v_refund from public.preview_order_refund(v_order);
      if v_refund.credits_granted <> 20 or v_refund.credits_available <> 20
         or v_refund.active_entitlement_id <> v_new then
        raise exception 'C9 refund preview did not see one 20-credit entitlement: %', row_to_json(v_refund);
      end if;
      select * into strict v_refund from public.commit_manual_refund(
        v_order, v_admin, 'qa-c9-admin@example.test', 199, 'C9 isolated regression'
      );
      if v_refund.credits_expected <> 20 or v_refund.credits_reclaimed <> 20 or v_refund.credits_shortfall <> 0
         or (select credits_remaining from public.member_entitlements where id = v_new) <> 0 then
        raise exception 'C9 refund commit did not reclaim the add-on grant exactly once: %', row_to_json(v_refund);
      end if;
    end if;
  end loop;

  -- Existing nonzero balances still carry once and preserve the active tier.
  select id into strict v_old_plan from public.plans where code = 'vip';
  insert into public.profiles(email, name)
    values ('qa-c9-carry-' || v_tag || '@example.test', 'C9 carry') returning id into v_user;
  insert into public.member_entitlements
    (user_id, plan_id, status, credits_remaining, expires_at, tier_features)
    values (v_user, v_old_plan, 'active', 17, v_expiry,
      '{"council_cost":5,"council_free_quota_monthly":3}'::jsonb);
  insert into public.orders(order_no, user_id, plan_id, amount, status)
    values ('QAC9-CARRY-' || v_tag, v_user, v_addon_plan, 199, 'paid') returning id into v_order;
  select * into strict v_row from public.commit_paid_entitlement(
    v_order, v_user, v_addon_plan, 20, 30, 'QAC9-CARRY-' || v_tag, true
  );
  if not v_row.provisioned or v_row.carried_credits <> 17 or v_row.total_credits <> 37 then
    raise exception 'C9 carry: expected 17+20=37, got %', row_to_json(v_row);
  end if;
  if (select plan_id from public.member_entitlements where id = v_row.entitlement_id) <> v_old_plan
     or (select tier_features from public.member_entitlements where id = v_row.entitlement_id)
       <> '{"council_cost":5,"council_free_quota_monthly":3}'::jsonb then
    raise exception 'C9 carry: VIP plan/tier_features not preserved';
  end if;
  if (select count(*) from public.credit_transactions
      where entitlement_id = v_row.entitlement_id and source = 'ecpay_payment' and type = 'grant' and amount = 20) <> 1
     or (select count(*) from public.credit_transactions
      where entitlement_id = v_row.entitlement_id and source = 'plan_renewal_carryover' and type = 'adjustment' and amount = 17) <> 1 then
    raise exception 'C9 carry: grant/carryover transaction evidence mismatch';
  end if;

  -- Different concurrently valid tiers have no approved precedence. Fail safe
  -- before writing so the add-on can be reviewed without losing paid access.
  select id into strict v_old_plan from public.plans where code = 'basic';
  insert into public.profiles(email, name)
    values ('qa-c9-mixed-' || v_tag || '@example.test', 'C9 mixed tiers') returning id into v_user;
  insert into public.member_entitlements
    (user_id, plan_id, status, credits_remaining, expires_at, tier_features)
    values
      (v_user, v_old_plan, 'active', 9, v_expiry, '{}'::jsonb),
      (v_user, (select id from public.plans where code = 'vip'), 'active', 0, v_expiry,
       '{"council_cost":5,"council_free_quota_monthly":3}'::jsonb);
  insert into public.orders(order_no, user_id, plan_id, amount, status)
    values ('QAC9-MIXED-' || v_tag, v_user, v_addon_plan, 199, 'paid') returning id into v_order;
  begin
    perform * from public.commit_paid_entitlement(
      v_order, v_user, v_addon_plan, 20, 30, 'QAC9-MIXED-' || v_tag, true
    );
    raise exception 'C9 mixed: expected ambiguous active tier to fail safe';
  exception when raise_exception then
    if sqlerrm not like 'commit_paid_entitlement:%manual review required' then raise; end if;
  end;
  if (select count(*) from public.member_entitlements where user_id=v_user and status='active' and expires_at>=now()) <> 2
     or exists (select 1 from public.member_entitlements where source_order_id=v_order)
     or exists (select 1 from public.credit_transactions where ref_id='QAC9-MIXED-' || v_tag) then
    raise exception 'C9 mixed: ambiguous tier failure wrote or changed entitlement/transactions';
  end if;

  -- A first-time add-on still receives its documented 30-day validity.
  insert into public.profiles(email, name)
    values ('qa-c9-new-' || v_tag || '@example.test', 'C9 new') returning id into v_user;
  insert into public.orders(order_no, user_id, plan_id, amount, status)
    values ('QAC9-NEW-' || v_tag, v_user, v_addon_plan, 199, 'paid') returning id into v_order;
  select * into strict v_row from public.commit_paid_entitlement(
    v_order, v_user, v_addon_plan, 20, 30, 'QAC9-NEW-' || v_tag, true
  );
  if v_row.expires_at < now() + interval '29 days' or v_row.expires_at > now() + interval '31 days'
     or (select plan_id from public.member_entitlements where id = v_row.entitlement_id) <> v_addon_plan then
    raise exception 'C9 new: no-plan add-on must remain single_report for 30 days';
  end if;

  -- Failure during grant transaction must roll back the entitlement and all transactions.
  insert into public.profiles(email, name)
    values ('qa-c9-rollback-' || v_tag || '@example.test', 'C9 rollback') returning id into v_user;
  insert into public.orders(order_no, user_id, plan_id, amount, status)
    values ('QAC9-ROLLBACK-' || v_tag, v_user, v_addon_plan, 199, 'paid') returning id into v_order;
  create function pg_temp.c9_fail_addon_grant() returns trigger language plpgsql as $trigger$
  begin
    if new.source = 'ecpay_payment' and new.ref_id like 'QAC9-ROLLBACK-%' then
      raise exception 'C9 intentional credit transaction failure';
    end if;
    return new;
  end
  $trigger$;
  create trigger c9_fail_addon_grant before insert on public.credit_transactions
    for each row execute function pg_temp.c9_fail_addon_grant();
  begin
    perform * from public.commit_paid_entitlement(
      v_order, v_user, v_addon_plan, 20, 30, 'QAC9-ROLLBACK-' || v_tag, true
    );
  exception when others then
    v_failed := true;
  end;
  if not v_failed
     or exists (select 1 from public.member_entitlements where source_order_id = v_order)
     or exists (select 1 from public.credit_transactions where ref_id = 'QAC9-ROLLBACK-' || v_tag) then
    raise exception 'C9 rollback: failed grant left partial writes';
  end if;
  drop trigger c9_fail_addon_grant on public.credit_transactions;
end
$test$;

rollback;

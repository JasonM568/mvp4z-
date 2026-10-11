-- An add-on extends only the credit balance and keeps the current expiry/tier.
-- Collapse all currently valid entitlement balances into the new source-order row
-- so every consumer (member display, AI, face analysis, refund and admin tools)
-- sees one spendable balance without dropping the plan that grants access.
create or replace function public.commit_paid_entitlement(
  p_order_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_credits integer,
  p_duration_days integer,
  p_ref_id text,
  p_is_addon boolean default false
)
returns table (
  provisioned boolean,
  entitlement_id uuid,
  carried_credits integer,
  total_credits integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.member_entitlements%rowtype;
  v_carried integer := 0;
  v_base timestamptz;
  v_has_active boolean;
  v_expires timestamptz;
  v_total integer;
  v_new_id uuid;
  v_now timestamptz := now();
  v_effective_plan_id uuid := p_plan_id;
  v_effective_tier_features jsonb := '{}'::jsonb;
begin
  if p_order_id is null or p_user_id is null then
    raise exception 'commit_paid_entitlement: order_id 與 user_id 不得為 null';
  end if;
  if p_credits < 0 or p_duration_days <= 0 then
    raise exception 'commit_paid_entitlement: 點數或效期參數不合法 (credits=%, days=%)', p_credits, p_duration_days;
  end if;

  -- Serialize grant/carryover/refund operations for this member.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Idempotency remains attached to the purchased order, even when the row
  -- represents a pre-existing higher tier rather than the add-on plan itself.
  select * into v_existing
  from public.member_entitlements
  where source_order_id = p_order_id;
  if found then
    return query select false, v_existing.id, 0, v_existing.credits_remaining, v_existing.expires_at;
    return;
  end if;

  select coalesce(sum(e.credits_remaining), 0), max(e.expires_at)
    into v_carried, v_base
  from public.member_entitlements e
  where e.user_id = p_user_id
    and e.status = 'active'
    and e.expires_at >= v_now;

  v_has_active := v_base is not null;
  v_base := greatest(coalesce(v_base, v_now), v_now);

  if p_is_addon and v_has_active then
    -- Keep the highest currently active plan and its per-entitlement overrides.
    -- The explicit order reflects the app's tier names; single_report is basic-equivalent.
    select coalesce(e.plan_id, p_plan_id), coalesce(e.tier_features, '{}'::jsonb)
      into v_effective_plan_id, v_effective_tier_features
    from public.member_entitlements e
    left join public.plans pl on pl.id = e.plan_id
    where e.user_id = p_user_id
      and e.status = 'active'
      and e.expires_at >= v_now
    order by case lower(coalesce(pl.code, ''))
      when 'vip' then 50
      when 'pro' then 40
      when 'basic' then 30
      when 'single_report' then 30
      when 'trial' then 20
      else 0
    end desc,
    e.expires_at desc,
    e.created_at desc,
    e.id desc
    limit 1;
    v_expires := v_base;
  else
    v_expires := v_base + make_interval(days => p_duration_days);
  end if;

  v_total := p_credits + v_carried;

  insert into public.member_entitlements
    (user_id, plan_id, status, credits_remaining, starts_at, expires_at,
     source_order_id, tier_features)
  values
    (p_user_id, v_effective_plan_id, 'active', v_total, v_now, v_expires,
     p_order_id, v_effective_tier_features)
  returning id into v_new_id;

  insert into public.credit_transactions
    (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
  values
    (p_user_id, v_new_id, 'grant', p_credits, p_credits, 'ecpay_payment', p_ref_id);

  -- An active add-on consolidates even zero-credit rows, removing the ambiguous
  -- same-expiry selection while preserving the effective plan/tier above. For
  -- normal renewals, retain the established carryover behavior.
  if v_carried > 0 or (p_is_addon and v_has_active) then
    update public.member_entitlements
       set credits_remaining = 0,
           status = 'expired'
     where user_id = p_user_id
       and status = 'active'
       and id <> v_new_id
       and member_entitlements.expires_at >= v_now;
  end if;

  if v_carried > 0 then
    insert into public.credit_transactions
      (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
    values
      (p_user_id, v_new_id, 'adjustment', v_carried, v_total, 'plan_renewal_carryover', p_ref_id);
  end if;

  return query select true, v_new_id, v_carried, v_total, v_expires;
end;
$$;

revoke all on function public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text, boolean) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text, boolean) from %I', r);
    end if;
  end loop;
end $$;

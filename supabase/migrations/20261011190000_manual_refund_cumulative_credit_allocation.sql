-- Allocate credit reclaim by cumulative refunded amount so integer rounding
-- across multiple partial refunds sums to the original grant exactly.
create or replace function public.commit_manual_refund(
  p_order_id uuid,
  p_admin_profile_id uuid,
  p_admin_email text,
  p_amount integer,
  p_reason text,
  p_provider_reference text default null
)
returns table (
  refund_id uuid,
  order_status text,
  credits_expected integer,
  credits_reclaimed integer,
  credits_shortfall integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_already integer;
  v_granted integer;
  v_expected integer;
  v_previous_target integer;
  v_new_target integer;
  v_available integer;
  v_reclaimed integer;
  v_shortfall integer;
  v_ent_id uuid;
  v_ent_balance integer;
  v_new_status text;
  v_kind text;
  v_refund_id uuid;
begin
  if p_admin_profile_id is null or coalesce(trim(p_admin_email), '') = '' then
    raise exception 'commit_manual_refund: 退款必須由具名管理員執行';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'commit_manual_refund: 必須填寫退款原因';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'commit_manual_refund: 退款金額必須大於 0';
  end if;

  -- This row lock serializes partial refunds for the same order. The cumulative
  -- target below is therefore based on the committed amount before this refund.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'commit_manual_refund: 找不到訂單 %', p_order_id;
  end if;
  if v_order.status not in ('paid', 'partially_refunded') then
    raise exception 'commit_manual_refund: 只有已付款的訂單可以退款（目前狀態：%）', v_order.status;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_order.user_id::text, 0));

  select coalesce(sum(r.amount), 0) into v_already from public.refunds r where r.order_id = v_order.id;
  if v_already + p_amount > v_order.amount then
    raise exception 'commit_manual_refund: 退款總額 % 超過訂單金額 %', v_already + p_amount, v_order.amount;
  end if;

  v_kind := case when v_already + p_amount >= v_order.amount then 'full' else 'partial' end;

  select coalesce(sum(t.amount), 0) into v_granted
  from public.credit_transactions t
  where t.ref_id = v_order.order_no and t.source = 'ecpay_payment' and t.type = 'grant';

  -- Use cumulative rounded targets, then reclaim only the incremental target
  -- for this refund. This avoids floor(20*99/199)+floor(20*100/199)=19.
  v_previous_target := floor(v_granted::numeric * v_already / nullif(v_order.amount, 0))::integer;
  v_new_target := floor(v_granted::numeric * (v_already + p_amount) / nullif(v_order.amount, 0))::integer;
  v_expected := greatest(coalesce(v_new_target - v_previous_target, 0), 0);

  select e.id, e.credits_remaining into v_ent_id, v_ent_balance
  from public.member_entitlements e
  where e.user_id = v_order.user_id and e.status = 'active' and e.expires_at >= now()
  order by e.expires_at desc, e.created_at desc, e.id desc
  limit 1
  for update;

  v_available := coalesce(v_ent_balance, 0);
  v_reclaimed := least(v_expected, v_available);
  v_shortfall := v_expected - v_reclaimed;

  if v_reclaimed > 0 then
    update public.member_entitlements
       set credits_remaining = credits_remaining - v_reclaimed
     where id = v_ent_id;

    insert into public.credit_transactions
      (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
    values
      (v_order.user_id, v_ent_id, 'refund', -v_reclaimed, v_available - v_reclaimed, 'order_refund', v_order.order_no);
  end if;

  insert into public.refunds
    (order_id, user_id, method, kind, amount,
     credits_expected, credits_reclaimed, credits_shortfall,
     reason, provider_reference, admin_profile_id, admin_email)
  values
    (v_order.id, v_order.user_id, 'manual_ecpay', v_kind, p_amount,
     v_expected, v_reclaimed, v_shortfall,
     trim(p_reason), nullif(trim(coalesce(p_provider_reference, '')), ''), p_admin_profile_id, trim(p_admin_email))
  returning id into v_refund_id;

  v_new_status := case when v_kind = 'full' then 'refunded' else 'partially_refunded' end;
  update public.orders set status = v_new_status, updated_at = now() where id = v_order.id;

  if v_kind = 'full' and coalesce(v_order.order_type, 'membership') = 'course' then
    update public.course_registrations set status = 'refunded' where order_id = v_order.id;
  end if;

  return query select v_refund_id, v_new_status, v_expected, v_reclaimed, v_shortfall;
end;
$$;

revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text) from %I', r);
    end if;
  end loop;
end $$;

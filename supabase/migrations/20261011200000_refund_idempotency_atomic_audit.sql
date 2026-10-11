-- Refund submission idempotency and atomic financial audit.
-- Existing rows keep NULL idempotency_key; provider_reference remains an
-- optional external reference or operator note and is intentionally not unique.

alter table public.refunds
  add column if not exists idempotency_key uuid;

create unique index if not exists refunds_order_id_idempotency_key_uidx
  on public.refunds (order_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists public.commit_manual_refund(uuid, uuid, text, integer, text, text);

create function public.commit_manual_refund(
  p_order_id uuid,
  p_admin_profile_id uuid,
  p_admin_email text,
  p_amount integer,
  p_reason text,
  p_provider_reference text,
  p_idempotency_key uuid
)
returns table (
  refund_id uuid,
  order_status text,
  credits_expected integer,
  credits_reclaimed integer,
  credits_shortfall integer,
  idempotent_replay boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.refunds%rowtype;
  v_already integer;
  v_already_expected integer;
  v_granted integer;
  v_expected integer;
  v_new_target integer;
  v_available integer;
  v_reclaimed integer;
  v_shortfall integer;
  v_entitlement_id uuid;
  v_entitlement_balance integer;
  v_new_status text;
  v_kind text;
  v_refund_id uuid;
begin
  if p_admin_profile_id is null or coalesce(trim(p_admin_email), '') = '' then
    raise exception using errcode = '22023', message = 'REFUND_NAMED_ADMIN_REQUIRED';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'REFUND_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception using errcode = '22023', message = 'REFUND_REASON_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'REFUND_AMOUNT_INVALID';
  end if;

  -- Serialize all requests for this order before checking/reusing the key.
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REFUND_ORDER_NOT_FOUND';
  end if;

  select * into v_existing
    from public.refunds
   where order_id = p_order_id
     and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.amount is distinct from p_amount
       or v_existing.reason is distinct from trim(p_reason)
       or v_existing.provider_reference is distinct from nullif(trim(coalesce(p_provider_reference, '')), '') then
      raise exception using errcode = 'P0001', message = 'REFUND_IDEMPOTENCY_CONFLICT';
    end if;

    return query select v_existing.id,
      case when v_existing.kind = 'full' then 'refunded' else 'partially_refunded' end,
      v_existing.credits_expected, v_existing.credits_reclaimed,
      v_existing.credits_shortfall, true;
    return;
  end if;

  if v_order.status = 'refunded' then
    raise exception using errcode = 'P0001', message = 'REFUND_ALREADY_FULLY_REFUNDED';
  end if;
  if v_order.status not in ('paid', 'partially_refunded') then
    raise exception using errcode = 'P0001', message = 'REFUND_ORDER_STATUS_CONFLICT';
  end if;

  select coalesce(sum(r.amount), 0)::integer
    into v_already
    from public.refunds r
   where r.order_id = p_order_id;
  if v_already + p_amount > v_order.amount then
    raise exception using errcode = 'P0001', message = 'REFUND_AMOUNT_EXCEEDS_REMAINING';
  end if;

  v_kind := case when v_already + p_amount = v_order.amount then 'full' else 'partial' end;

  select coalesce(sum(t.amount), 0)::integer
    into v_granted
    from public.credit_transactions t
   where t.ref_id = v_order.order_no
     and t.source = 'ecpay_payment'
     and t.type = 'grant';

  select coalesce(sum(r.credits_expected), 0)::integer
    into v_already_expected
    from public.refunds r
   where r.order_id = p_order_id;
  v_new_target := floor(v_granted::numeric * (v_already + p_amount) / nullif(v_order.amount, 0))::integer;
  v_expected := greatest(coalesce(v_new_target - v_already_expected, 0), 0);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order.user_id::text, 0));

  select e.id, e.credits_remaining
    into v_entitlement_id, v_entitlement_balance
    from public.member_entitlements e
   where e.user_id = v_order.user_id
     and e.status = 'active'
     and e.expires_at >= pg_catalog.now()
   order by e.expires_at desc, e.created_at desc, e.id desc
   limit 1
   for update;

  v_available := coalesce(v_entitlement_balance, 0);
  v_reclaimed := least(v_expected, v_available);
  v_shortfall := v_expected - v_reclaimed;

  if v_reclaimed > 0 then
    update public.member_entitlements
       set credits_remaining = credits_remaining - v_reclaimed
     where id = v_entitlement_id;

    insert into public.credit_transactions
      (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
    values
      (v_order.user_id, v_entitlement_id, 'refund', -v_reclaimed,
       v_available - v_reclaimed, 'order_refund', v_order.order_no);
  end if;

  insert into public.refunds
    (order_id, user_id, method, kind, amount,
     credits_expected, credits_reclaimed, credits_shortfall,
     reason, provider_reference, admin_profile_id, admin_email, idempotency_key)
  values
    (v_order.id, v_order.user_id, 'manual_ecpay', v_kind, p_amount,
     v_expected, v_reclaimed, v_shortfall,
     trim(p_reason), nullif(trim(coalesce(p_provider_reference, '')), ''),
     p_admin_profile_id, trim(p_admin_email), p_idempotency_key)
  returning id into v_refund_id;

  v_new_status := case when v_kind = 'full' then 'refunded' else 'partially_refunded' end;
  update public.orders
     set status = v_new_status, updated_at = pg_catalog.now()
   where id = v_order.id;

  if v_kind = 'full' and coalesce(v_order.order_type, 'membership') = 'course' then
    update public.course_registrations
       set status = 'refunded'
     where order_id = v_order.id;
  end if;

  insert into public.admin_audit_logs
    (admin_user_id, action, target_type, target_id, metadata)
  values
    (p_admin_profile_id, 'order_refund_manual', 'order', v_order.id::text,
     pg_catalog.jsonb_build_object(
       'refundId', v_refund_id,
       'idempotencyKey', p_idempotency_key,
       'amount', p_amount,
       'reason', trim(p_reason),
       'providerReference', nullif(trim(coalesce(p_provider_reference, '')), ''),
       'creditsExpected', v_expected,
       'creditsReclaimed', v_reclaimed,
       'creditsShortfall', v_shortfall,
       'orderStatus', v_new_status
     ));

  return query select v_refund_id, v_new_status, v_expected, v_reclaimed, v_shortfall, false;
end;
$$;

revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text, uuid) from public;
revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text, uuid) from anon;
revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text, uuid) from authenticated;
grant execute on function public.commit_manual_refund(uuid, uuid, text, integer, text, text, uuid) to service_role;

grant select, update on public.orders to service_role;
grant select, insert on public.refunds to service_role;
grant select, update on public.member_entitlements to service_role;
grant select, insert on public.credit_transactions to service_role;
grant update on public.course_registrations to service_role;
grant insert on public.admin_audit_logs to service_role;

notify pgrst, 'reload schema';

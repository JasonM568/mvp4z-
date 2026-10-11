-- Serialize callbacks that share either ECPay unique key before appending the
-- audit event or touching the canonical payment row. Lock order is stable to
-- avoid deadlocks when merchant/provider identifiers cross between requests.
-- The RPC runs as the calling service_role; its table access is explicitly
-- granted below and RLS stays enabled on the append-only event table.

revoke update, delete, truncate, references, trigger on public.payment_notification_events from service_role;
revoke all on public.payment_notification_events from public, anon, authenticated;
grant insert, select on public.payment_notification_events to service_role;

create or replace function public.record_ecpay_payment_notification(
  p_order_id uuid,
  p_provider_trade_no text,
  p_merchant_trade_no text,
  p_amount integer,
  p_status text,
  p_amount_matches boolean,
  p_check_mac_valid boolean,
  p_raw_payload jsonb
)
returns table (amount_mismatch boolean, payment_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_status text;
  v_amount_mismatch boolean;
  v_merchant_lock bigint;
  v_provider_lock bigint;
  v_constraint_name text;
begin
  if p_order_id is null or p_merchant_trade_no is null or p_merchant_trade_no = '' then
    raise exception 'record_ecpay_payment_notification: order and merchant trade number are required';
  end if;
  if p_status not in ('paid', 'allocated', 'failed') then
    raise exception 'record_ecpay_payment_notification: invalid notification status';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'record_ecpay_payment_notification: amount must be non-negative';
  end if;
  if p_check_mac_valid is distinct from true then
    raise exception 'record_ecpay_payment_notification: valid CheckMacValue is required';
  end if;

  v_merchant_lock := pg_catalog.hashtextextended(
    'ecpay:merchant:' || p_merchant_trade_no,
    0
  );
  if nullif(p_provider_trade_no, '') is not null then
    v_provider_lock := pg_catalog.hashtextextended(
      'ecpay:provider:' || p_provider_trade_no,
      0
    );
  end if;

  if v_provider_lock is null then
    perform pg_catalog.pg_advisory_xact_lock(v_merchant_lock);
  elsif v_merchant_lock <= v_provider_lock then
    perform pg_catalog.pg_advisory_xact_lock(v_merchant_lock);
    perform pg_catalog.pg_advisory_xact_lock(v_provider_lock);
  else
    perform pg_catalog.pg_advisory_xact_lock(v_provider_lock);
    perform pg_catalog.pg_advisory_xact_lock(v_merchant_lock);
  end if;

  v_amount_mismatch := p_status = 'paid' and p_amount_matches is distinct from true;

  insert into public.payment_notification_events (
    order_id, provider_trade_no, merchant_trade_no, amount,
    notification_status, amount_matches, check_mac_valid, raw_payload
  ) values (
    p_order_id, nullif(p_provider_trade_no, ''), p_merchant_trade_no, p_amount,
    p_status, p_amount_matches, p_check_mac_valid, coalesce(p_raw_payload, '{}'::jsonb)
  );

  -- A signed but incorrect paid amount is evidence only. It must never become
  -- the canonical payment row or cause the caller to provision the order.
  if v_amount_mismatch then
    select payments.status into v_current_status
      from public.payments
     where provider = 'ecpay' and merchant_trade_no = p_merchant_trade_no;
    return query select true, v_current_status;
    return;
  end if;

  begin
    insert into public.payments (
      order_id, provider, provider_trade_no, merchant_trade_no,
      amount, status, raw_payload, check_mac_valid, received_at
    ) values (
      p_order_id, 'ecpay', nullif(p_provider_trade_no, ''), p_merchant_trade_no,
      p_amount, p_status, coalesce(p_raw_payload, '{}'::jsonb), p_check_mac_valid, now()
    )
    on conflict (provider, merchant_trade_no) do update set
      order_id = excluded.order_id,
      provider_trade_no = coalesce(excluded.provider_trade_no, payments.provider_trade_no),
      amount = excluded.amount,
      status = excluded.status,
      raw_payload = excluded.raw_payload,
      check_mac_valid = excluded.check_mac_valid,
      received_at = excluded.received_at
    where payments.status not in ('paid', 'refunded')
    returning payments.status into v_current_status;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name is distinct from 'idx_payments_provider_trade_no_unique' then
      raise;
    end if;
    -- The event insert is outside this subtransaction and remains auditable.
    -- Do not provision a second order from a duplicated provider trade number.
    return query select false, 'trade_conflict'::text;
    return;
  end;

  if v_current_status is null then
    select payments.status into v_current_status
      from public.payments
     where provider = 'ecpay' and merchant_trade_no = p_merchant_trade_no;
  end if;

  return query select false, v_current_status;
end;
$$;

revoke all on function public.record_ecpay_payment_notification(
  uuid, text, text, integer, text, boolean, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_ecpay_payment_notification(
  uuid, text, text, integer, text, boolean, boolean, jsonb
) to service_role;

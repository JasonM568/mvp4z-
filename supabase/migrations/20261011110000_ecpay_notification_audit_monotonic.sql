-- Keep ECPay callback evidence append-only and prevent non-paid callbacks from
-- replacing an already accepted payment. The existing payments row remains the
-- canonical per-order state; every valid-MAC callback is separately auditable.

create table public.payment_notification_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null default 'ecpay' check (provider = 'ecpay'),
  provider_trade_no text,
  merchant_trade_no text not null,
  amount integer not null check (amount >= 0),
  notification_status text not null check (notification_status in ('paid', 'allocated', 'failed')),
  amount_matches boolean not null,
  check_mac_valid boolean not null check (check_mac_valid),
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index payment_notification_events_order_received_idx
  on public.payment_notification_events(order_id, received_at desc);
create index payment_notification_events_merchant_trade_idx
  on public.payment_notification_events(provider, merchant_trade_no, received_at desc);

alter table public.payment_notification_events enable row level security;
revoke all on public.payment_notification_events from public, anon, authenticated;
revoke all on public.payment_notification_events from service_role;
grant select on public.payment_notification_events to service_role;

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
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_amount_mismatch boolean;
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
) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'revoke all on function public.record_ecpay_payment_notification(uuid, text, text, integer, text, boolean, boolean, jsonb) from %I',
        r
      );
    end if;
  end loop;
end $$;
grant execute on function public.record_ecpay_payment_notification(
  uuid, text, text, integer, text, boolean, boolean, jsonb
) to service_role;

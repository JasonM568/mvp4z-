create unique index if not exists idx_payments_provider_merchant_trade_no
on public.payments(provider, merchant_trade_no);

create unique index if not exists idx_payments_provider_trade_no_unique
on public.payments(provider, provider_trade_no)
where provider_trade_no is not null;

create unique index if not exists idx_entitlements_source_order_id_unique
on public.member_entitlements(source_order_id)
where source_order_id is not null;

-- 0008_invoices.sql
-- ECPay 電子發票串接 Phase 1：schema
-- 1. orders 加 invoice_request jsonb（結帳時收集的買受人資訊）
-- 2. orders 加 legacy_no_invoice flag（標記歷史 paid 訂單不開票）
-- 3. 新建 invoices 表（完整欄位含載具/捐贈，Phase 1 admin UI 只用個人+公司，欄位先建好）

alter table public.orders
  add column invoice_request jsonb,
  add column legacy_no_invoice boolean not null default false;

comment on column public.orders.invoice_request is
  '結帳時收集的買受人資訊：buyer_type/buyer_name/buyer_id/carrier_type/carrier_num/donation_code/buyer_email';
comment on column public.orders.legacy_no_invoice is
  '歷史 paid 訂單在串接發票前已完成付款，明確標記不開票（避免被誤判為待開票）';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  user_id uuid not null references public.profiles(id),

  -- 發票提供商與識別
  provider text not null default 'ecpay',
  invoice_number text,                 -- 綠界回傳的發票號碼（YY12345678 格式），失敗時 null
  random_code text,                    -- 隨機碼 4 碼
  invoice_date timestamptz,            -- 開立時間（由綠界回傳）

  -- 買受人資訊（從 orders.invoice_request 複製過來鎖定當時資料）
  buyer_type text not null check (buyer_type in ('personal', 'company')),
  buyer_name text not null,
  buyer_id text,                       -- 統編 8 碼 / personal 為 null
  buyer_email text,

  -- 載具（Phase 1 admin UI 不用，欄位先建）
  carrier_type text not null default 'none'
    check (carrier_type in ('none', 'cellphone', 'citizen_digital', 'ecpay_member')),
  carrier_num text,
  donation_code text,                  -- 捐贈碼 4-7 碼，有值代表捐贈，與 carrier_type 互斥

  -- 金額
  total_amount integer not null check (total_amount >= 0),
  tax_type text not null default '1'
    check (tax_type in ('1', '2', '3', '9')),  -- 1=應稅 2=零稅 3=免稅 9=混合

  -- 狀態
  status text not null default 'pending'
    check (status in ('pending', 'issued', 'failed', 'voided')),
  error_code text,                     -- 失敗時的綠界 RtnCode
  error_msg text,
  retry_count integer not null default 0 check (retry_count >= 0),
  last_attempted_at timestamptz,

  -- 作廢資訊
  voided_at timestamptz,
  void_reason text,

  -- audit / debug
  raw_request jsonb,
  raw_response jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- invoice_number 在綠界端唯一；本地端 partial unique 確保 issued 之後不會重號
create unique index idx_invoices_invoice_number
  on public.invoices(invoice_number)
  where invoice_number is not null;

-- 每張 order 同一個 provider 只能有一張未作廢的 invoice，避免重複開票
create unique index idx_invoices_order_provider_active
  on public.invoices(order_id, provider)
  where status in ('pending', 'issued');

create index idx_invoices_order_id on public.invoices(order_id);
create index idx_invoices_user_id on public.invoices(user_id);
create index idx_invoices_status on public.invoices(status);

-- updated_at 自動更新
create or replace function public.touch_invoices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.touch_invoices_updated_at();

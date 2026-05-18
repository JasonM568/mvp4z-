create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name text,
  email text unique not null,
  phone text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  price integer not null check (price >= 0),
  currency text not null default 'TWD',
  credits integer not null check (credits >= 0),
  duration_days integer not null check (duration_days > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  user_id uuid not null references public.profiles(id),
  plan_id uuid not null references public.plans(id),
  amount integer not null check (amount >= 0),
  currency text not null default 'TWD',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  provider text not null default 'ecpay',
  provider_trade_no text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  provider text not null default 'ecpay',
  provider_trade_no text,
  merchant_trade_no text not null,
  amount integer not null check (amount >= 0),
  status text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  check_mac_valid boolean not null default false,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.member_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  plan_id uuid references public.plans(id),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  credits_remaining integer not null default 0 check (credits_remaining >= 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source_order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  entitlement_id uuid references public.member_entitlements(id),
  type text not null check (type in ('grant', 'debit', 'adjustment', 'refund')),
  amount integer not null,
  balance_after integer not null,
  source text not null,
  ref_id text,
  created_at timestamptz not null default now()
);

create table public.activation_codes (
  code text primary key,
  plan_id uuid references public.plans(id),
  credits integer not null check (credits >= 0),
  duration_days integer not null check (duration_days > 0),
  status text not null default 'unused' check (status in ('unused', 'used', 'void')),
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  entitlement_id uuid references public.member_entitlements(id),
  type text not null default 'chat',
  prompt text,
  reply text,
  tokens_input integer,
  tokens_output integer,
  cost_estimate numeric(12, 6),
  created_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_profiles_auth_user_id on public.profiles(auth_user_id);
create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_order_no on public.orders(order_no);
create index idx_payments_merchant_trade_no on public.payments(merchant_trade_no);
create index idx_entitlements_user_id on public.member_entitlements(user_id);
create index idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index idx_usage_logs_user_id on public.usage_logs(user_id);

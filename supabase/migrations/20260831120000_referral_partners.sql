-- 業務推廣分潤：每位業務一組專屬 code，連結帶 ?ref=CODE 進站後歸戶到訂單。
-- 歸因規則見 lib/referral/attribution.ts：cookie 保存 90 天、last-touch 覆蓋、
-- 成單當下把 code 與分潤比例「快照」寫進 orders，日後改比例不會回頭改動已成立的訂單。
create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Za-z0-9_-]{2,32}$'),
  name text not null check (char_length(name) between 1 and 80),
  contact text not null default '' check (char_length(contact) <= 200),
  commission_rate numeric(6, 4) not null default 0.2000
    check (commission_rate >= 0 and commission_rate <= 1),
  note text not null default '' check (char_length(note) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- code 不分大小寫唯一：連結上打 alex 或 ALEX 都要指到同一位業務。
create unique index if not exists idx_referral_partners_code
  on public.referral_partners (lower(code));

create or replace function public.touch_referral_partners_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_referral_partners_updated_at on public.referral_partners;
create trigger trg_referral_partners_updated_at before update on public.referral_partners
for each row execute function public.touch_referral_partners_updated_at();

alter table public.referral_partners enable row level security;
revoke all on public.referral_partners from anon, authenticated;
grant select, insert, update, delete on public.referral_partners to service_role;
comment on table public.referral_partners is 'Sales/affiliate partners; each owns a ?ref= code. Service role/admin API only.';

-- 訂單歸因欄位。referral_rate 是成單當下的比例快照，不隨 partner 之後調整而變動。
alter table public.orders
  add column if not exists referral_partner_id uuid references public.referral_partners(id) on delete set null,
  add column if not exists referral_code text,
  add column if not exists referral_rate numeric(6, 4);

create index if not exists idx_orders_referral_partner
  on public.orders (referral_partner_id) where referral_partner_id is not null;

comment on column public.orders.referral_code is 'Raw ?ref= code captured at checkout, kept even if the partner row is later deleted.';
comment on column public.orders.referral_rate is 'Commission rate snapshot at order creation; later partner edits do not rewrite settled orders.';

-- 註冊來源：看得出業務帶進多少會員，即使對方還沒買。
alter table public.profiles
  add column if not exists referral_code text;

create index if not exists idx_profiles_referral_code
  on public.profiles (lower(referral_code)) where referral_code is not null;

-- 0011_course_orders.sql
-- 課程報名改走站內訂單 + 綠界金流。

create table if not exists public.course_products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  subtitle text,
  description text,
  course_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  price_new integer not null check (price_new >= 0),
  price_returning integer not null check (price_returning >= 0),
  currency text not null default 'TWD',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists order_type text not null default 'membership'
    check (order_type in ('membership', 'course')),
  add column if not exists course_product_id uuid references public.course_products(id),
  add column if not exists item_name text;

alter table public.orders
  alter column plan_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_order_type_target_check'
  ) then
    alter table public.orders
      add constraint orders_order_type_target_check
      check (
        (order_type = 'membership' and plan_id is not null and course_product_id is null)
        or
        (order_type = 'course' and course_product_id is not null)
      );
  end if;
end $$;

create table if not exists public.course_registrations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  course_product_id uuid not null references public.course_products(id),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  registration_type text not null
    check (registration_type in ('new', 'returning')),
  amount integer not null check (amount >= 0),
  currency text not null default 'TWD',
  name text not null,
  gender text,
  phone text not null,
  line_id text,
  email text not null,
  learning_background text,
  interests text[] not null default '{}'::text[],
  motivation text,
  note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_order_type on public.orders(order_type);
create index if not exists idx_orders_course_product_id on public.orders(course_product_id);
create index if not exists idx_course_registrations_status on public.course_registrations(status);
create index if not exists idx_course_registrations_course_product_id on public.course_registrations(course_product_id);
create index if not exists idx_course_registrations_email on public.course_registrations(email);

create or replace function public.touch_course_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_course_products_updated_at on public.course_products;
create trigger trg_course_products_updated_at
before update on public.course_products
for each row execute function public.touch_course_products_updated_at();

create or replace function public.touch_course_registrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_course_registrations_updated_at on public.course_registrations;
create trigger trg_course_registrations_updated_at
before update on public.course_registrations
for each row execute function public.touch_course_registrations_updated_at();

alter table public.course_products enable row level security;
alter table public.course_registrations enable row level security;

drop policy if exists "course_products_select_active_or_admin" on public.course_products;
create policy "course_products_select_active_or_admin"
on public.course_products for select
using (is_active = true or public.is_admin());

drop policy if exists "course_registrations_select_self_or_admin" on public.course_registrations;
create policy "course_registrations_select_self_or_admin"
on public.course_registrations for select
using (user_id = public.current_profile_id() or public.is_admin());

insert into public.course_products (
  code,
  title,
  subtitle,
  description,
  course_date,
  starts_at,
  ends_at,
  location,
  price_new,
  price_returning,
  currency,
  sort_order
)
values (
  'zhangzhongjue-115-01',
  '五術掌訣初階班',
  '115年第一期',
  '掌中訣初階實體課程，完成綠界付款後即保留名額。',
  '2026-06-21',
  '2026-06-21 10:00:00+08',
  '2026-06-21 17:00:00+08',
  '巽風堪輿研究中心（台中市南屯區黎明路二段530號）',
  6000,
  500,
  'TWD',
  10
)
on conflict (code) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  course_date = excluded.course_date,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  location = excluded.location,
  price_new = excluded.price_new,
  price_returning = excluded.price_returning,
  currency = excluded.currency,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

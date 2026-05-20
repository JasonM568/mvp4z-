-- 0006_consultation_bookings.sql
-- 巽風預約諮詢表單 + 名單管理（同一張表）
-- 公開表單：任何人不需登入也能填寫
-- 後台：admin 看清單、改狀態、加備註、指派處理人

create table public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),

  -- 客戶資料（公開表單填寫）
  name text not null,
  email text,
  phone text,
  service text,                 -- 陰陽宅堪驗 / 年度企業顧問 / 命名 / 八字 / 易學決策報告 ...
  location text,                -- 地點：南投、台中…
  size text,                    -- 規模：60坪、3個據點…
  budget text,                  -- 預算選項
  urgency text,                 -- 急迫性
  schedule text,                -- 期望時間
  message text,                 -- 詳細描述
  source text not null default 'website',  -- website / line / phone / event
  raw_payload jsonb not null default '{}'::jsonb,

  -- 名單管理欄位（admin 維護）
  status text not null default 'pending' check (status in ('pending', 'contacted', 'confirmed', 'completed', 'cancelled', 'spam')),
  admin_note text,
  assigned_to uuid references public.profiles(id),
  follow_up_at timestamptz,

  -- 關聯：若客戶後來變成註冊會員可關聯
  profile_id uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bookings_status_created on public.consultation_bookings(status, created_at desc);
create index idx_bookings_assigned on public.consultation_bookings(assigned_to);
create index idx_bookings_email on public.consultation_bookings(email);

alter table public.consultation_bookings enable row level security;

-- 不開放任何 client 直接 select／insert／update／delete
-- 公開 POST /api/bookings 走 service role 寫入
-- admin GET/PATCH /api/admin/bookings 也走 service role
create policy "bookings_admin_select"
on public.consultation_bookings for select
using (public.is_admin());

-- updated_at 自動更新
create or replace function public.touch_consultation_bookings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_consultation_bookings_updated_at
before update on public.consultation_bookings
for each row execute function public.touch_consultation_bookings_updated_at();

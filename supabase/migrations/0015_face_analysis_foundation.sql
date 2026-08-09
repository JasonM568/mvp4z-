-- 巽風面相分析｜資料、隱私與私有照片儲存地基
-- 原始照片只能由 server-side service role 存取；一般 client 沒有 Storage object policy。

create table if not exists public.face_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_id uuid references public.member_entitlements(id) on delete set null,
  mode text not null check (mode in ('self', 'other')),
  subject_age integer check (subject_age between 1 and 120),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  third_party_consent boolean not null default false,
  status text not null default 'created' check (
    status in ('created', 'uploaded', 'quality_rejected', 'analyzing', 'completed', 'failed', 'deleted')
  ),
  storage_path text,
  mime_type text check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size integer check (file_size between 1 and 10485760),
  width integer check (width between 1 and 4096),
  height integer check (height between 1 and 4096),
  quality_result jsonb,
  vision_result jsonb,
  report_structured jsonb,
  report_text text,
  model_trace jsonb not null default '{}'::jsonb,
  usage_log_id uuid references public.usage_logs(id) on delete set null,
  credits_charged integer not null default 0 check (credits_charged >= 0),
  error_code text,
  image_expires_at timestamptz not null default (now() + interval '24 hours'),
  image_deleted_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint face_analysis_other_consent check (mode <> 'other' or third_party_consent = true),
  constraint face_analysis_completed_report check (
    status <> 'completed' or (
      report_text is not null and report_structured is not null and completed_at is not null
    )
  ),
  constraint face_analysis_run_owner_key unique (id, user_id)
);

create table if not exists public.face_analysis_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint face_analysis_event_owner_fk
    foreign key (run_id, user_id)
    references public.face_analysis_runs(id, user_id)
    on delete cascade
);

create index if not exists idx_face_runs_user_created
  on public.face_analysis_runs(user_id, created_at desc);
create index if not exists idx_face_runs_status_created
  on public.face_analysis_runs(status, created_at desc);
create index if not exists idx_face_runs_image_cleanup
  on public.face_analysis_runs(image_expires_at)
  where storage_path is not null and image_deleted_at is null;
create index if not exists idx_face_runs_entitlement
  on public.face_analysis_runs(entitlement_id);
create unique index if not exists idx_face_runs_storage_path_unique
  on public.face_analysis_runs(storage_path)
  where storage_path is not null;
create index if not exists idx_face_events_run_created
  on public.face_analysis_events(run_id, created_at desc);
create index if not exists idx_face_events_type_created
  on public.face_analysis_events(event_type, created_at desc);

alter table public.face_analysis_runs enable row level security;
alter table public.face_analysis_events enable row level security;

-- 只開放本人/admin SELECT；所有 INSERT/UPDATE/DELETE 均由 API 的 service role 執行。
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'face_analysis_runs'
      and policyname = 'face_runs_select_self_or_admin'
  ) then
    create policy "face_runs_select_self_or_admin"
      on public.face_analysis_runs for select
      using (user_id = public.current_profile_id() or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'face_analysis_events'
      and policyname = 'face_events_select_self_or_admin'
  ) then
    create policy "face_events_select_self_or_admin"
      on public.face_analysis_events for select
      using (user_id = public.current_profile_id() or public.is_admin());
  end if;
end
$$;

create or replace function public.touch_face_analysis_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_face_analysis_runs_updated_at on public.face_analysis_runs;
create trigger trg_face_analysis_runs_updated_at
before update on public.face_analysis_runs
for each row execute function public.touch_face_analysis_updated_at();

-- Bucket 設為 private。沒有建立 storage.objects client policy，代表瀏覽器端一律不可直讀／直寫。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'face-analysis-uploads',
  'face-analysis-uploads',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 面相規則設定檔：老師可保存草稿、具名發布；既有發布版只封存不覆寫。
-- settings 只存結構化的宮位／部位對應；安全限制與報告禁則仍由程式碼掌控。
create table if not exists public.face_rule_profiles (
  id uuid primary key default gen_random_uuid(),
  version_label text not null check (char_length(version_label) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  note text not null default '' check (char_length(note) <= 1000),
  decided_by text not null default '' check (char_length(decided_by) <= 80),
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint face_rule_profiles_published_at check (status <> 'published' or published_at is not null)
);

create unique index if not exists idx_face_rule_profiles_single_draft
  on public.face_rule_profiles (status) where status = 'draft';
create unique index if not exists idx_face_rule_profiles_single_published
  on public.face_rule_profiles (status) where status = 'published';

alter table public.face_analysis_runs
  add column if not exists face_rule_profile_id uuid references public.face_rule_profiles(id) on delete set null,
  add column if not exists face_rule_version text;
create index if not exists idx_face_runs_rule_profile
  on public.face_analysis_runs(face_rule_profile_id);

create or replace function public.touch_face_rule_profiles_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_face_rule_profiles_updated_at on public.face_rule_profiles;
create trigger trg_face_rule_profiles_updated_at before update on public.face_rule_profiles
for each row execute function public.touch_face_rule_profiles_updated_at();

alter table public.face_rule_profiles enable row level security;
revoke all on public.face_rule_profiles from anon, authenticated;
grant select, insert, update, delete on public.face_rule_profiles to service_role;
comment on table public.face_rule_profiles is 'Versioned, teacher-published Shen face-rule mappings; service role/admin API only.';

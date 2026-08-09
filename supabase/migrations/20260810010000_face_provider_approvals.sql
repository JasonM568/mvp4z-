-- 老師人工確認 OpenAI Organization / Project 已核准並啟用 Zero Data Retention。
-- 不保存 API key、密碼、token 或 OpenAI 登入資訊。

create table if not exists public.face_provider_approvals (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider = 'openai'),
  organization_label text not null check (char_length(organization_label) between 1 and 160),
  project_label text not null check (char_length(project_label) between 1 and 160),
  retention_mode text not null check (retention_mode = 'zero_data_retention'),
  approved_at date not null,
  attested boolean not null check (attested = true),
  status text not null default 'active' check (status in ('active', 'revoked')),
  note text not null default '' check (char_length(note) <= 1000),
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.face_provider_approvals enable row level security;
revoke all on table public.face_provider_approvals from anon, authenticated;
grant select, insert, update on table public.face_provider_approvals to service_role;

drop trigger if exists face_provider_approvals_updated_at on public.face_provider_approvals;
create trigger face_provider_approvals_updated_at
before update on public.face_provider_approvals
for each row execute function public.touch_face_analysis_updated_at();

comment on table public.face_provider_approvals is
  'Named-admin attestation that OpenAI Data controls show ZDR for the exact project; contains no provider credentials.';

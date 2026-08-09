-- 面相老師知識庫
create table if not exists public.face_knowledge_cards (
  id uuid primary key default gen_random_uuid(),
  card_id text not null unique,
  title text not null,
  category text not null,
  school text,
  technique text,
  observation text not null default '',
  teacher_original text,
  editor_summary text,
  rule_condition jsonb not null default '{}'::jsonb,
  safety_level text not null default 'standard' check (safety_level in ('standard','high','critical')),
  auto_report boolean not null default false,
  source_file text,
  source_pages integer[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','teacher_review','published','archived')),
  version integer not null default 1 check (version > 0),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint face_knowledge_published_review check (status <> 'published' or reviewed_at is not null),
  constraint face_knowledge_auto_report_safe check (auto_report = false or (status = 'published' and safety_level = 'standard')),
  constraint face_knowledge_rule_object check (jsonb_typeof(rule_condition) = 'object')
);

create index if not exists face_knowledge_category_status_idx on public.face_knowledge_cards(category, status);
create index if not exists face_knowledge_school_idx on public.face_knowledge_cards(school);
create index if not exists face_knowledge_source_idx on public.face_knowledge_cards(source_file);

create or replace function public.touch_face_knowledge_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists face_knowledge_cards_updated_at on public.face_knowledge_cards;
create trigger face_knowledge_cards_updated_at before update on public.face_knowledge_cards
for each row execute function public.touch_face_knowledge_updated_at();

create table if not exists public.face_knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references public.face_knowledge_cards(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  change_note text,
  created_at timestamptz not null default now(),
  unique(knowledge_id, version),
  constraint face_knowledge_revision_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);

revoke all on public.face_knowledge_cards from anon, authenticated;
revoke all on public.face_knowledge_revisions from anon, authenticated;
grant select, insert, update, delete on public.face_knowledge_cards to service_role;
grant select, insert on public.face_knowledge_revisions to service_role;

comment on table public.face_knowledge_cards is 'Teacher-maintained face-analysis literature cards; service role/admin API only.';

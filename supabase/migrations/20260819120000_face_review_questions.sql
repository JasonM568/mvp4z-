-- 待老師確認事項：原本只寫在 repo 的 SPEC markdown，老師看不到也無處回覆。
-- 搬進資料庫後，老師在後台直接回覆，答覆與具名紀錄一起保存，可回溯到是誰在什麼時候決定的。
create table if not exists public.face_review_questions (
  id uuid primary key default gen_random_uuid(),
  question_id text not null unique check (char_length(question_id) between 1 and 60),
  topic text not null default '' check (char_length(topic) <= 60),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 4000),
  source_ref text not null default '' check (char_length(source_ref) <= 300),
  related_rule_ids text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'answered', 'deferred')),
  answer text not null default '' check (char_length(answer) <= 4000),
  answered_by_name text not null default '' check (char_length(answered_by_name) <= 80),
  answered_by uuid references public.profiles(id) on delete set null,
  answered_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint face_review_questions_answered check (status <> 'answered' or (answered_at is not null and char_length(answer) > 0))
);

create index if not exists idx_face_review_questions_status
  on public.face_review_questions (status, sort_order);

create or replace function public.touch_face_review_questions_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_face_review_questions_updated_at on public.face_review_questions;
create trigger trg_face_review_questions_updated_at before update on public.face_review_questions
for each row execute function public.touch_face_review_questions_updated_at();

alter table public.face_review_questions enable row level security;
revoke all on public.face_review_questions from anon, authenticated;
grant select, insert, update, delete on public.face_review_questions to service_role;
comment on table public.face_review_questions is
  'Open questions awaiting the teacher''s ruling, answered in the admin backend; service role only.';

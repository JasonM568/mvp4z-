-- 面相判讀規則：把原本寫死在 lib/face-analysis 的教材條文搬進資料庫，
-- 讓老師可以逐條增刪改、具名發布，不必每次改程式碼。
--
-- 三種比對方式（kind）：
--   morphology  ── 依 Vision 的四個形態枚舉比對（輪廓／寬窄／長短／對稱），payload.condition 存條件
--   fingerprint ── 依 distinctiveFeatures 的 16 個特徵枚舉對應教材部位，payload 存部位與正反向條件
--   surface     ── 依斑痣疤痕所在部位對應宮位與主題
--
-- 安全：只有 safety_level = 'standard' 且 status = 'published' 的規則會進會員報告；
-- teacher_text 保存教材原文（含望診 CRITICAL 敘述），永遠只給老師版與稽核，不進撰稿模型。
create table if not exists public.face_teaching_rules (
  id uuid primary key default gen_random_uuid(),
  -- 穩定識別碼；報告的 citedTeachings 靠它回溯，發布後不應更動。
  rule_id text not null unique check (char_length(rule_id) between 1 and 60),
  kind text not null check (kind in ('morphology', 'fingerprint', 'surface')),
  -- 套用的部位：morphology/surface 用 Vision 部位名，fingerprint 用 16 個特徵枚舉。
  target text not null check (char_length(target) between 1 and 40),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  -- 進會員報告的教材說法。
  member_text text not null default '' check (char_length(member_text) <= 2000),
  -- 教材原文摘要，只給老師版與內部稽核。
  teacher_text text not null default '' check (char_length(teacher_text) <= 2000),
  themes text[] not null default '{}',
  palaces text[] not null default '{}',
  flow_year_ages int[] not null default '{}',
  safety_level text not null default 'standard' check (safety_level in ('standard', 'high', 'critical')),
  health_sensitive boolean not null default false,
  source_file text not null default '' check (char_length(source_file) <= 200),
  source_pages text not null default '' check (char_length(source_pages) <= 200),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order int not null default 0,
  note text not null default '' check (char_length(note) <= 1000),
  decided_by text not null default '' check (char_length(decided_by) <= 80),
  version int not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint face_teaching_rules_published_at check (status <> 'published' or published_at is not null)
);

create index if not exists idx_face_teaching_rules_active
  on public.face_teaching_rules (kind, status, safety_level);
create index if not exists idx_face_teaching_rules_target
  on public.face_teaching_rules (target);

-- 規則版本記入每次分析，稽核鏈才追得回「這份報告當時用的是哪一版規則」。
alter table public.face_analysis_runs
  add column if not exists face_teaching_rules_version text;

create or replace function public.touch_face_teaching_rules_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- 內容有變才進版；只改狀態或排序不算改版。
  if (new.payload is distinct from old.payload
      or new.member_text is distinct from old.member_text
      or new.teacher_text is distinct from old.teacher_text
      or new.themes is distinct from old.themes
      or new.palaces is distinct from old.palaces
      or new.flow_year_ages is distinct from old.flow_year_ages) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_face_teaching_rules_updated_at on public.face_teaching_rules;
create trigger trg_face_teaching_rules_updated_at before update on public.face_teaching_rules
for each row execute function public.touch_face_teaching_rules_updated_at();

alter table public.face_teaching_rules enable row level security;
revoke all on public.face_teaching_rules from anon, authenticated;
grant select, insert, update, delete on public.face_teaching_rules to service_role;
comment on table public.face_teaching_rules is
  'Teacher-editable Shen face-reading rules. Only status=published AND safety_level=standard reach member reports; teacher_text is audit-only.';

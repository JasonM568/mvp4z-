alter table public.face_analysis_runs
  add column if not exists knowledge_sources_used jsonb not null default '[]'::jsonb;

alter table public.face_analysis_runs
  drop constraint if exists face_analysis_runs_knowledge_sources_object;
alter table public.face_analysis_runs
  add constraint face_analysis_runs_knowledge_sources_array check (jsonb_typeof(knowledge_sources_used) = 'array');

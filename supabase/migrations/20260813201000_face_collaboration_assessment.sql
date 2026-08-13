alter table public.face_analysis_runs
  add column if not exists collaboration_assessment boolean not null default false,
  add column if not exists collaboration_project text;

alter table public.face_analysis_runs
  drop constraint if exists face_analysis_collaboration_project_required;

alter table public.face_analysis_runs
  add constraint face_analysis_collaboration_project_required check (
    collaboration_assessment = false
    or char_length(btrim(collaboration_project)) between 10 and 1000
  );

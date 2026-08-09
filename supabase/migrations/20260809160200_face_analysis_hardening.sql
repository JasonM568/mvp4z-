-- 面相子系統上線前強化：重試／刪除鎖、合法扣點、刪除資料最小化。

alter table public.face_analysis_runs
  add column if not exists analysis_attempts integer not null default 0,
  add column if not exists upload_attempts integer not null default 0,
  add column if not exists deletion_pending boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'face_analysis_attempts_range') then
    alter table public.face_analysis_runs
      add constraint face_analysis_attempts_range check (analysis_attempts between 0 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'face_upload_attempts_range') then
    alter table public.face_analysis_runs
      add constraint face_upload_attempts_range check (upload_attempts between 0 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'face_analysis_credits_allowed') then
    alter table public.face_analysis_runs
      add constraint face_analysis_credits_allowed check (credits_charged in (0, 20));
  end if;
end
$$;

drop index if exists public.idx_face_credit_debit_once;
create unique index idx_face_credit_debit_once
  on public.credit_transactions(source, ref_id)
  where source = 'ai_face_analysis' and type = 'debit';

create or replace function public.redact_face_analysis_run(
  p_run_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.face_analysis_runs%rowtype;
begin
  select * into v_run
  from public.face_analysis_runs
  where id = p_run_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'face analysis run not found' using errcode = 'FA404';
  end if;
  if not v_run.deletion_pending then
    raise exception 'face analysis deletion not claimed' using errcode = 'FA409';
  end if;

  if v_run.usage_log_id is not null then
    update public.usage_logs
    set prompt = null, reply = null
    where id = v_run.usage_log_id and user_id = p_user_id;
  end if;

  update public.face_analysis_runs
  set status = 'deleted',
      subject_age = null,
      storage_path = null,
      mime_type = null,
      file_size = null,
      width = null,
      height = null,
      quality_result = null,
      vision_result = null,
      report_structured = null,
      report_text = null,
      model_trace = '{}'::jsonb,
      usage_log_id = null,
      error_code = null,
      image_deleted_at = coalesce(image_deleted_at, now()),
      deleted_at = now(),
      deletion_pending = false
  where id = p_run_id;

  return jsonb_build_object(
    'id', p_run_id,
    'credits_charged', v_run.credits_charged,
    'created_at', v_run.created_at,
    'completed_at', v_run.completed_at,
    'deleted_at', now()
  );
end;
$$;

revoke all on function public.redact_face_analysis_run(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.redact_face_analysis_run(uuid, uuid)
  to service_role;

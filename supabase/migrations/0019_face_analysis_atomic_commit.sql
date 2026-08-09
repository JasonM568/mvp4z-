-- 0019｜巽風面相分析：成功後原子扣 20 點並完成 run

create unique index if not exists idx_face_credit_debit_once
  on public.credit_transactions(source, ref_id)
  where source = 'ai_face_analysis' and type = 'debit';

create or replace function public.commit_face_analysis_credit(
  p_run_id uuid,
  p_user_id uuid,
  p_entitlement_id uuid,
  p_usage_log_id uuid,
  p_charge integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.face_analysis_runs%rowtype;
  v_balance_after integer;
  v_tx_id uuid;
begin
  if p_charge <> 20 then
    raise exception 'invalid face analysis charge' using errcode = 'FA000';
  end if;

  select * into v_run
  from public.face_analysis_runs
  where id = p_run_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'face analysis run not found' using errcode = 'FA404';
  end if;

  if v_run.status = 'completed' then
    return jsonb_build_object(
      'already_completed', true,
      'credits_charged', v_run.credits_charged
    );
  end if;

  if v_run.status <> 'analyzing'
    or v_run.report_text is null
    or v_run.report_structured is null then
    raise exception 'face analysis report is not ready' using errcode = 'FA409';
  end if;

  if v_run.entitlement_id is not null and v_run.entitlement_id <> p_entitlement_id then
    raise exception 'entitlement does not match run' using errcode = 'FA409';
  end if;

  if not exists (
    select 1 from public.usage_logs
    where id = p_usage_log_id
      and user_id = p_user_id
      and entitlement_id = p_entitlement_id
      and type = 'face_analysis'
  ) then
    raise exception 'usage log does not match run' using errcode = 'FA409';
  end if;

  update public.member_entitlements
  set credits_remaining = credits_remaining - p_charge
  where id = p_entitlement_id
    and user_id = p_user_id
    and status = 'active'
    and expires_at >= now()
    and credits_remaining >= p_charge
  returning credits_remaining into v_balance_after;

  if not found then
    raise exception 'insufficient or changed credits' using errcode = 'FA001';
  end if;

  insert into public.credit_transactions (
    user_id, entitlement_id, type, amount, balance_after, source, ref_id
  ) values (
    p_user_id,
    p_entitlement_id,
    'debit',
    -p_charge,
    v_balance_after,
    'ai_face_analysis',
    p_run_id::text
  )
  returning id into v_tx_id;

  update public.face_analysis_runs
  set entitlement_id = p_entitlement_id,
      usage_log_id = p_usage_log_id,
      credits_charged = p_charge,
      status = 'completed',
      completed_at = now(),
      error_code = null
  where id = p_run_id;

  return jsonb_build_object(
    'already_completed', false,
    'tx_id', v_tx_id,
    'balance_after', v_balance_after,
    'credits_charged', p_charge
  );
exception
  when unique_violation then
    -- source + run id 唯一，重試不可重複扣點；transaction 會回滾前面的餘額更新。
    raise exception 'face analysis debit already exists' using errcode = 'FA409';
end;
$$;

revoke all on function public.commit_face_analysis_credit(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.commit_face_analysis_credit(uuid, uuid, uuid, uuid, integer)
  to service_role;

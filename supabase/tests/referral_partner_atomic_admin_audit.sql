-- Run after 20260831120000_referral_partners.sql and 20261011150000.
-- Exercises audit snapshots and transaction rollback; leaves no rows behind.
begin;

create function public.qa_c7_fail_audit() returns trigger
language plpgsql
as $$
begin
  if current_setting('qa.c7_fail_audit', true) = 'on' then
    raise exception 'injected C7 audit failure';
  end if;
  return new;
end;
$$;

create trigger qa_c7_fail_audit
before insert on public.admin_audit_logs
for each row execute function public.qa_c7_fail_audit();

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_other_admin_id uuid := gen_random_uuid();
  v_partner_id uuid;
  v_partner jsonb;
  v_metadata jsonb;
begin
  if has_function_privilege('anon', 'public.manage_referral_partner(text,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.manage_referral_partner(text,jsonb,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.manage_referral_partner(text,jsonb,uuid)', 'execute') then
    raise exception 'C7 RPC execute grants are incorrect';
  end if;

  insert into public.profiles (id, email, role)
  values
    (v_admin_id, 'qa-c7-admin-' || v_admin_id || '@example.test', 'admin'),
    (v_other_admin_id, 'qa-c7-other-' || v_other_admin_id || '@example.test', 'admin');

  v_partner := public.manage_referral_partner(
    'create',
    jsonb_build_object('code', 'C7_' || substr(v_admin_id::text, 1, 8), 'name', 'C7 fixture', 'commission_rate', 0.25),
    v_admin_id
  )->'partner';
  v_partner_id := (v_partner->>'id')::uuid;

  perform public.manage_referral_partner(
    'update',
    jsonb_build_object('id', v_partner_id, 'commission_rate', 0.30, 'is_active', false),
    v_other_admin_id
  );

  select metadata into v_metadata
  from public.admin_audit_logs
  where target_id = v_partner_id::text and action = 'referral_partner_updated';

  if v_metadata #>> '{before,commission_rate}' <> '0.2500'
    or v_metadata #>> '{before,is_active}' <> 'true'
    or v_metadata #>> '{after,commission_rate}' <> '0.3000'
    or v_metadata #>> '{after,is_active}' <> 'false' then
    raise exception 'C7 before/after audit snapshot mismatch: %', v_metadata;
  end if;

  if (select count(*) from public.admin_audit_logs where target_id = v_partner_id::text) <> 2
    or (select count(*) from public.admin_audit_logs where target_id = v_partner_id::text and admin_user_id in (v_admin_id, v_other_admin_id)) <> 2 then
    raise exception 'C7 create/update audit attribution missing';
  end if;

  perform set_config('qa.c7_fail_audit', 'on', true);

  begin
    perform public.manage_referral_partner(
      'create',
      jsonb_build_object('code', 'C7F_' || substr(v_admin_id::text, 1, 8), 'name', 'Must roll back', 'commission_rate', 0.2),
      v_admin_id
    );
    raise exception 'C7 create failure injection did not fire';
  exception when others then
    if sqlerrm = 'C7 create failure injection did not fire' then raise; end if;
  end;

  begin
    perform public.manage_referral_partner(
      'update',
      jsonb_build_object('id', v_partner_id, 'commission_rate', 0.4, 'is_active', true),
      v_admin_id
    );
    raise exception 'C7 update failure injection did not fire';
  exception when others then
    if sqlerrm = 'C7 update failure injection did not fire' then raise; end if;
  end;

  if exists (select 1 from public.referral_partners where code = 'C7F_' || substr(v_admin_id::text, 1, 8)) then
    raise exception 'C7 create row survived audit failure';
  end if;
  if not exists (
    select 1 from public.referral_partners
    where id = v_partner_id and commission_rate = 0.3000 and is_active = false
  ) then
    raise exception 'C7 update survived audit failure';
  end if;
  if (select count(*) from public.admin_audit_logs where target_id = v_partner_id::text) <> 2 then
    raise exception 'C7 audit failure left an extra audit row';
  end if;
end;
$$;

rollback;

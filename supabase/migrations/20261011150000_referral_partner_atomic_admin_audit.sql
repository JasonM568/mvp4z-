create or replace function public.manage_referral_partner(
  p_action text,
  p_payload jsonb,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_before public.referral_partners%rowtype;
  v_after public.referral_partners%rowtype;
  v_id uuid;
begin
  if p_admin_user_id is null then
    raise exception using errcode = '42501', message = 'REFERRAL_NAMED_ADMIN_REQUIRED';
  end if;

  if p_action = 'create' then
    insert into public.referral_partners (code, name, contact, commission_rate, note)
    values (
      p_payload->>'code',
      p_payload->>'name',
      coalesce(p_payload->>'contact', ''),
      coalesce((p_payload->>'commission_rate')::numeric, 0.2000),
      coalesce(p_payload->>'note', '')
    )
    returning * into v_after;

    insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    values (
      p_admin_user_id,
      'referral_partner_created',
      'referral_partner',
      v_after.id::text,
      jsonb_build_object('after', jsonb_build_object(
        'code', v_after.code,
        'name', v_after.name,
        'contact', v_after.contact,
        'commission_rate', v_after.commission_rate,
        'is_active', v_after.is_active,
        'note', v_after.note
      ))
    );

    return jsonb_build_object('partner', to_jsonb(v_after));
  elsif p_action = 'update' then
    v_id := (p_payload->>'id')::uuid;
    select * into v_before
    from public.referral_partners
    where id = v_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'REFERRAL_PARTNER_NOT_FOUND';
    end if;

    update public.referral_partners set
      name = case when p_payload ? 'name' then p_payload->>'name' else v_before.name end,
      contact = case when p_payload ? 'contact' then p_payload->>'contact' else v_before.contact end,
      note = case when p_payload ? 'note' then p_payload->>'note' else v_before.note end,
      is_active = case when p_payload ? 'is_active' then (p_payload->>'is_active')::boolean else v_before.is_active end,
      commission_rate = case when p_payload ? 'commission_rate'
        then (p_payload->>'commission_rate')::numeric else v_before.commission_rate end
    where id = v_id
    returning * into v_after;

    insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    values (
      p_admin_user_id,
      'referral_partner_updated',
      'referral_partner',
      v_after.id::text,
      jsonb_build_object(
        'before', jsonb_build_object(
          'commission_rate', v_before.commission_rate,
          'is_active', v_before.is_active
        ),
        'after', jsonb_build_object(
          'commission_rate', v_after.commission_rate,
          'is_active', v_after.is_active
        )
      )
    );

    return jsonb_build_object('partner', to_jsonb(v_after));
  end if;

  raise exception using errcode = '22023', message = 'REFERRAL_INVALID_ACTION';
end;
$$;

revoke all on function public.manage_referral_partner(text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_referral_partner(text, jsonb, uuid)
  to service_role;
grant select, insert, update on public.referral_partners to service_role;
grant insert on public.admin_audit_logs to service_role;

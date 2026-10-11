create or replace function public.manage_face_knowledge(
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
  v_card public.face_knowledge_cards%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_id uuid;
  v_item jsonb;
  v_status text;
  v_action text;
  v_expected_version integer;
begin
  if p_admin_user_id is null then
    raise exception using errcode = '42501', message = 'FACE_KNOWLEDGE_NAMED_ADMIN_REQUIRED';
  end if;

  if p_action = 'create' then
    insert into public.face_knowledge_cards (
      card_id, title, category, school, technique, observation,
      teacher_original, editor_summary, rule_condition, safety_level,
      auto_report, source_file, source_pages, status, reviewed_by,
      reviewed_at, created_by, updated_by
    ) values (
      p_payload->>'card_id', p_payload->>'title', p_payload->>'category',
      p_payload->>'school', p_payload->>'technique',
      coalesce(p_payload->>'observation', ''), p_payload->>'teacher_original',
      p_payload->>'editor_summary', coalesce(p_payload->'rule_condition', '{}'::jsonb),
      coalesce(p_payload->>'safety_level', 'standard'),
      coalesce((p_payload->>'auto_report')::boolean, false),
      p_payload->>'source_file',
      coalesce(array(select jsonb_array_elements_text(p_payload->'source_pages')::integer), '{}'::integer[]),
      coalesce(p_payload->>'status', 'draft'),
      case when p_payload->>'status' = 'published' then p_admin_user_id else null end,
      case when p_payload->>'status' = 'published' then now() else null end,
      p_admin_user_id, p_admin_user_id
    ) returning * into v_card;

    insert into public.face_knowledge_revisions (knowledge_id, version, snapshot, changed_by, change_note)
    values (v_card.id, v_card.version, to_jsonb(v_card), p_admin_user_id, coalesce(p_payload->>'change_note', '建立'));
    insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    values (p_admin_user_id, 'face_knowledge_created', 'face_knowledge', v_card.id::text, '{}'::jsonb);
    return jsonb_build_object('items', jsonb_build_array(to_jsonb(v_card)));

  elsif p_action = 'patch' then
    v_id := (p_payload->>'id')::uuid;
    v_expected_version := (p_payload->>'expected_version')::integer;
    select * into v_card from public.face_knowledge_cards where id = v_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'FACE_KNOWLEDGE_NOT_FOUND';
    end if;
    if v_expected_version is null or v_card.version <> v_expected_version then
      return jsonb_build_object('conflict', true, 'current_version', v_card.version);
    end if;

    v_status := coalesce(p_payload->>'status', v_card.status);
    update public.face_knowledge_cards as c set
      title = case when p_payload ? 'title' then p_payload->>'title' else c.title end,
      category = case when p_payload ? 'category' then p_payload->>'category' else c.category end,
      school = case when p_payload ? 'school' then p_payload->>'school' else c.school end,
      technique = case when p_payload ? 'technique' then p_payload->>'technique' else c.technique end,
      observation = case when p_payload ? 'observation' then p_payload->>'observation' else c.observation end,
      teacher_original = case when p_payload ? 'teacher_original' then p_payload->>'teacher_original' else c.teacher_original end,
      editor_summary = case when p_payload ? 'editor_summary' then p_payload->>'editor_summary' else c.editor_summary end,
      rule_condition = case when p_payload ? 'rule_condition' then p_payload->'rule_condition' else c.rule_condition end,
      safety_level = case when p_payload ? 'safety_level' then p_payload->>'safety_level' else c.safety_level end,
      auto_report = case when p_payload ? 'auto_report' then (p_payload->>'auto_report')::boolean else c.auto_report end,
      source_file = case when p_payload ? 'source_file' then p_payload->>'source_file' else c.source_file end,
      source_pages = case when p_payload ? 'source_pages' then array(select jsonb_array_elements_text(p_payload->'source_pages')::integer) else c.source_pages end,
      status = v_status,
      reviewed_by = case when v_status = 'published' then p_admin_user_id else c.reviewed_by end,
      reviewed_at = case when v_status = 'published' then now() else c.reviewed_at end,
      version = c.version + 1,
      updated_by = p_admin_user_id
    where c.id = v_id and c.version = v_expected_version
    returning c.* into v_card;
    if not found then
      return jsonb_build_object('conflict', true);
    end if;

    insert into public.face_knowledge_revisions (knowledge_id, version, snapshot, changed_by, change_note)
    values (v_card.id, v_card.version, to_jsonb(v_card), p_admin_user_id, coalesce(p_payload->>'change_note', '更新'));
    insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    values (p_admin_user_id, 'face_knowledge_updated', 'face_knowledge', v_card.id::text, jsonb_build_object('status', v_status, 'version', v_card.version));
    return jsonb_build_object('items', jsonb_build_array(to_jsonb(v_card)));

  elsif p_action = 'archive' then
    v_id := (p_payload->>'id')::uuid;
    select * into v_card from public.face_knowledge_cards where id = v_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'FACE_KNOWLEDGE_NOT_FOUND';
    end if;
    update public.face_knowledge_cards set status = 'archived', auto_report = false,
      updated_by = p_admin_user_id, version = version + 1
    where id = v_id returning * into v_card;
    insert into public.face_knowledge_revisions (knowledge_id, version, snapshot, changed_by, change_note)
    values (v_card.id, v_card.version, to_jsonb(v_card), p_admin_user_id, '封存');
    insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    values (p_admin_user_id, 'face_knowledge_archived', 'face_knowledge', v_card.id::text, jsonb_build_object('version', v_card.version));
    return jsonb_build_object('items', jsonb_build_array(to_jsonb(v_card)));

  elsif p_action = 'bulk' then
    v_action := p_payload->>'action';
    v_status := case v_action when 'submit_review' then 'teacher_review' when 'publish' then 'published' when 'archive' then 'archived' else null end;
    if v_status is null then
      raise exception using errcode = '22023', message = 'FACE_KNOWLEDGE_INVALID_BULK_ACTION';
    end if;
    select array_agg(distinct value::uuid order by value::uuid) into v_ids
    from jsonb_array_elements_text(p_payload->'ids') as ids(value);
    for v_id in select unnest(coalesce(v_ids, '{}'::uuid[])) order by 1 loop
      select * into v_card from public.face_knowledge_cards where id = v_id for update;
      if not found then continue; end if;
      update public.face_knowledge_cards set
        status = v_status,
        updated_by = p_admin_user_id,
        version = version + 1,
        reviewed_by = case when v_action = 'publish' then p_admin_user_id else reviewed_by end,
        reviewed_at = case when v_action = 'publish' then now() else reviewed_at end,
        auto_report = case when v_action = 'archive' then false else auto_report end
      where id = v_id returning * into v_card;
      insert into public.face_knowledge_revisions (knowledge_id, version, snapshot, changed_by, change_note)
      values (v_card.id, v_card.version, to_jsonb(v_card), p_admin_user_id, '批次' || v_action);
      insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
      values (p_admin_user_id, 'face_knowledge_bulk_' || v_action, 'face_knowledge', v_card.id::text,
        jsonb_build_object('ids', to_jsonb(v_ids), 'count', cardinality(v_ids), 'version', v_card.version));
      v_result := v_result || jsonb_build_array(to_jsonb(v_card));
    end loop;
    return jsonb_build_object('items', v_result);

  elsif p_action = 'import' then
    if exists (
      select 1
      from jsonb_array_elements(p_payload->'items') as input_items(value)
      group by value->>'card_id'
      having count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'FACE_KNOWLEDGE_DUPLICATE_IMPORT_CARD_ID';
    end if;
    for v_item in
      select value
      from jsonb_array_elements(p_payload->'items') as import_items(value)
      order by value->>'card_id'
    loop
      insert into public.face_knowledge_cards (
        card_id, title, category, school, technique, observation,
        teacher_original, editor_summary, rule_condition, safety_level,
        auto_report, source_file, source_pages, status, created_by, updated_by
      ) values (
        v_item->>'card_id', v_item->>'title', v_item->>'category', v_item->>'school',
        v_item->>'technique', coalesce(v_item->>'observation', ''),
        v_item->>'teacher_original', v_item->>'editor_summary',
        coalesce(v_item->'rule_condition', '{}'::jsonb), coalesce(v_item->>'safety_level', 'standard'),
        false, v_item->>'source_file',
        coalesce(array(select jsonb_array_elements_text(v_item->'source_pages')::integer), '{}'::integer[]),
        'draft', p_admin_user_id, p_admin_user_id
      ) on conflict (card_id) do update set
        title = excluded.title, category = excluded.category, school = excluded.school,
        technique = excluded.technique, observation = excluded.observation,
        teacher_original = excluded.teacher_original, editor_summary = excluded.editor_summary,
        rule_condition = excluded.rule_condition, safety_level = excluded.safety_level,
        auto_report = false, source_file = excluded.source_file, source_pages = excluded.source_pages,
        status = 'draft', updated_by = p_admin_user_id,
        version = public.face_knowledge_cards.version + 1
      returning * into v_card;
      insert into public.face_knowledge_revisions (knowledge_id, version, snapshot, changed_by, change_note)
      values (v_card.id, v_card.version, to_jsonb(v_card), p_admin_user_id, '匯入');
      insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
      values (p_admin_user_id, 'face_knowledge_imported', 'face_knowledge', v_card.id::text,
        jsonb_build_object('forcedDraft', true, 'version', v_card.version));
      v_result := v_result || jsonb_build_array(jsonb_build_object('id', v_card.id, 'card_id', v_card.card_id, 'status', v_card.status, 'version', v_card.version));
    end loop;
    return jsonb_build_object('items', v_result);
  end if;

  raise exception using errcode = '22023', message = 'FACE_KNOWLEDGE_INVALID_ACTION';
end;
$$;

revoke all on function public.manage_face_knowledge(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.manage_face_knowledge(text, jsonb, uuid) to service_role;

grant select, insert, update on public.face_knowledge_cards to service_role;
grant select, insert on public.face_knowledge_revisions to service_role;
grant insert on public.admin_audit_logs to service_role;

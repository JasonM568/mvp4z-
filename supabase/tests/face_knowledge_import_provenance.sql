-- Run after the face knowledge base and atomic revisions migrations.
-- The surrounding transaction leaves no fixture data behind.
begin;

do $$
declare
  v_creator uuid := gen_random_uuid();
  v_importer uuid := gen_random_uuid();
  v_card_id uuid;
begin
  insert into public.profiles (id, email, role)
  values
    (v_creator, 'c6-creator-' || v_creator || '@example.test', 'admin'),
    (v_importer, 'c6-importer-' || v_importer || '@example.test', 'admin');

  v_card_id := (public.manage_face_knowledge(
    'create',
    jsonb_build_object('card_id', 'C6-PROVENANCE-' || v_creator, 'title', 'Original', 'category', 'test'),
    v_creator
  ) #>> '{items,0,id}')::uuid;

  perform public.manage_face_knowledge(
    'import',
    jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'card_id', 'C6-PROVENANCE-' || v_creator,
      'title', 'Imported',
      'category', 'test'
    ))),
    v_importer
  );

  if (select created_by from public.face_knowledge_cards where id = v_card_id) is distinct from v_creator then
    raise exception 'C6 regression: import changed the original created_by';
  end if;

  if (select updated_by from public.face_knowledge_cards where id = v_card_id) is distinct from v_importer then
    raise exception 'C6 regression: importer was not recorded as updated_by';
  end if;

  if not exists (
    select 1 from public.face_knowledge_revisions
    where knowledge_id = v_card_id and version = 2 and changed_by = v_importer
  ) then
    raise exception 'C6 regression: importer was not recorded on the new revision';
  end if;
end;
$$;

rollback;

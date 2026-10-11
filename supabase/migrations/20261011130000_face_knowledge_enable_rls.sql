-- Face knowledge is only accessed from server routes using service_role.
-- Enable RLS as a second boundary while preserving those server permissions.

alter table public.face_knowledge_cards enable row level security;
alter table public.face_knowledge_revisions enable row level security;

revoke all on public.face_knowledge_cards from public, anon, authenticated;
revoke all on public.face_knowledge_revisions from public, anon, authenticated;

grant select, insert, update, delete on public.face_knowledge_cards to service_role;
grant select, insert on public.face_knowledge_revisions to service_role;

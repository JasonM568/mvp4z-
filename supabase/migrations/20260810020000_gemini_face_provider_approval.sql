-- 允許風義老師具名認證 Vertex AI / Gemini 影像專案。
-- 此表只保存 Project / region / 核准日期，不保存 API key 或 Google 登入資訊。

alter table public.face_provider_approvals
  drop constraint if exists face_provider_approvals_provider_check;

alter table public.face_provider_approvals
  add constraint face_provider_approvals_provider_check
  check (provider in ('openai', 'gemini'));

comment on table public.face_provider_approvals is
  'Named-admin attestation for OpenAI or Gemini/Vertex image retention controls; contains no provider credentials.';

-- prompt_profiles_and_documents（檔名與遠端 migration history 對齊）
-- 風羿老師後台維護模組：報告設定版本化 + 專業文件庫
--
-- 重點：
-- 1. ai_prompt_profiles：老師在後台編輯的報告設定，整包存 jsonb（由 zod 驗證形狀）。
--    版本化：draft 可任意改；published 同時只有一筆；改版發布時舊版轉 archived。
--    每份報告會記下當時用的 profile id，歷史報告因此可以還原當時的設定。
-- 2. ai_documents：老師上傳的專業文件。檔案本體放 Supabase Storage，
--    這裡存 metadata 與抽出的純文字。include_in_prompt 控制是否納入報告 prompt。
-- 3. council_runs 加 prompt_profile_id，讓每份報告可追溯設定來源。
--
-- 寫入一律走 service_role（admin API）；RLS 只開 admin 讀取，不開放 client 寫。
--
-- 套用方式：Supabase SQL Editor 直接執行。可重複執行。

-- ---------------------------------------------------------------- 報告設定

create table if not exists public.ai_prompt_profiles (
  id uuid primary key default gen_random_uuid(),
  version_label text not null,                    -- 例如「v1」「v2 調整八字段落」
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  settings jsonb not null,                        -- 整包設定，形狀由 promptSettingsSchema 驗證
  note text not null default '',                  -- 老師自己的版本備註
  created_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.ai_prompt_profiles.settings is
  '報告設定完整內容。欄位結構見 lib/ai/council/settings/schema.ts；讀取時再驗證一次，驗證失敗回退程式預設值';
comment on column public.ai_prompt_profiles.status is
  'draft 可任意編輯；published 同時只能有一筆（下方 partial unique index 強制）；archived 為歷史版本，唯讀';

-- 同時只能有一筆 published，避免「到底哪一版在生效」說不清楚
create unique index if not exists idx_ai_prompt_profiles_single_published
  on public.ai_prompt_profiles (status)
  where status = 'published';

create index if not exists idx_ai_prompt_profiles_status_updated
  on public.ai_prompt_profiles (status, updated_at desc);

-- ---------------------------------------------------------------- 文件庫

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'reference'
    check (category in ('principle', 'case', 'teaching', 'reference')),
  term text                                        -- 可選：綁定某一術（bazi/qimen/liuyao/meihua）
    check (term is null or term in ('bazi', 'qimen', 'liuyao', 'meihua')),

  storage_path text not null,                      -- Supabase Storage 內的路徑
  original_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),

  -- txt / pdf / word 抽出的純文字；圖片為 null（純文字模型讀不到圖）
  extracted_text text,
  char_count integer not null default 0 check (char_count >= 0),

  -- 是否納入報告 prompt。預設否——納入會讓每份報告的 prompt 變長，
  -- 而 prompt 在一次報告裡要送 7 次，成本與逾時風險都會放大。
  include_in_prompt boolean not null default false,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.ai_documents.extracted_text is
  '純文字內容。圖片（jpg/png）不抽字，此欄為 null 且不得納入 prompt';
comment on column public.ai_documents.include_in_prompt is
  '納入報告 prompt。總字數上限見 DOCUMENT_CHAR_BUDGET；圖片一律不可納入';

create index if not exists idx_ai_documents_included
  on public.ai_documents (include_in_prompt)
  where include_in_prompt = true;

create index if not exists idx_ai_documents_category_created
  on public.ai_documents (category, created_at desc);

-- ---------------------------------------------------------------- 報告追溯

alter table public.council_runs
  add column if not exists prompt_profile_id uuid references public.ai_prompt_profiles(id);

comment on column public.council_runs.prompt_profile_id is
  '本份報告產出時採用的設定版本。null 代表用程式預設值（後台上線前的歷史報告皆為 null）';

-- ---------------------------------------------------------------- updated_at

create or replace function public.touch_ai_prompt_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_prompt_profiles_updated_at on public.ai_prompt_profiles;
create trigger trg_ai_prompt_profiles_updated_at
before update on public.ai_prompt_profiles
for each row execute function public.touch_ai_prompt_profiles_updated_at();

create or replace function public.touch_ai_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_documents_updated_at on public.ai_documents;
create trigger trg_ai_documents_updated_at
before update on public.ai_documents
for each row execute function public.touch_ai_documents_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.ai_prompt_profiles enable row level security;
alter table public.ai_documents enable row level security;

-- 只有 admin 能讀；寫入全部走 service_role（admin API），不開 client 寫入 policy。
drop policy if exists "ai_prompt_profiles_admin_select" on public.ai_prompt_profiles;
create policy "ai_prompt_profiles_admin_select"
on public.ai_prompt_profiles for select
using (public.is_admin());

drop policy if exists "ai_documents_admin_select" on public.ai_documents;
create policy "ai_documents_admin_select"
on public.ai_documents for select
using (public.is_admin());

-- ---------------------------------------------------------------- Storage

-- 私有 bucket：文件可能含客戶案例，不可公開。存取一律由 server 產生簽章網址。
insert into storage.buckets (id, name, public)
values ('yixue-documents', 'yixue-documents', false)
on conflict (id) do nothing;

-- Storage 也只開 admin 讀取；上傳與刪除走 service_role。
drop policy if exists "yixue_documents_admin_select" on storage.objects;
create policy "yixue_documents_admin_select"
on storage.objects for select
using (bucket_id = 'yixue-documents' and public.is_admin());

-- school_profiles（檔名與遠端 migration history 對齊）
-- 排盤流派設定版本化
--
-- 重點：
-- 1. 與 ai_prompt_profiles 同一套模式：draft 可任意改、published 同時只有一筆、
--    改版時舊版轉 archived。
-- 2. 為什麼要版本化而不是直接改一筆：流派改動會讓所有盤的干支改變，
--    council_runs.school_version 必須能指回當時的算法，歷史報告才重現得了。
-- 3. decided_by 記下拍板人——流派是專業決策，要留下是誰決定的。
--
-- 套用方式：Supabase SQL Editor 直接執行。可重複執行。
-- 註：本檔已於 2026-08-09 套用至正式專案 pvasgmmjrodukudbzuhp。

create table if not exists public.ai_school_profiles (
  id uuid primary key default gen_random_uuid(),
  version_label text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  settings jsonb not null,
  note text not null default '',
  decided_by text not null default '',
  created_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.ai_school_profiles.settings is
  '流派設定內容。欄位結構見 lib/yixue/school/schema.ts；讀取時再驗證，失敗回退程式預設值';
comment on column public.ai_school_profiles.decided_by is
  '拍板人（風羿老師）。流派是專業決策，要留下是誰決定的';

create unique index if not exists idx_ai_school_profiles_single_published
  on public.ai_school_profiles (status)
  where status = 'published';

create or replace function public.touch_ai_school_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_school_profiles_updated_at on public.ai_school_profiles;
create trigger trg_ai_school_profiles_updated_at
before update on public.ai_school_profiles
for each row execute function public.touch_ai_school_profiles_updated_at();

alter table public.ai_school_profiles enable row level security;

drop policy if exists "ai_school_profiles_admin_select" on public.ai_school_profiles;
create policy "ai_school_profiles_admin_select"
on public.ai_school_profiles for select
using (public.is_admin());

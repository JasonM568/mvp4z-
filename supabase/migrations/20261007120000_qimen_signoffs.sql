-- 奇門遁甲校對與簽核紀錄（append-only）。
--
-- 為什麼不放進 ai_school_profiles：流派簽核管的是曆法／梅花／六爻／八字，2026-09-08 已簽；
-- 奇門的定局法是同日稍後才加進來的，沒有被那次簽核涵蓋。兩者要分開記，
-- 否則「流派已簽核」會讓人誤以為奇門也驗過了。
--
-- 每次校對都留一列（無論通過或不通過），不更新、不刪除：
-- 老師指出的差異就是工程要修的東西，覆蓋掉等於丟掉證據。
-- 「目前是否已簽核」＝ 最新一列 approved 為 true 且 rule_version 與程式現行規則相同。

create table if not exists public.qimen_signoffs (
  id uuid primary key default gen_random_uuid(),
  rule_version text not null,
  method text not null default '拆補',
  approved boolean not null,
  signed_by text not null,
  signed_by_profile uuid references public.profiles(id),
  case_results jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_qimen_signoffs_created on public.qimen_signoffs (created_at desc);

alter table public.qimen_signoffs enable row level security;
-- 不開任何 policy：只有 service_role（後台 API）讀寫。

-- 0004_council_runs.sql
-- 巽風易學決策系統｜council 報告完整紀錄表
-- 一份報告 = 7 次 LLM 呼叫，需保留所有中間結果供 admin 後台與成本追蹤

create table public.council_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_id uuid not null references public.member_entitlements(id),
  usage_log_id uuid references public.usage_logs(id),
  request jsonb not null,
  first_round jsonb,
  debate_round jsonb,
  final_label text,
  final_text text,
  final_ok boolean not null default false,
  fallback_used boolean not null default false,
  total_tokens_in integer not null default 0,
  total_tokens_out integer not null default 0,
  credits_charged integer not null default 0,
  free_quota_used boolean not null default false,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_council_runs_user_created on public.council_runs(user_id, created_at desc);
create index idx_council_runs_entitlement on public.council_runs(entitlement_id);
create index idx_council_runs_generated_at on public.council_runs(generated_at desc);

alter table public.council_runs enable row level security;

create policy "council_runs_select_self_or_admin"
on public.council_runs for select
using (user_id = public.current_profile_id() or public.is_admin());

-- council_runs 不允許 client 直接 insert／update／delete，全部由 API 端用 service role 寫入
-- 故未建立 insert/update/delete policy，service role bypass RLS 仍可寫入

-- 易學決策報告｜每位會員同時只允許 1 份進行中（QA-B1）
--
-- 問題：council 預檢點數與扣點之間隔著 7 次 LLM（數分鐘）。並行請求都通過預檢，
-- 第一個扣點成功，其餘撞 CR002 後「報告照送、不扣點」，一份點數換多份報告。
-- 作法：LLM 開跑前先搶一個 per-user slot，搶不到就拒絕。slot 有 TTL，
-- function 被 kill 沒釋放也會自己過期，不會把會員永久鎖死。

create table if not exists public.council_inflight (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.council_inflight enable row level security;
-- 不開任何 policy：只有 service_role 經由下面兩個 function 存取。

create or replace function public.acquire_council_slot(p_user_id uuid, p_ttl_seconds integer default 330)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_got uuid;
begin
  insert into public.council_inflight (user_id, started_at, expires_at)
  values (p_user_id, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (user_id) do update
    set started_at = excluded.started_at, expires_at = excluded.expires_at
    where public.council_inflight.expires_at <= now()
  returning user_id into v_got;
  return v_got is not null;
end;
$$;

create or replace function public.release_council_slot(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.council_inflight where user_id = p_user_id;
$$;

revoke all on function public.acquire_council_slot(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_council_slot(uuid) from public, anon, authenticated;
grant execute on function public.acquire_council_slot(uuid, integer) to service_role;
grant execute on function public.release_council_slot(uuid) to service_role;

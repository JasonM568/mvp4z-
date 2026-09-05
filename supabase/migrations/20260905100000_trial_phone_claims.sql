-- 註冊贈點防刷：讓「同一支手機只領一次免費體驗」成為資料庫層的不變條件。
--
-- 背景：原本註冊即送 30 點（≈ 277 元的服務），有人在 trial 到期當天換 email 重註冊再領一次。
-- 純用 SELECT 檢查擋不住兩件事：
--   1. 併發 —— 同時送兩個註冊，兩邊都查到「沒人領過」，各發一次。
--   2. 半完成 —— entitlement 建好但交易紀錄寫失敗，人有點數、系統卻沒有領過的證據。
-- 解法是一張以手機為 primary key 的認領表 + 一個把三件事包在同一個 transaction 的 function。

create table if not exists public.trial_phone_claims (
  -- 只收正規化後的台灣手機（09xxxxxxxx）。primary key 就是併發鎖。
  phone text primary key check (phone ~ '^09[0-9]{8}$'),
  -- 刻意用 set null 而非 cascade：帳號被刪掉時認領紀錄要留著，否則刪帳號就能重領。
  -- 真要放行（門號換人、家人共用）由 admin 手動刪這一列，會留在 audit 裡。
  profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz not null default now()
);

comment on table public.trial_phone_claims is
  '註冊免費體驗的手機認領表。一支手機一列，存在即代表已領過。要重新放行請刪除該列。';

alter table public.trial_phone_claims enable row level security;
-- 不開任何 policy：只有 service_role（server-side）能碰，前端一律讀不到。

-- 既有資料回填：已經領過 trial_signup 的手機先鎖起來，
-- 否則新規則上線後，過去那些帳號的手機還能再領一次。
insert into public.trial_phone_claims (phone, profile_id, claimed_at)
select distinct on (p.phone) p.phone, p.id, t.created_at
from public.profiles p
join public.credit_transactions t
  on t.user_id = p.id and t.source = 'trial_signup'
where p.phone ~ '^09[0-9]{8}$'
order by p.phone, t.created_at
on conflict (phone) do nothing;


-- 發放註冊贈點。整個 function 跑在單一 transaction 裡：
-- 認領手機、建 entitlement、寫交易紀錄，三件事要嘛全成、要嘛全退。
create or replace function public.grant_signup_trial(
  p_profile_id uuid,
  p_phone text,
  p_credits integer,
  p_duration_days integer
)
returns table (granted boolean, reason text, entitlement_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_entitlement_id uuid;
begin
  -- 手機必須是已正規化的格式。拿不到合法手機就不發 ——
  -- 對一份 277 元的贈品，無法確認資格時的正確行為是不發，不是照發。
  if p_phone is null or p_phone !~ '^09[0-9]{8}$' then
    return query select false, 'invalid_phone', null::uuid;
    return;
  end if;

  if p_credits <= 0 or p_duration_days <= 0 then
    return query select false, 'invalid_grant_params', null::uuid;
    return;
  end if;

  -- 這個 profile 自己已經有任何 entitlement（trial 或付費）就不發。
  if exists (select 1 from public.member_entitlements where user_id = p_profile_id) then
    return query select false, 'already_granted', null::uuid;
    return;
  end if;

  -- 認領手機。同時進來的兩個註冊，只有一個 insert 得了，另一個撞 primary key。
  begin
    insert into public.trial_phone_claims (phone, profile_id)
    values (p_phone, p_profile_id);
  exception when unique_violation then
    return query select false, 'phone_already_claimed', null::uuid;
    return;
  end;

  select id into v_plan_id from public.plans where code = 'trial';

  insert into public.member_entitlements
    (user_id, plan_id, status, credits_remaining, starts_at, expires_at)
  values
    (p_profile_id, v_plan_id, 'active', p_credits, now(), now() + make_interval(days => p_duration_days))
  returning id into v_entitlement_id;

  insert into public.credit_transactions
    (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
  values
    (p_profile_id, v_entitlement_id, 'grant', p_credits, p_credits, 'trial_signup', null);

  return query select true, null::text, v_entitlement_id;
end;
$$;

-- 只有 service_role（server-side）該叫得動這個 function。
-- anon / authenticated 在本機或非 Supabase 環境不一定存在，所以逐一確認後再 revoke。
revoke all on function public.grant_signup_trial(uuid, text, integer, integer) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.grant_signup_trial(uuid, text, integer, integer) from %I', r);
    end if;
  end loop;
end $$;

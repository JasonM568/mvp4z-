-- 單次報告加購（NT$199 / 20 點）。
--
-- 為什麼要有這個：免費體驗 30 點＝1 次報告（20 點）＋10 點用不掉。想再看一次的人，
-- 原本眼前只有「付 980」或「換 email 重新註冊」兩條路，於是真的有人走了後者。
-- 199 元讓「想再看一次」有正當管道，刷的動機才會消失。
--
-- 定價刻意不便宜：199/20 點 ≈ 9.95 元/點，比 basic 的 980/106 ≈ 9.25 元/點還貴一點，
-- 所以它不會侵蝕月方案，只是給輕度使用者一個入口。

alter table public.plans
  add column if not exists is_addon boolean not null default false;

comment on column public.plans.is_addon is
  '加購型方案：只加點數、不延長效期（沿用現有方案的到期日）。一般月方案為 false。';

insert into public.plans (code, name, price, currency, credits, duration_days, is_active, sort_order, is_addon)
values ('single_report', '單次報告加購', 199, 'TWD', 20, 30, true, 5, true)
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  credits = excluded.credits,
  duration_days = excluded.duration_days,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  is_addon = excluded.is_addon;


-- 先移除舊的 6 參數版本。加了帶預設值的 p_is_addon 之後簽章不同，
-- create or replace 會產生「另一個」函式而不是取代，兩個並存會讓 6 個參數的呼叫
-- 變成 function is not unique。
drop function if exists public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text);


-- 開通函式加上加購語意。
--
-- 關鍵差異：加購**不延長效期**。沿用既有的續訂結轉邏輯會把 199 元變成
-- 「多送 30 天訂閱效期」，那不是加購該有的行為。
-- 有有效方案時 → 點數併進去、到期日不動；沒有方案時 → 才用 duration_days 給自己一段效期。
create or replace function public.commit_paid_entitlement(
  p_order_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_credits integer,
  p_duration_days integer,
  p_ref_id text,
  p_is_addon boolean default false
)
returns table (
  provisioned boolean,
  entitlement_id uuid,
  carried_credits integer,
  total_credits integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   public.member_entitlements%rowtype;
  v_carried    integer := 0;
  v_base       timestamptz;
  v_has_active boolean;
  v_expires    timestamptz;
  v_total      integer;
  v_new_id     uuid;
  v_now        timestamptz := now();
begin
  if p_order_id is null or p_user_id is null then
    raise exception 'commit_paid_entitlement: order_id 與 user_id 不得為 null';
  end if;
  if p_credits < 0 or p_duration_days <= 0 then
    raise exception 'commit_paid_entitlement: 點數或效期參數不合法 (credits=%, days=%)', p_credits, p_duration_days;
  end if;

  -- 同一位會員的開通逐一進行。新會員在 member_entitlements 沒有列可以鎖，
  -- 所以用 advisory lock 而不是 select for update，否則兩張並行的訂單會各自算錯結轉。
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- 冪等：這張訂單開過就直接回報，不重複發點。綠界重送會走到這裡。
  select * into v_existing
  from public.member_entitlements
  where source_order_id = p_order_id;

  if found then
    return query select false, v_existing.id, 0, v_existing.credits_remaining, v_existing.expires_at;
    return;
  end if;

  -- 續訂結轉：把目前仍有效的方案剩餘點數與到期日接過來。
  select coalesce(sum(credits_remaining), 0), max(member_entitlements.expires_at)
    into v_carried, v_base
  from public.member_entitlements
  where user_id = p_user_id
    and status = 'active'
    and member_entitlements.expires_at >= v_now;

  v_has_active := v_base is not null;
  v_base       := greatest(coalesce(v_base, v_now), v_now);

  if p_is_addon and v_has_active then
    -- 加購且已有有效方案：只加點數，到期日照舊。
    v_expires := v_base;
  else
    v_expires := v_base + make_interval(days => p_duration_days);
  end if;

  v_total := p_credits + v_carried;

  insert into public.member_entitlements
    (user_id, plan_id, status, credits_remaining, starts_at, expires_at, source_order_id)
  values
    (p_user_id, p_plan_id, 'active', v_total, v_now, v_expires, p_order_id)
  returning id into v_new_id;

  -- 本次購買的點數。
  insert into public.credit_transactions
    (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
  values
    (p_user_id, v_new_id, 'grant', p_credits, p_credits, 'ecpay_payment', p_ref_id);

  if v_carried > 0 then
    -- 舊方案歸零並結束，避免同一筆點數在兩張 entitlement 上各算一次。
    update public.member_entitlements
       set credits_remaining = 0,
           status = 'expired'
     where user_id = p_user_id
       and status = 'active'
       and id <> v_new_id
       and member_entitlements.expires_at >= v_now;

    -- 轉移在帳上留雙邊紀錄，方便日後對帳看出點數是從哪裡來的。
    insert into public.credit_transactions
      (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
    values
      (p_user_id, v_new_id, 'adjustment', v_carried, v_total, 'plan_renewal_carryover', p_ref_id);
  end if;

  return query select true, v_new_id, v_carried, v_total, v_expires;
end;
$$;

revoke all on function public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text, boolean) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text, boolean) from %I', r);
    end if;
  end loop;
end $$;

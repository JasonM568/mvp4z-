-- 付款開通的原子化與續訂規則。解決兩個正式環境問題：
--
-- 1.「收了錢卻沒開通，而且救不回來」
--    notify route 先把訂單標記 paid，之後才建 entitlement。中間任何失敗都會留下
--    「訂單已付款、方案沒開通」，而重送通知因為看到訂單已是 paid 就早退，永遠不會補開。
--    正式庫已有 2 筆這種訂單（皆為 1 元測試單）。
--    這裡把「建 entitlement ＋ 寫點數交易」收進單一 transaction，並以 source_order_id 冪等，
--    讓綠界重送可以安全地把缺的開通補上。
--
-- 2.「重複購買不是續訂，舊點數實質消失」
--    原本每次付款都新增獨立 entitlement，點數不疊加、效期從付款當下重算；
--    而讀取端一律只取「到期日最晚」那一筆，於是舊方案剩餘點數看得到也用不到。
--    新規則：**剩餘點數疊加、效期從 max(現有到期日, now) 往後延**。
--    舊 entitlement 會被歸零並標記 expired，點數轉移在 credit_transactions 留下雙邊紀錄。

create or replace function public.commit_paid_entitlement(
  p_order_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_credits integer,
  p_duration_days integer,
  p_ref_id text
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

  v_base    := greatest(coalesce(v_base, v_now), v_now);
  v_expires := v_base + make_interval(days => p_duration_days);
  v_total   := p_credits + v_carried;

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

revoke all on function public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.commit_paid_entitlement(uuid, uuid, uuid, integer, integer, text) from %I', r);
    end if;
  end loop;
end $$;

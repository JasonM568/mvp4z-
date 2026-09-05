-- 後台半自動退款（第一階段）。
--
-- 為什麼是半自動：綠界的信用卡請退款 API（Credit/DoAction）**沒有測試環境**
-- （官方明載「因無法提供實際授權，故無法使用此 API」），第一次驗證只能拿正式環境的
-- 真實交易做。對一個會把錢退出去的功能，直接上全自動風險太高。
--
-- 所以這一階段：綠界那邊由人工到廠商後台操作，系統負責
--   1. 事前算清楚「這張訂單發了幾點、現在還收得回幾點、短少多少」
--   2. 事後把退款結果、點數回收、訂單狀態、課程報名狀態原子化地記下來
-- 等流程跑順、也累積了真實案例，再接 DoAction API（屆時 method 改成 'api_ecpay'）。

-- 部分退款是真實存在的狀態，原本的 constraint 只有 refunded 表達不了。
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'));


-- 退款紀錄。**只新增不修改**：每一次退款動作一列，不覆寫。
-- payments 表是 upsert 在 (provider, merchant_trade_no) 上，一張訂單只有一列，
-- 存不了多次退款嘗試，所以退款不能寄生在那裡。
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  user_id uuid not null references public.profiles(id),

  -- manual_ecpay：人工到綠界後台操作，系統只登錄結果（目前唯一支援）
  -- api_ecpay   ：未來接 Credit/DoAction 之後才會出現
  method text not null default 'manual_ecpay' check (method in ('manual_ecpay', 'api_ecpay')),
  kind text not null check (kind in ('full', 'partial')),

  amount integer not null check (amount > 0),

  -- 點數帳：expected 是這張訂單當初發的點，reclaimed 是實際收得回來的，
  -- shortfall 是已經被用掉、收不回來的部分。三個都留著，才看得出「退了錢但點數已經用掉」。
  credits_expected integer not null default 0 check (credits_expected >= 0),
  credits_reclaimed integer not null default 0 check (credits_reclaimed >= 0),
  credits_shortfall integer not null default 0 check (credits_shortfall >= 0),

  reason text not null,
  -- 綠界後台的交易編號或操作備註，人工退款時填，用於日後對帳
  provider_reference text,

  -- 具名管理員。退款是財務動作，不接受共用 ADMIN_KEY，這裡不允許 null。
  admin_profile_id uuid not null references public.profiles(id),
  admin_email text not null,

  created_at timestamptz not null default now()
);

create index if not exists refunds_order_id_idx on public.refunds (order_id);
create index if not exists refunds_user_id_idx on public.refunds (user_id, created_at desc);

comment on table public.refunds is
  '退款紀錄，只新增不修改。半自動階段由管理員在綠界後台完成實際退款後登錄。';

alter table public.refunds enable row level security;
-- 不開任何 policy：只有 service_role（server-side）能碰。


/**
 * 退款試算。唯讀，給後台在「確認退款」之前顯示數字用。
 * 不寫入任何東西，所以可以安全地重複呼叫。
 */
create or replace function public.preview_order_refund(p_order_id uuid)
returns table (
  order_no text,
  order_status text,
  order_amount integer,
  already_refunded integer,
  refundable_amount integer,
  credits_granted integer,
  credits_available integer,
  active_entitlement_id uuid,
  active_expires_at timestamptz,
  invoice_number text,
  invoice_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'preview_order_refund: 找不到訂單 %', p_order_id;
  end if;

  return query
  select
    v_order.order_no,
    v_order.status,
    v_order.amount,
    coalesce((select sum(r.amount) from public.refunds r where r.order_id = v_order.id), 0)::integer,
    (v_order.amount - coalesce((select sum(r.amount) from public.refunds r where r.order_id = v_order.id), 0))::integer,
    -- 這張訂單當初發了幾點：以 commit_paid_entitlement 寫下的 grant 交易為準。
    coalesce((
      select sum(t.amount) from public.credit_transactions t
      where t.ref_id = v_order.order_no and t.source = 'ecpay_payment' and t.type = 'grant'
    ), 0)::integer,
    -- 現在收得回來的上限：會員目前有效方案的餘額。
    -- 續訂結轉會把舊點數併進新 entitlement，所以不能直接取消這張訂單的 entitlement。
    coalesce((
      select sum(e.credits_remaining) from public.member_entitlements e
      where e.user_id = v_order.user_id and e.status = 'active' and e.expires_at >= now()
    ), 0)::integer,
    (select e.id from public.member_entitlements e
      where e.user_id = v_order.user_id and e.status = 'active' and e.expires_at >= now()
      order by e.expires_at desc limit 1),
    (select e.expires_at from public.member_entitlements e
      where e.user_id = v_order.user_id and e.status = 'active' and e.expires_at >= now()
      order by e.expires_at desc limit 1),
    (select i.invoice_number from public.invoices i where i.order_id = v_order.id order by i.created_at desc limit 1),
    (select i.status from public.invoices i where i.order_id = v_order.id order by i.created_at desc limit 1);
end;
$$;


/**
 * 登錄一筆已在綠界後台完成的退款。
 *
 * 一個 transaction 內完成：寫退款紀錄、回收點數、更新訂單狀態、同步課程報名狀態。
 * 任何一步失敗就整筆退回，不會留下「錢退了但點數沒收」或「點數收了但沒紀錄」。
 *
 * 點數回收policy：收回「這張訂單發出的點數」與「目前實際還剩的點數」之中較小者。
 * 已經被用掉的部分記在 credits_shortfall，由管理員決定現金要退多少 —— 系統只負責算清楚，
 * 不替生意做決定。
 */
create or replace function public.commit_manual_refund(
  p_order_id uuid,
  p_admin_profile_id uuid,
  p_admin_email text,
  p_amount integer,
  p_reason text,
  p_provider_reference text default null
)
returns table (
  refund_id uuid,
  order_status text,
  credits_expected integer,
  credits_reclaimed integer,
  credits_shortfall integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.orders%rowtype;
  v_already      integer;
  v_granted      integer;
  v_expected     integer;
  v_available    integer;
  v_reclaimed    integer;
  v_shortfall    integer;
  v_ent_id       uuid;
  v_ent_balance  integer;
  v_new_status   text;
  v_kind         text;
  v_refund_id    uuid;
begin
  if p_admin_profile_id is null or coalesce(trim(p_admin_email), '') = '' then
    raise exception 'commit_manual_refund: 退款必須由具名管理員執行';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'commit_manual_refund: 必須填寫退款原因';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'commit_manual_refund: 退款金額必須大於 0';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'commit_manual_refund: 找不到訂單 %', p_order_id;
  end if;
  if v_order.status not in ('paid', 'partially_refunded') then
    raise exception 'commit_manual_refund: 只有已付款的訂單可以退款（目前狀態：%）', v_order.status;
  end if;

  -- 與開通、扣點共用同一把鎖，避免退款收點數的同時使用者正在跑報告扣點。
  perform pg_advisory_xact_lock(hashtextextended(v_order.user_id::text, 0));

  select coalesce(sum(r.amount), 0) into v_already from public.refunds r where r.order_id = v_order.id;
  if v_already + p_amount > v_order.amount then
    raise exception 'commit_manual_refund: 退款總額 % 超過訂單金額 %', v_already + p_amount, v_order.amount;
  end if;

  v_kind := case when v_already + p_amount >= v_order.amount then 'full' else 'partial' end;

  -- 這張訂單當初發了幾點。
  select coalesce(sum(t.amount), 0) into v_granted
  from public.credit_transactions t
  where t.ref_id = v_order.order_no and t.source = 'ecpay_payment' and t.type = 'grant';

  -- 部分退款按比例折算應收回的點數。
  v_expected := floor(v_granted::numeric * p_amount / nullif(v_order.amount, 0))::integer;
  v_expected := greatest(coalesce(v_expected, 0), 0);

  -- 收得回來的上限是目前有效方案的餘額。
  select e.id, e.credits_remaining into v_ent_id, v_ent_balance
  from public.member_entitlements e
  where e.user_id = v_order.user_id and e.status = 'active' and e.expires_at >= now()
  order by e.expires_at desc
  limit 1
  for update;

  v_available := coalesce(v_ent_balance, 0);
  v_reclaimed := least(v_expected, v_available);
  v_shortfall := v_expected - v_reclaimed;

  if v_reclaimed > 0 then
    update public.member_entitlements
       set credits_remaining = credits_remaining - v_reclaimed
     where id = v_ent_id;

    insert into public.credit_transactions
      (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
    values
      (v_order.user_id, v_ent_id, 'refund', -v_reclaimed, v_available - v_reclaimed, 'order_refund', v_order.order_no);
  end if;

  insert into public.refunds
    (order_id, user_id, method, kind, amount,
     credits_expected, credits_reclaimed, credits_shortfall,
     reason, provider_reference, admin_profile_id, admin_email)
  values
    (v_order.id, v_order.user_id, 'manual_ecpay', v_kind, p_amount,
     v_expected, v_reclaimed, v_shortfall,
     trim(p_reason), nullif(trim(coalesce(p_provider_reference, '')), ''), p_admin_profile_id, trim(p_admin_email))
  returning id into v_refund_id;

  v_new_status := case when v_kind = 'full' then 'refunded' else 'partially_refunded' end;

  update public.orders
     set status = v_new_status,
         updated_at = now()
   where id = v_order.id;

  -- 課程訂單全額退款時，報名也要一起退掉，否則簽到表還會看到這個人。
  if v_kind = 'full' and coalesce(v_order.order_type, 'membership') = 'course' then
    update public.course_registrations
       set status = 'refunded'
     where order_id = v_order.id;
  end if;

  return query select v_refund_id, v_new_status, v_expected, v_reclaimed, v_shortfall;
end;
$$;

revoke all on function public.preview_order_refund(uuid) from public;
revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.preview_order_refund(uuid) from %I', r);
      execute format('revoke all on function public.commit_manual_refund(uuid, uuid, text, integer, text, text) from %I', r);
    end if;
  end loop;
end $$;

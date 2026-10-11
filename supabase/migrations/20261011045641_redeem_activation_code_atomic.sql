-- 啟用碼兌換必須全域只成功一次，且啟用碼、權益與點數交易在同一交易中提交。
-- 條件 UPDATE 會鎖住啟用碼列；並行請求等待後會重新檢查 status，只有一筆可搶到。

create or replace function public.redeem_activation_code(
  p_code text,
  p_user_id uuid
)
returns table (
  redeemed boolean,
  entitlement_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_credits integer;
  v_duration_days integer;
  v_entitlement_id uuid;
  v_now timestamptz := now();
begin
  if p_code is null or p_user_id is null then
    raise exception 'redeem_activation_code: code and user_id are required';
  end if;

  update public.activation_codes
     set status = 'used',
         used_by = p_user_id,
         used_at = v_now
   where code = p_code
     and status = 'unused'
     and used_by is null
  returning plan_id, credits, duration_days
       into v_plan_id, v_credits, v_duration_days;

  if not found then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.member_entitlements
    (user_id, plan_id, status, credits_remaining, starts_at, expires_at)
  values
    (p_user_id, v_plan_id, 'active', v_credits, v_now,
     v_now + make_interval(days => v_duration_days))
  returning id into v_entitlement_id;

  insert into public.credit_transactions
    (user_id, entitlement_id, type, amount, balance_after, source, ref_id)
  values
    (p_user_id, v_entitlement_id, 'grant', v_credits, v_credits,
     'activation_code', p_code);

  return query select true, v_entitlement_id;
end;
$$;

-- 只允許 server-side service_role 呼叫。它具備三張表的權限並略過 RLS；
-- invoker 權限可避免此函式額外以高權限執行。
revoke all on function public.redeem_activation_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_activation_code(text, uuid) to service_role;

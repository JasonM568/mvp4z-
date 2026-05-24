-- 0010_chat_atomic_commit.sql
-- AI chat 扣點 atomicity 修正（仿 0007 council pattern）
-- 配合 /api/ai/chat 改 charge-on-success：前置只驗餘額不扣，LLM 跑完才呼叫此 function
-- Race case (CR002)：呼叫端應視為「reply 已生成、credit 未扣到」，回成功 + log warn
-- 與 commit_council_credit 結構相同但 source='ai_chat'，未來可考慮合併為通用 function

create or replace function public.commit_chat_credit(
  p_user_id uuid,
  p_entitlement_id uuid,
  p_previous_credits integer,
  p_charge integer,
  p_ref_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_after integer;
  v_tx_id uuid;
begin
  if p_charge <= 0 then
    raise exception 'invalid charge amount' using errcode = 'CR000';
  end if;

  v_balance_after := p_previous_credits - p_charge;
  if v_balance_after < 0 then
    raise exception 'insufficient credits' using errcode = 'CR001';
  end if;

  -- optimistic lock：only debit if credits_remaining 仍等於 p_previous_credits
  update public.member_entitlements
  set credits_remaining = v_balance_after
  where id = p_entitlement_id
    and user_id = p_user_id
    and credits_remaining = p_previous_credits;

  if not found then
    raise exception 'credits state changed' using errcode = 'CR002';
  end if;

  insert into public.credit_transactions (
    user_id, entitlement_id, type, amount, balance_after, source, ref_id
  ) values (
    p_user_id, p_entitlement_id, 'debit', -p_charge, v_balance_after, 'ai_chat', p_ref_id
  ) returning id into v_tx_id;

  return jsonb_build_object(
    'tx_id', v_tx_id,
    'balance_after', v_balance_after
  );
end;
$$;

grant execute on function public.commit_chat_credit(uuid, uuid, integer, integer, text)
  to authenticated, service_role;

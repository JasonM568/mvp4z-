import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { askXunfengAI, chatSchema } from "@/lib/ai/member-chat";
import {
  errorMessage,
  errorStatus,
  getPublicMember,
  readJson,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  let reserved: { entitlementId: string; userId: string; previousCredits: number } | null = null;

  try {
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, chatSchema);
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data: entitlement, error: entitlementError } = await admin
      .from("member_entitlements")
      .select("id, user_id, plan_id, status, credits_remaining, expires_at, plans(code, name)")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .gt("credits_remaining", 0)
      .gte("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entitlementError) throw entitlementError;
    if (!entitlement) throw statusError("會員尚未啟用、已到期或問答次數已用完", 403);

    const previousCredits = Number(entitlement.credits_remaining || 0);
    const nextCredits = previousCredits - 1;

    const { data: debited, error: debitError } = await admin
      .from("member_entitlements")
      .update({ credits_remaining: nextCredits })
      .eq("id", entitlement.id)
      .eq("credits_remaining", previousCredits)
      .select("id")
      .maybeSingle();

    if (debitError) throw debitError;
    if (!debited) throw statusError("問答額度正在更新，請再試一次", 409);

    reserved = { entitlementId: entitlement.id, userId: profile.id, previousCredits };

    const planCode = getPlanCode(entitlement.plans);
    const ai = await askXunfengAI({ plan: planCode, message: input.message });

    const { error: usageError } = await admin.from("usage_logs").insert({
      user_id: profile.id,
      entitlement_id: entitlement.id,
      type: "chat",
      prompt: input.message.slice(0, 4000),
      reply: ai.reply.slice(0, 8000),
      tokens_input: ai.tokens_input,
      tokens_output: ai.tokens_output
    });

    if (usageError) throw usageError;

    const { error: txError } = await admin.from("credit_transactions").insert({
      user_id: profile.id,
      entitlement_id: entitlement.id,
      type: "debit",
      amount: -1,
      balance_after: nextCredits,
      source: "ai_chat",
      ref_id: null
    });

    if (txError) throw txError;

    reserved = null;
    const member = await getPublicMember(profile.id);
    return apiJson({ ok: true, reply: ai.reply, member });
  } catch (error) {
    if (reserved) await refundReservedCredit(reserved);
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

function getPlanCode(value: unknown) {
  const plan = Array.isArray(value) ? value[0] : value;
  if (typeof plan === "object" && plan && "code" in plan && typeof plan.code === "string") {
    return plan.code;
  }
  return "member";
}

async function refundReservedCredit(reserved: { entitlementId: string; userId: string; previousCredits: number }) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("member_entitlements")
    .update({ credits_remaining: reserved.previousCredits })
    .eq("id", reserved.entitlementId);

  await admin.from("credit_transactions").insert({
    user_id: reserved.userId,
    entitlement_id: reserved.entitlementId,
    type: "refund",
    amount: 1,
    balance_after: reserved.previousCredits,
    source: "ai_chat_refund",
    ref_id: null
  });
}

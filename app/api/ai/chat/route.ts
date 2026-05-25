// AI chat：charge-on-success（仿 council PR #24 的 atomicity fix）
//
// 流程：
//   1. requireBearer → 拿到 profile
//   2. 查最新 active entitlement，credits_remaining > 0；無 → 403
//   3. 呼叫 LLM (askXunfengAI) — LLM 失敗 = 不扣到、回 502
//   4. 寫 usage_logs（必有 row 紀錄這次對話，即使 credit commit 失敗）
//   5. 呼叫 commit_chat_credit RPC 原子化扣 1 點 + 寫 credit_transactions
//      - CR001 insufficient（餘額被別處扣到 0）→ 仍回成功（reply 已生成），usage_logs 留著、未扣到
//      - CR002 race（餘額在 LLM 期間被別處改）→ 同上：reply 已生成，這次免費送

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

const CHAT_CHARGE = 1;

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, chatSchema);
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // 1. 驗 entitlement + 餘額（不扣）
    const { data: entitlement, error: entitlementError } = await admin
      .from("member_entitlements")
      .select("id, user_id, plan_id, status, credits_remaining, expires_at, plans(code, name)")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .gte("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entitlementError) throw entitlementError;
    if (!entitlement) throw statusError("會員尚未啟用或方案已到期", 403);

    const previousCredits = Number(entitlement.credits_remaining || 0);
    if (previousCredits < CHAT_CHARGE) {
      throw statusError("問答次數已用完，請續訂方案或啟用新方案", 403);
    }

    // 2. 跑 LLM；失敗會 throw，整個 request 失敗、credit 不扣
    const planCode = getPlanCode(entitlement.plans);
    const ai = await askXunfengAI({ plan: planCode, message: input.message });

    // 3. 寫 usage_logs（不管 credit commit 成敗都留紀錄）
    const { data: usageLog, error: usageError } = await admin
      .from("usage_logs")
      .insert({
        user_id: profile.id,
        entitlement_id: entitlement.id,
        type: "chat",
        prompt: input.message.slice(0, 4000),
        reply: ai.reply.slice(0, 8000),
        tokens_input: ai.tokens_input,
        tokens_output: ai.tokens_output
      })
      .select("id")
      .single();
    if (usageError) throw usageError;

    // 4. 原子扣點 (debit + insert credit_transactions 都在 commit_chat_credit 裡)
    let creditsCharged = 0;
    let creditWarning: string | null = null;

    const { error: rpcError } = await admin.rpc("commit_chat_credit", {
      p_user_id: profile.id,
      p_entitlement_id: entitlement.id,
      p_previous_credits: previousCredits,
      p_charge: CHAT_CHARGE,
      p_ref_id: usageLog?.id || null
    });

    if (rpcError) {
      // CR001 insufficient / CR002 race — reply 已生成、這次送
      creditWarning = `commit_chat_credit failed: ${rpcError.code || ""} ${rpcError.message}`.trim();
      console.warn("[chat] credit commit failed, gifting reply", {
        userId: profile.id,
        entitlementId: entitlement.id,
        previousCredits,
        error: rpcError
      });
    } else {
      creditsCharged = CHAT_CHARGE;
    }

    const member = await getPublicMember(profile.id);
    return apiJson({
      ok: true,
      reply: ai.reply,
      credits_charged: creditsCharged,
      credit_warning: creditWarning,
      member
    });
  } catch (error) {
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

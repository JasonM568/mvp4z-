import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import {
  errorMessage,
  errorStatus,
  getPublicMember,
  readJson,
  redeemSchema,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, redeemSchema);
    const admin = createSupabaseAdminClient();

    const { data: code, error: codeError } = await admin
      .from("activation_codes")
      .select("code, plan_id, credits, duration_days, status, used_by, plans(code, name)")
      .eq("code", input.code)
      .maybeSingle();

    if (codeError) throw codeError;
    if (!code || code.status !== "unused" || code.used_by) {
      throw statusError("啟用碼不存在或已被使用", 400);
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setDate(expiresAt.getDate() + Number(code.duration_days || 30));

    const { data: entitlement, error: entitlementError } = await admin
      .from("member_entitlements")
      .insert({
        user_id: profile.id,
        plan_id: code.plan_id,
        status: "active",
        credits_remaining: Number(code.credits || 0),
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString()
      })
      .select("id")
      .single();

    if (entitlementError) throw entitlementError;

    const { error: codeUpdateError } = await admin
      .from("activation_codes")
      .update({
        status: "used",
        used_by: profile.id,
        used_at: new Date().toISOString()
      })
      .eq("code", input.code)
      .eq("status", "unused");

    if (codeUpdateError) throw codeUpdateError;

    const { error: txError } = await admin.from("credit_transactions").insert({
      user_id: profile.id,
      entitlement_id: entitlement.id,
      type: "grant",
      amount: Number(code.credits || 0),
      balance_after: Number(code.credits || 0),
      source: "activation_code",
      ref_id: input.code
    });

    if (txError) throw txError;

    const member = await getPublicMember(profile.id);
    return apiJson({
      ok: true,
      plan: member.plan,
      credits_remaining: member.credits_remaining,
      expires_at: member.expires_at,
      member
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

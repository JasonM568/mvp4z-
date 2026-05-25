import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  user_id: z.string().uuid("會員格式錯誤"),
  amount: z.coerce.number().int().refine((value) => value !== 0, "調整點數不可為 0"),
  plan: z.string().trim().min(1).default("pro"),
  days: z.coerce.number().int().positive().max(3650).default(30),
  note: z.string().trim().max(500).optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const input = await readJson(request, schema);
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const days = input.days ?? 30;

    const { data: entitlement, error: entitlementError } = await admin
      .from("member_entitlements")
      .select("id, credits_remaining")
      .eq("user_id", input.user_id)
      .eq("status", "active")
      .gte("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entitlementError) throw entitlementError;

    let targetEntitlement = entitlement;
    if (!targetEntitlement) {
      if (input.amount < 0) throw statusError("此會員尚無有效權益，無法扣點", 404);

      const { data: plan, error: planError } = await admin
        .from("plans")
        .select("id, code")
        .eq("code", input.plan)
        .maybeSingle();
      if (planError) throw planError;
      if (!plan) throw statusError("找不到方案，無法建立會員權益", 404);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      const { data: createdEntitlement, error: createError } = await admin
        .from("member_entitlements")
        .insert({
          user_id: input.user_id,
          plan_id: plan.id,
          status: "active",
          credits_remaining: 0,
          starts_at: now,
          expires_at: expiresAt.toISOString(),
          source_order_id: null
        })
        .select("id, credits_remaining")
        .single();
      if (createError) throw createError;
      targetEntitlement = createdEntitlement;
    }

    const balanceAfter = Math.max(0, Number(targetEntitlement.credits_remaining || 0) + input.amount);
    const { error: updateError } = await admin
      .from("member_entitlements")
      .update({ credits_remaining: balanceAfter })
      .eq("id", targetEntitlement.id);

    if (updateError) throw updateError;

    const { error: txError } = await admin.from("credit_transactions").insert({
      user_id: input.user_id,
      entitlement_id: targetEntitlement.id,
      type: "adjustment",
      amount: input.amount,
      balance_after: balanceAfter,
      source: "admin_adjustment",
      ref_id: null
    });

    if (txError) throw txError;

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "credits.adjust",
      targetType: "profile",
      targetId: input.user_id,
      metadata: {
        amount: input.amount,
        balance_after: balanceAfter,
        note: input.note,
        entitlement_id: targetEntitlement.id,
        created_entitlement: !entitlement,
        plan: input.plan,
        days
      }
    });

    return apiJson({ ok: true, credits_remaining: balanceAfter });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

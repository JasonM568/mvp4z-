import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  user_id: z.string().uuid("會員格式錯誤"),
  amount: z.coerce.number().int().refine((value) => value !== 0, "調整點數不可為 0"),
  note: z.string().trim().max(500).optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const input = await readJson(request, schema);
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

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
    if (!entitlement) throw statusError("找不到可調整的有效會員權益", 404);

    const balanceAfter = Math.max(0, Number(entitlement.credits_remaining || 0) + input.amount);
    const { error: updateError } = await admin
      .from("member_entitlements")
      .update({ credits_remaining: balanceAfter })
      .eq("id", entitlement.id);

    if (updateError) throw updateError;

    const { error: txError } = await admin.from("credit_transactions").insert({
      user_id: input.user_id,
      entitlement_id: entitlement.id,
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
      metadata: { amount: input.amount, balance_after: balanceAfter, note: input.note }
    });

    return apiJson({ ok: true, credits_remaining: balanceAfter });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

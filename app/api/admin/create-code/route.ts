import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { createActivationCode, requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  plan: z.string().trim().min(1, "請選擇方案").default("basic"),
  days: z.coerce.number().int().positive().max(3650).default(30),
  credits: z.coerce.number().int().nonnegative().max(100000).default(100),
  note: z.string().trim().max(500).optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const input = await readJson(request, schema);
    const admin = createSupabaseAdminClient();

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id, code")
      .eq("code", input.plan)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) throw statusError("找不到方案", 404);

    const code = createActivationCode();
    const { error } = await admin.from("activation_codes").insert({
      code,
      plan_id: plan.id,
      credits: input.credits,
      duration_days: input.days,
      status: "unused",
      created_by: adminAuth.profile?.id || null
    });

    if (error) throw error;

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "activation_code.create",
      targetType: "activation_code",
      targetId: code,
      metadata: { plan: input.plan, days: input.days, credits: input.credits, note: input.note }
    });

    return apiJson({ ok: true, code, plan: input.plan, days: input.days, credits: input.credits });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

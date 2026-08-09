import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import { errorMessage, errorStatus, requireBearerProfile } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("council_runs")
      .select("id, request, final_label, final_text, structured, final_ok, fallback_used, credits_charged, generated_at, created_at")
      .eq("id", id)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiJson({ error: "找不到這份天機書" }, 404);
    return apiJson({ ok: true, run: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import { errorMessage, errorStatus, requireBearerProfile } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const limit = Math.min(20, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 6)));
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("council_runs")
      .select("id, request, final_label, final_text, structured, final_ok, fallback_used, credits_charged, generated_at, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return apiJson({ ok: true, items: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

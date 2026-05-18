import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, requireBearerProfile } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("usage_logs")
      .select("id, type, prompt, reply, tokens_input, tokens_output, cost_estimate, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return apiJson({ ok: true, usage: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

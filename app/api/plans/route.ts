import { apiJson } from "../_helpers";
import { errorMessage } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("plans")
      .select("code, name, price, currency, credits, duration_days")
      .eq("is_active", true)
      .neq("code", "trial")
      .order("price", { ascending: true });

    if (error) throw error;
    return apiJson({ ok: true, plans: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, 500);
  }
}

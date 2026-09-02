import { NextRequest } from "next/server";
import { apiJson } from "../_helpers";
import { errorMessage } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** 內部方案（刷卡實測等）不對外露出，除非呼叫端用 ?include= 指名。 */
const INTERNAL_PLAN_PATTERN = /^e2e_/;

export async function GET(request: NextRequest) {
  try {
    const admin = createSupabaseAdminClient();
    const include = new URL(request.url).searchParams.get("include") || "";
    const { data, error } = await admin
      .from("plans")
      .select("code, name, price, currency, credits, duration_days")
      .eq("is_active", true)
      .neq("code", "trial")
      .order("price", { ascending: true });

    if (error) throw error;
    const plans = (data || []).filter(
      (plan) => !INTERNAL_PLAN_PATTERN.test(plan.code) || plan.code === include
    );
    return apiJson({ ok: true, plans });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, 500);
  }
}

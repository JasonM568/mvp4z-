import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("id, order_no, amount, currency, status, provider, provider_trade_no, paid_at, created_at, profiles(name, email), plans(code, name)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return apiJson({ ok: true, orders: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

// admin 發票清單
// GET /api/admin/invoices → 全部 invoices（最近 200 筆，建立時間倒序）

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
      .from("invoices")
      .select(
        "id, order_id, user_id, provider, invoice_number, random_code, invoice_date, buyer_type, buyer_name, buyer_id, buyer_email, total_amount, status, error_code, error_msg, retry_count, last_attempted_at, voided_at, created_at, orders(order_no, status), profiles(name, email)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return apiJson({ ok: true, invoices: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

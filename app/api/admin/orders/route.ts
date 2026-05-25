import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: order, error: orderError } = await admin
        .from("orders")
        .select("id, order_no, user_id, plan_id, order_type, course_product_id, item_name, amount, currency, status, provider, provider_trade_no, paid_at, created_at, updated_at, invoice_request, legacy_no_invoice, profiles(id, name, email, phone, role, created_at), plans(id, code, name, price, currency, credits, duration_days), course_products(id, code, title, subtitle, course_date, starts_at, ends_at, location, price_new, price_returning, currency)")
        .eq("id", id)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return apiJson({ error: "找不到訂單" }, 404);

      const [{ data: payments, error: paymentsError }, { data: entitlements, error: entitlementsError }, { data: invoices, error: invoicesError }, { data: registrations, error: registrationsError }] = await Promise.all([
        admin
          .from("payments")
          .select("id, provider, provider_trade_no, merchant_trade_no, amount, status, check_mac_valid, received_at, created_at")
          .eq("order_id", id)
          .order("received_at", { ascending: false }),
        admin
          .from("member_entitlements")
          .select("id, status, credits_remaining, starts_at, expires_at, created_at, plans(code, name)")
          .eq("source_order_id", id)
          .order("created_at", { ascending: false }),
        admin
          .from("invoices")
          .select("id, provider, invoice_number, random_code, invoice_date, buyer_type, buyer_name, buyer_id, buyer_email, carrier_type, carrier_num, donation_code, total_amount, status, error_code, error_msg, retry_count, last_attempted_at, voided_at, created_at")
          .eq("order_id", id)
          .order("created_at", { ascending: false }),
        admin
          .from("course_registrations")
          .select("id, status, registration_type, amount, currency, name, gender, phone, line_id, email, learning_background, interests, motivation, note, paid_at, created_at, course_products(code, title, subtitle, course_date, starts_at, ends_at, location)")
          .eq("order_id", id)
          .order("created_at", { ascending: false })
      ]);

      if (paymentsError) throw paymentsError;
      if (entitlementsError) throw entitlementsError;
      if (invoicesError) throw invoicesError;
      if (registrationsError) throw registrationsError;

      return apiJson({
        ok: true,
        order: {
          ...order,
          payments: payments || [],
          member_entitlements: entitlements || [],
          invoices: invoices || [],
          course_registrations: registrations || []
        }
      });
    }

    const { data, error } = await admin
      .from("orders")
      .select("id, order_no, order_type, item_name, amount, currency, status, provider, provider_trade_no, paid_at, created_at, profiles(name, email, phone), plans(code, name), course_products(code, title, subtitle), course_registrations(name, phone, email, registration_type)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return apiJson({ ok: true, orders: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, requireBearerProfile } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 會員查自己的訂單。
 *
 * 兩個用途：
 *  1. 綠界付款回站後輪詢單一訂單，確認開通完成了沒（?order_no=XF...）。
 *     綠界的瀏覽器導回常常比 server 端 notify 早到，沒有這支 API 使用者只會看到舊點數。
 *  2. 會員中心列出未付款訂單 —— 使用者把綠界頁面關掉之後，站內原本完全找不到那張單。
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const admin = createSupabaseAdminClient();
    const orderNo = new URL(request.url).searchParams.get("order_no")?.trim() || "";

    let query = admin
      .from("orders")
      .select("id, order_no, amount, currency, status, order_type, item_name, paid_at, created_at, plans(code, name)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (orderNo) query = query.eq("order_no", orderNo);

    const { data, error } = await query;
    if (error) throw error;

    // 開通與否以 entitlement 是否存在為準，不能只看 orders.status。
    // 「已付款但沒開通」正是我們要讓使用者與客服看得見的狀態。
    const orderIds = (data || []).map((row) => row.id);
    const provisioned = new Set<string>();
    if (orderIds.length > 0) {
      const { data: ents, error: entError } = await admin
        .from("member_entitlements")
        .select("source_order_id")
        .in("source_order_id", orderIds);
      if (entError) throw entError;
      for (const row of ents || []) {
        if (row.source_order_id) provisioned.add(row.source_order_id as string);
      }
    }

    const items = (data || []).map((row) => {
      const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
      const isCourse = (row.order_type || "membership") === "course";
      return {
        order_no: row.order_no,
        amount: Number(row.amount || 0),
        currency: row.currency,
        status: row.status,
        order_type: row.order_type || "membership",
        item_name: plan?.name || row.item_name || row.order_no,
        paid_at: row.paid_at,
        created_at: row.created_at,
        // 課程訂單沒有 entitlement，付款成功就算完成。
        activated: isCourse ? row.status === "paid" : provisioned.has(row.id)
      };
    });

    return apiJson({ ok: true, items });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

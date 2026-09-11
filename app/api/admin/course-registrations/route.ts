// 巽風課程報名｜admin 名單
//
// 為什麼要獨立一支 API 而不是沿用 /api/admin/orders：
// 訂單是以「付款」為主體，沒付成功的就是一筆已取消的訂單；
// 招生要看的是「人」——填完表沒付款的那些才是最該打電話的名單。
// 兩者的主體不同，硬擠在同一頁只會讓真正要追的人被當成雜訊。
//
// 因此這裡**不以付款狀態過濾任何一筆**，預設全列。

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CONTACT_STATUSES } from "@/lib/courses/registration-followup";

const FIELDS = [
  "id",
  "order_id",
  "status",
  "registration_type",
  "amount",
  "currency",
  "name",
  "gender",
  "phone",
  "line_id",
  "email",
  "learning_background",
  "interests",
  "motivation",
  "note",
  "paid_at",
  "created_at",
  "contact_status",
  "contact_note",
  "contacted_at",
  "course_products(code, title, subtitle, course_date, starts_at, location)",
  "orders(order_no, status, amount, paid_at)"
].join(", ");

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const url = new URL(request.url);
    const contact = url.searchParams.get("contact_status");
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);

    let query = admin
      .from("course_registrations")
      .select(FIELDS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (contact && (CONTACT_STATUSES as readonly string[]).includes(contact)) {
      query = query.eq("contact_status", contact);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

    // 摘要在後端算，前端不自己數列表——列表有 limit，數列表會在超過上限後少算。
    const summary = {
      total: rows.length,
      // 付款完成：以訂單的 paid_at 為準而不是報名的 status。
      // 報名 status 要靠 webhook 回寫，而那條路徑本週才修好，舊資料可能沒跟上。
      paid: rows.filter((r: any) => r.paid_at || r.orders?.paid_at).length,
      // 待聯繫：招生真正要看的數字。
      pendingContact: rows.filter((r: any) => (r.contact_status || "new") === "new").length,
      byContact: rows.reduce<Record<string, number>>((acc: Record<string, number>, r: any) => {
        const key = r.contact_status || "new";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    };

    return apiJson({ ok: true, registrations: rows, summary });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

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

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const SUMMARY_PAGE_SIZE = 1000;

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
    const url = new URL(request.url);
    const contact = url.searchParams.get("contact_status");
    const contactFilter = contact && (CONTACT_STATUSES as readonly string[]).includes(contact) ? contact : null;
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);

    if (
      rawLimit !== null &&
      (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    ) {
      return apiJson({ error: "limit 必須是 1 到 500 的整數" }, 400);
    }

    const admin = createSupabaseAdminClient();

    let query = admin
      .from("course_registrations")
      .select(FIELDS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (contactFilter) {
      query = query.eq("contact_status", contactFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const summary = {
      total: 0,
      paid: 0,
      pendingContact: 0,
      byContact: {} as Record<string, number>
    };
    for (let offset = 0; ; offset += SUMMARY_PAGE_SIZE) {
      let summaryQuery = admin
        .from("course_registrations")
        .select("id, paid_at, contact_status, orders(paid_at)")
        .order("created_at", { ascending: false })
        .range(offset, offset + SUMMARY_PAGE_SIZE - 1);
      if (contactFilter) {
        summaryQuery = summaryQuery.eq("contact_status", contactFilter);
      }

      const { data: page, error: summaryError } = await summaryQuery;
      if (summaryError) throw summaryError;
      const pageRows = page || [];
      for (const row of pageRows as any[]) {
        summary.total += 1;
        // 付款狀態以訂單的 paid_at 為準，舊報名 status 可能尚未同步。
        if (row.paid_at || row.orders?.paid_at) summary.paid += 1;
        const contactStatus = row.contact_status || "new";
        // 「待聯繫」對應資料預設狀態 new。
        if (contactStatus === "new") summary.pendingContact += 1;
        summary.byContact[contactStatus] = (summary.byContact[contactStatus] || 0) + 1;
      }
      if (pageRows.length < SUMMARY_PAGE_SIZE) break;
    }

    // 摘要涵蓋完整篩選集合，與返回清單的顯示筆數無關。

    return apiJson({ ok: true, registrations: rows, summary });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

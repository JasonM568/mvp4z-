// 巽風預約諮詢｜admin 列表
// GET /api/admin/bookings?status=pending&limit=50 → 列表
// 預設不過濾 status；可帶 status= 篩選

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { BOOKING_STATUSES } from "@/lib/bookings/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

    let query = admin
      .from("consultation_bookings")
      .select(
        "id, name, email, phone, service, location, size, budget, urgency, schedule, message, source, status, admin_note, assigned_to, follow_up_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && (BOOKING_STATUSES as readonly string[]).includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 統計各狀態數量供 dashboard 用
    const { data: counts, error: countErr } = await admin
      .from("consultation_bookings")
      .select("status", { count: "exact", head: false });
    if (countErr) throw countErr;

    const summary = (counts || []).reduce<Record<string, number>>((acc, row: any) => {
      const key = row.status as string;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return apiJson({ ok: true, bookings: data || [], summary });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

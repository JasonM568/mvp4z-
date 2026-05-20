// 巽風預約諮詢｜admin 編輯單筆
// PATCH /api/admin/bookings/[id] → 更新狀態、備註、指派處理人

import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { adminBookingUpdateSchema } from "@/lib/bookings/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireAdmin(request);
    const { id } = await context.params;
    if (!id) throw statusError("缺少 booking id", 400);

    const input = await readJson(request, adminBookingUpdateSchema);
    const admin = createSupabaseAdminClient();

    const update: Record<string, unknown> = {};
    if (input.status !== undefined) update.status = input.status;
    if (input.admin_note !== undefined) update.admin_note = input.admin_note;
    if (input.assigned_to !== undefined) update.assigned_to = input.assigned_to;
    if (input.follow_up_at !== undefined) update.follow_up_at = input.follow_up_at;

    if (Object.keys(update).length === 0) {
      throw statusError("沒有可更新的欄位", 400);
    }

    const { data, error } = await admin
      .from("consultation_bookings")
      .update(update)
      .eq("id", id)
      .select("id, status, admin_note, assigned_to, follow_up_at, updated_at")
      .single();
    if (error) throw error;
    if (!data) throw statusError("找不到該預約", 404);

    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: "booking_update",
      targetType: "consultation_booking",
      targetId: id,
      metadata: update
    });

    return apiJson({ ok: true, booking: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("consultation_bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("找不到該預約", 404);
    return apiJson({ ok: true, booking: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

// 巽風課程報名｜admin 更新跟進狀態
// PATCH /api/admin/course-registrations/[id]

import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { adminRegistrationUpdateSchema } from "@/lib/courses/registration-followup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireAdmin(request);
    const { id } = await context.params;
    if (!id) throw statusError("缺少報名 id", 400);

    const input = await readJson(request, adminRegistrationUpdateSchema);
    const admin = createSupabaseAdminClient();

    const update: Record<string, unknown> = {};
    if (input.contact_status !== undefined) {
      update.contact_status = input.contact_status;
      // contacted_at 由後端寫，不接受前端傳入——那是稽核用的時間點，
      // 讓呼叫端自己決定等於它可以被填成任何值。
      // 只在「開始跟進」的那一刻記時間；退回待聯繫就清掉，避免留下誤導的時間戳。
      update.contacted_at = input.contact_status === "new" ? null : new Date().toISOString();
    }
    if (input.contact_note !== undefined) update.contact_note = input.contact_note;

    const { data, error } = await admin
      .from("course_registrations")
      .update(update)
      .eq("id", id)
      .select("id, contact_status, contact_note, contacted_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("找不到該報名紀錄", 404);

    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: "course_registration_followup",
      targetType: "course_registration",
      targetId: id,
      metadata: update
    });

    return apiJson({ ok: true, registration: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

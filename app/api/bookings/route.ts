// 巽風預約諮詢｜公開 API
// 任何人（含未登入訪客）都可送預約申請
// 寫入後 admin 在 /admin/bookings 看到並處理

import { NextRequest } from "next/server";
import { apiJson } from "../_helpers";
import { errorMessage, errorStatus, readJson } from "@/lib/auth/member";
import { publicBookingSchema } from "@/lib/bookings/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, publicBookingSchema);
    const admin = createSupabaseAdminClient();

    const payload: Record<string, unknown> = {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      service: input.service || null,
      location: input.location || null,
      size: input.size || null,
      budget: input.budget || null,
      urgency: input.urgency || null,
      schedule: input.schedule || null,
      message: input.message || null,
      source: input.source || "website",
      raw_payload: input
    };

    const { data, error } = await admin
      .from("consultation_bookings")
      .insert(payload)
      .select("id, created_at")
      .single();

    if (error) throw error;

    return apiJson({
      ok: true,
      booking: { id: data.id, created_at: data.created_at },
      message: "預約已送出，巽風團隊將於 24 小時內聯絡您。"
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

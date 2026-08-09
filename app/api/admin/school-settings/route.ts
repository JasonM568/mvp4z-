// 後台：排盤流派設定的讀取與草稿儲存
//
// 流派決定干支怎麼算。改了會讓之後每一份報告的盤都不同，所以跟報告設定一樣
// 走「草稿 → 發布」兩段式，且每份報告會記下當時的版本以便重現。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveSchool, ACTIVE_SCHOOL_ID } from "@/lib/yixue";
import { schoolConfigSchema, SCHOOL_FIELD_GUIDE } from "@/lib/yixue/school/schema";
import { SCHOOL_CACHE_SECONDS } from "@/lib/school-settings/load";

const saveSchema = z.object({
  settings: schoolConfigSchema,
  version_label: z.string().trim().min(1, "請填版本名稱").max(60),
  note: z.string().trim().max(500).optional().default(""),
  decided_by: z.string().trim().max(60).optional().default("")
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("ai_school_profiles")
      .select("id, version_label, status, settings, note, decided_by, published_at, updated_at")
      .in("status", ["draft", "published"])
      .order("updated_at", { ascending: false });

    const base = {
      defaults: resolveSchool(ACTIVE_SCHOOL_ID),
      field_guide: SCHOOL_FIELD_GUIDE,
      cache_seconds: SCHOOL_CACHE_SECONDS
    };

    if (error?.code === "42P01") {
      return apiJson({
        ok: true,
        draft: null,
        published: null,
        ...base,
        setup_required:
          "資料表尚未建立，請先在 Supabase SQL Editor 執行 supabase/migrations/0017_school_profiles.sql。"
      });
    }
    if (error) throw statusError(error.message, 500);

    return apiJson({
      ok: true,
      draft: data?.find((r) => r.status === "draft") || null,
      published: data?.find((r) => r.status === "published") || null,
      ...base
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const input = await readJson(request, saveSchema);
    const settings = schoolConfigSchema.parse(input.settings);

    // 真太陽時要校正就必須拿得到出生地。表單已加了選填欄位，
    // 但會員可能不填，那時會退回預設經度——這裡只提醒不擋。
    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
      .from("ai_school_profiles")
      .select("id")
      .eq("status", "draft")
      .maybeSingle();

    const payload = {
      version_label: input.version_label,
      note: input.note,
      decided_by: input.decided_by,
      settings,
      status: "draft" as const,
      created_by: adminAuth.profile?.id || null
    };

    const { data: saved, error } = existing
      ? await admin.from("ai_school_profiles").update(payload).eq("id", existing.id).select("id").single()
      : await admin.from("ai_school_profiles").insert(payload).select("id").single();

    if (error) throw statusError(error.message, 500);

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "school_settings.save_draft",
      targetType: "ai_school_profile",
      targetId: saved.id,
      metadata: { version_label: input.version_label, calendar: settings.calendar }
    });

    return apiJson({ ok: true, id: saved.id });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

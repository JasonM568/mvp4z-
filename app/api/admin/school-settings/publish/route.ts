// 後台：把流派草稿發布為正式設定
//
// 發布後之後每一份報告的干支都會依這組算法排。舊的 published 轉 archived 不刪除，
// 因為 council_runs.school_version 指著它——歷史報告要能重現當時的盤。

import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { schoolConfigSchema } from "@/lib/yixue/school/schema";
import { invalidateSchoolCache, SCHOOL_CACHE_SECONDS } from "@/lib/school-settings/load";

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const admin = createSupabaseAdminClient();

    const { data: draft, error: draftError } = await admin
      .from("ai_school_profiles")
      .select("id, version_label, settings")
      .eq("status", "draft")
      .maybeSingle();

    if (draftError) throw statusError(draftError.message, 500);
    if (!draft) throw statusError("目前沒有草稿可以發布，請先儲存草稿", 400);

    const parsed = schoolConfigSchema.safeParse(draft.settings);
    if (!parsed.success) {
      throw statusError(`草稿內容有誤，無法發布：${parsed.error.issues[0]?.message}`, 400);
    }

    const { data: current } = await admin
      .from("ai_school_profiles")
      .select("id")
      .eq("status", "published")
      .maybeSingle();

    if (current) {
      const { error } = await admin
        .from("ai_school_profiles")
        .update({ status: "archived" })
        .eq("id", current.id);
      if (error) throw statusError(`封存前一版失敗：${error.message}`, 500);
    }

    const { error: publishError } = await admin
      .from("ai_school_profiles")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", draft.id);

    if (publishError) {
      if (current) {
        await admin.from("ai_school_profiles").update({ status: "published" }).eq("id", current.id);
      }
      throw statusError(`發布失敗：${publishError.message}`, 500);
    }

    invalidateSchoolCache();

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "school_settings.publish",
      targetType: "ai_school_profile",
      targetId: draft.id,
      metadata: { version_label: draft.version_label, archived_previous: current?.id || null }
    });

    return apiJson({ ok: true, id: draft.id, effective_in_seconds: SCHOOL_CACHE_SECONDS });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

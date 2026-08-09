// 後台：把草稿發布為正式設定
//
// 發布會影響之後每一份 20 點的報告，所以：
// 1. 發布前再驗一次（草稿存檔後預設值可能已隨版本更新）
// 2. 舊的 published 轉 archived，不刪除——歷史報告的 prompt_profile_id 要指得到
// 3. 同時只能有一筆 published，由 DB 的 partial unique index 兜底

import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { promptSettingsSchema } from "@/lib/ai/council/settings/schema";
import { invalidatePromptSettingsCache, PROMPT_SETTINGS_CACHE_SECONDS } from "@/lib/ai/council/settings/load";
import { validateSettings } from "@/lib/ai/council/settings/validate";

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const admin = createSupabaseAdminClient();

    const { data: draft, error: draftError } = await admin
      .from("ai_prompt_profiles")
      .select("id, version_label, settings")
      .eq("status", "draft")
      .maybeSingle();

    if (draftError) throw statusError(draftError.message, 500);
    if (!draft) throw statusError("目前沒有草稿可以發布，請先儲存草稿", 400);

    const parsed = promptSettingsSchema.safeParse(draft.settings);
    if (!parsed.success) {
      throw statusError(`草稿內容有誤，無法發布：${parsed.error.issues[0]?.message}`, 400);
    }
    const problems = validateSettings(parsed.data);
    if (problems.length) throw statusError(problems.join("\n"), 400);

    // 先把現行 published 收進 archived，再把草稿升上來。
    // 順序不能反——partial unique index 不允許同時存在兩筆 published。
    const { data: current } = await admin
      .from("ai_prompt_profiles")
      .select("id")
      .eq("status", "published")
      .maybeSingle();

    if (current) {
      const { error } = await admin
        .from("ai_prompt_profiles")
        .update({ status: "archived" })
        .eq("id", current.id);
      if (error) throw statusError(`封存前一版失敗：${error.message}`, 500);
    }

    const { error: publishError } = await admin
      .from("ai_prompt_profiles")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", draft.id);

    if (publishError) {
      // 發布失敗就把剛剛封存的那版救回來，避免變成「一版都沒有」
      if (current) {
        await admin.from("ai_prompt_profiles").update({ status: "published" }).eq("id", current.id);
      }
      throw statusError(`發布失敗：${publishError.message}`, 500);
    }

    invalidatePromptSettingsCache();

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "prompt_settings.publish",
      targetType: "ai_prompt_profile",
      targetId: draft.id,
      metadata: { version_label: draft.version_label, archived_previous: current?.id || null }
    });

    return apiJson({
      ok: true,
      id: draft.id,
      // 其他 serverless 實例各有快取，最多這麼久才全面生效
      effective_in_seconds: PROMPT_SETTINGS_CACHE_SECONDS
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

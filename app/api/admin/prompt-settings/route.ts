// 後台：風羿老師報告設定的讀取與草稿儲存
// GET  取回草稿、已發布版本、系統預設值與環境變數覆寫狀態
// POST 儲存草稿（不影響正在產出的報告，要發布才生效）

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { promptEnvOverrides } from "@/lib/ai/council/personas";
import { DEFAULT_PROMPT_SETTINGS } from "@/lib/ai/council/settings/defaults";
import { promptSettingsSchema } from "@/lib/ai/council/settings/schema";
import { PROMPT_SETTINGS_CACHE_SECONDS } from "@/lib/ai/council/settings/load";
import { estimateSettingsChars, SETTINGS_CHAR_BUDGET, validateSettings } from "@/lib/ai/council/settings/validate";

const saveSchema = z.object({
  settings: promptSettingsSchema,
  version_label: z.string().trim().min(1, "請填版本名稱").max(60, "版本名稱請控制在 60 字內"),
  note: z.string().trim().max(500).optional().default("")
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin
      .from("ai_prompt_profiles")
      .select("id, version_label, status, settings, note, published_at, updated_at")
      .in("status", ["draft", "published"])
      .order("updated_at", { ascending: false });

    // 42P01 = 資料表不存在。migration 0015 還沒在 Supabase 執行時會走到這裡，
    // 回一個看得懂的訊息，不要把 postgres 原始錯誤丟給老師。
    if (error?.code === "42P01") {
      return apiJson({
        ok: true,
        draft: null,
        published: null,
        defaults: DEFAULT_PROMPT_SETTINGS,
        env_overrides: promptEnvOverrides(),
        cache_seconds: PROMPT_SETTINGS_CACHE_SECONDS,
        char_budget: SETTINGS_CHAR_BUDGET,
        setup_required: "資料表尚未建立，請先在 Supabase SQL Editor 執行 supabase/migrations/0015_prompt_profiles_and_documents.sql。在那之前可以先瀏覽內容，但無法儲存。"
      });
    }
    if (error) throw statusError(error.message, 500);

    const draft = data?.find((r) => r.status === "draft") || null;
    const published = data?.find((r) => r.status === "published") || null;

    return apiJson({
      ok: true,
      draft,
      published,
      defaults: DEFAULT_PROMPT_SETTINGS,
      // 這些分身被環境變數蓋掉時，後台改了也不會生效，必須讓老師看得到
      env_overrides: promptEnvOverrides(),
      cache_seconds: PROMPT_SETTINGS_CACHE_SECONDS,
      char_budget: SETTINGS_CHAR_BUDGET
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request);
    const input = await readJson(request, saveSchema);
    // readJson 的泛型會退化成 zod 的 input 型別（選填欄位仍是 optional），
    // 這裡再 parse 一次拿到套完預設值的 output 型別。
    const settings = promptSettingsSchema.parse(input.settings);

    const problems = validateSettings(settings);
    if (problems.length) throw statusError(problems.join("\n"), 400);

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
      .from("ai_prompt_profiles")
      .select("id")
      .eq("status", "draft")
      .maybeSingle();

    const payload = {
      version_label: input.version_label,
      note: input.note,
      settings,
      status: "draft" as const,
      created_by: adminAuth.profile?.id || null
    };

    const { data: saved, error } = existing
      ? await admin.from("ai_prompt_profiles").update(payload).eq("id", existing.id).select("id").single()
      : await admin.from("ai_prompt_profiles").insert(payload).select("id").single();

    if (error) throw statusError(error.message, 500);

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "prompt_settings.save_draft",
      targetType: "ai_prompt_profile",
      targetId: saved.id,
      metadata: { version_label: input.version_label, chars: estimateSettingsChars(settings) }
    });

    return apiJson({ ok: true, id: saved.id, chars: estimateSettingsChars(settings) });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

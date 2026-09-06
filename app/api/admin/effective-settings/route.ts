// 後台：現在「實際生效」的設定是什麼
//
// 為什麼要有這支：後台原本各自從自己手上的資料推算生效狀態，於是顯示的是
// 「老師勾了什麼」而不是「報告真的用了什麼」。這兩者曾經整整一個月不一致
// （文件庫顯示已納入 3741 字，實際一次都沒進過 prompt），而畫面看起來完全正常。
//
// 所以這裡刻意**呼叫報告管線用的同一組 loader**（loadPromptSettings / loadSchool），
// 而不是自己再查一次表自己判斷。UI 顯示什麼，就是報告會拿到什麼，
// 不留任何讓兩邊各自解讀的空間。
//
// 讀之前先清快取：後台是要看「現在真相」，不是看這個實例 60 秒前的印象。

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  invalidatePromptSettingsCache,
  loadPromptSettings,
  PROMPT_SETTINGS_CACHE_SECONDS
} from "@/lib/ai/council/settings/load";
import { invalidateSchoolCache, loadSchool } from "@/lib/school-settings/load";
import { DOCUMENT_CHAR_BUDGET } from "@/lib/ai/council/settings/schema";
import { diffSchool } from "@/lib/school-settings/diff";

/** 回退原因轉人話。老師看不懂 no_published_profile，但看得懂「還沒發布過」。 */
const REASON_LABELS: Record<string, string> = {
  no_published_profile: "還沒有發布過任何版本，報告使用程式內建的預設值",
  invalid_settings: "已發布的版本內容驗證不通過，已自動改用程式預設值（請重新發布）",
  query_failed: "讀取資料庫失敗，本次改用程式預設值",
  supabase_unavailable: "資料庫連線異常，本次改用程式預設值",
  table_missing: "資料表尚未建立，請先執行對應的 migration"
};

function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] || `已回退到程式預設值（${reason}）`;
}

// ---------------------------------------------------------------- 草稿查詢

type DraftRow = { id: string; version_label: string; settings: unknown; updated_at: string };

/** 草稿讀不到不是致命錯誤——生效狀態才是這支 API 的主體，草稿只是附帶提醒。 */
async function readDraft(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  table: "ai_prompt_profiles" | "ai_school_profiles"
): Promise<DraftRow | null> {
  try {
    const { data, error } = await admin
      .from(table)
      .select("id, version_label, settings, updated_at")
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as DraftRow) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- handler

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    // 後台要看的是現在的真相，不是這個實例 60 秒前快取住的印象。
    invalidatePromptSettingsCache();
    invalidateSchoolCache();

    const admin = createSupabaseAdminClient();
    const [prompt, school, promptDraft, schoolDraft] = await Promise.all([
      loadPromptSettings(Date.now()),
      loadSchool(Date.now()),
      readDraft(admin, "ai_prompt_profiles"),
      readDraft(admin, "ai_school_profiles")
    ]);

    // 勾選字數：這是「老師勾了什麼」。跟下面的 block_chars 是兩件事，
    // 兩個數字都要給，因為它們不一致正是要被看見的訊號。
    let tickedCount = 0;
    let tickedChars = 0;
    try {
      const { data } = await admin
        .from("ai_documents")
        .select("char_count")
        .eq("include_in_prompt", true);
      for (const row of data || []) {
        tickedCount += 1;
        tickedChars += Number(row.char_count) || 0;
      }
    } catch {
      // 文件表讀不到就讓字數維持 0；block_chars 仍然是可信的那一個。
    }

    const blockChars = prompt.documentBlock.length;

    return apiJson({
      ok: true,
      checked_at: new Date().toISOString(),
      cache_seconds: PROMPT_SETTINGS_CACHE_SECONDS,
      prompt: {
        live: prompt.profileId ? "published" : "defaults",
        version_label: prompt.versionLabel,
        profile_id: prompt.profileId,
        fallback_reason: prompt.fallbackReason,
        reason_label: reasonLabel(prompt.fallbackReason),
        draft: promptDraft
          ? { version_label: promptDraft.version_label, updated_at: promptDraft.updated_at }
          : null
      },
      documents: {
        // 真相：documentBlock 是實際串進 prompt 的字串，長度含標題與說明行。
        block_chars: blockChars,
        reaching_prompt: blockChars > 0,
        ticked_count: tickedCount,
        ticked_chars: tickedChars,
        budget: DOCUMENT_CHAR_BUDGET,
        truncated: tickedChars > DOCUMENT_CHAR_BUDGET
      },
      school: {
        live: school.profileId ? "published" : "defaults",
        label: school.school.label,
        school_id: school.school.id,
        profile_id: school.profileId,
        fallback_reason: school.fallbackReason,
        reason_label: reasonLabel(school.fallbackReason),
        decided_by: school.school.decidedBy || null,
        decided_at: school.school.decidedAt || null,
        draft: schoolDraft
          ? {
              version_label: schoolDraft.version_label,
              updated_at: schoolDraft.updated_at,
              // 差異為空陣列＝草稿內容與生效值相同，那就不必催發布。
              changes: diffSchool(school.school, schoolDraft.settings)
            }
          : null
      }
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

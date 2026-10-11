// 巽風 council｜報告設定載入
//
// 唯一原則：**設定出問題絕不能讓報告產不出來。**
// DB 掛掉、沒有已發布版本、jsonb 形狀壞掉、zod 驗證失敗——任何一種情況
// 都回退到程式預設值（等同後台上線前的行為），並記 log 讓我們知道。
//
// 理由：這條路徑一份報告收 20 點。後台設定是「加值」，不該有能力讓產品下線。

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PROMPT_SETTINGS } from "./defaults";
import { promptSettingsSchema, type PromptSettings } from "./schema";
import type { TeacherDocument } from "./document-selection";

export type LoadedPromptSettings = {
  settings: PromptSettings;
  /** 已發布版本的 id，寫進 council_runs.prompt_profile_id 供追溯；用預設值時為 null。 */
  profileId: string | null;
  versionLabel: string;
  /** 老師勾選的完整文字庫；每份報告按當次問題選取段落。 */
  documents: TeacherDocument[];
  /** 走了回退路徑的原因，null 表示正常讀到已發布設定。 */
  fallbackReason: string | null;
};

// documents 要獨立傳進來：文件庫與設定版本是兩件事，
// 老師沒發布過設定版本時，他勾選的文件仍然必須進 prompt。
const DEFAULT_RESULT = (reason: string | null, documents: TeacherDocument[] = []): LoadedPromptSettings => ({
  settings: DEFAULT_PROMPT_SETTINGS,
  profileId: null,
  versionLabel: "系統預設",
  documents,
  fallbackReason: reason
});

// 每個 serverless 實例各自快取。發布後最多 CACHE_TTL_MS 才全面生效，
// 後台會顯示這個延遲，避免老師以為沒存到而重複發布。
const CACHE_TTL_MS = 60_000;
let cache: { value: LoadedPromptSettings; expiresAt: number } | null = null;

export function invalidatePromptSettingsCache() {
  cache = null;
}

/** 後台顯示用：快取多久後全面生效。 */
export const PROMPT_SETTINGS_CACHE_SECONDS = CACHE_TTL_MS / 1000;

export async function loadPromptSettings(now: number): Promise<LoadedPromptSettings> {
  if (cache && cache.expiresAt > now) return cache.value;

  const result = await readFromDatabase();
  cache = { value: result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

async function readFromDatabase(): Promise<LoadedPromptSettings> {
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.warn("[prompt-settings] supabase client 建立失敗，改用程式預設值", error);
    return DEFAULT_RESULT("supabase_unavailable");
  }

  // 文件庫先讀，且與設定版本的成敗無關。
  // 曾經這行寫在「成功解析 published 設定」之後，導致老師上傳並勾選了文件、
  // 後台也顯示「已納入 N 字」，但因為從沒發布過設定版本，文件一次都沒進過 prompt。
  const documents = await loadDocuments(admin);

  const { data, error } = await admin
    .from("ai_prompt_profiles")
    .select("id, version_label, settings")
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.warn("[prompt-settings] 讀取已發布設定失敗，改用程式預設值", error);
    return DEFAULT_RESULT("query_failed", documents);
  }
  if (!data) {
    // 後台還沒發布過任何版本。這是正常狀態，不是錯誤。
    return DEFAULT_RESULT("no_published_profile", documents);
  }

  const parsed = promptSettingsSchema.safeParse(data.settings);
  if (!parsed.success) {
    console.warn("[prompt-settings] 已發布設定驗證失敗，改用程式預設值", {
      profileId: data.id,
      issue: parsed.error.issues[0]?.message
    });
    return DEFAULT_RESULT("invalid_settings", documents);
  }

  return {
    settings: parsed.data,
    profileId: data.id,
    versionLabel: data.version_label,
    documents,
    fallbackReason: null
  };
}

/**
 * 讀取已勾選文件。取用段落由 document-selection.ts 在收到報告問題後決定。
 */
async function loadDocuments(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<TeacherDocument[]> {
  // 這個查詢現在每份報告都會跑（不再只跑在設定版本成功的路徑上），
  // 所以自己吞掉例外：文件讀不到就當作沒勾選，不可以讓報告產不出來。
  const documents: TeacherDocument[] = [];
  try {
    for (let offset = 0; ; offset += 1000) {
      const result = await admin
        .from("ai_documents")
        .select("id, title, term, extracted_text, char_count")
        .eq("include_in_prompt", true)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (result.error) {
        console.warn("[prompt-settings] 讀取參考文件失敗，本次報告不附文件", result.error);
        return [];
      }
      documents.push(...(result.data || []));
      if ((result.data || []).length < 1000) break;
    }
  } catch (error) {
    console.warn("[prompt-settings] 讀取參考文件發生例外，本次報告不附文件", error);
    return [];
  }

  return documents;
}

// 巽風 council｜報告設定載入
//
// 唯一原則：**設定出問題絕不能讓報告產不出來。**
// DB 掛掉、沒有已發布版本、jsonb 形狀壞掉、zod 驗證失敗——任何一種情況
// 都回退到程式預設值（等同後台上線前的行為），並記 log 讓我們知道。
//
// 理由：這條路徑一份報告收 20 點。後台設定是「加值」，不該有能力讓產品下線。

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PROMPT_SETTINGS } from "./defaults";
import { DOCUMENT_CHAR_BUDGET, promptSettingsSchema, type PromptSettings } from "./schema";

export type LoadedPromptSettings = {
  settings: PromptSettings;
  /** 已發布版本的 id，寫進 council_runs.prompt_profile_id 供追溯；用預設值時為 null。 */
  profileId: string | null;
  versionLabel: string;
  /** 老師勾選納入 prompt 的文件內容，已裁到字數上限。沒有勾選時為空字串。 */
  documentBlock: string;
  /** 走了回退路徑的原因，null 表示正常讀到已發布設定。 */
  fallbackReason: string | null;
};

// documentBlock 要獨立傳進來：文件庫與設定版本是兩件事，
// 老師沒發布過設定版本時，他勾選的文件仍然必須進 prompt。
const DEFAULT_RESULT = (reason: string | null, documentBlock = ""): LoadedPromptSettings => ({
  settings: DEFAULT_PROMPT_SETTINGS,
  profileId: null,
  versionLabel: "系統預設",
  documentBlock,
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
  const documentBlock = await buildDocumentBlock(admin);

  const { data, error } = await admin
    .from("ai_prompt_profiles")
    .select("id, version_label, settings")
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.warn("[prompt-settings] 讀取已發布設定失敗，改用程式預設值", error);
    return DEFAULT_RESULT("query_failed", documentBlock);
  }
  if (!data) {
    // 後台還沒發布過任何版本。這是正常狀態，不是錯誤。
    return DEFAULT_RESULT("no_published_profile", documentBlock);
  }

  const parsed = promptSettingsSchema.safeParse(data.settings);
  if (!parsed.success) {
    console.warn("[prompt-settings] 已發布設定驗證失敗，改用程式預設值", {
      profileId: data.id,
      issue: parsed.error.issues[0]?.message
    });
    return DEFAULT_RESULT("invalid_settings", documentBlock);
  }

  return {
    settings: parsed.data,
    profileId: data.id,
    versionLabel: data.version_label,
    documentBlock,
    fallbackReason: null
  };
}

/**
 * 組出要附進 prompt 的文件內容。
 *
 * 為什麼要裁字數：這段文字會跟著 prompt 走，而一份報告的 prompt 會被送出 7 次，
 * 字數成本是七倍，過長還會擠壓每次呼叫 45 秒的視窗造成逾時。
 * 超出上限就截斷並註明，不靜默丟棄——老師要看得出來是他勾太多了。
 */
async function buildDocumentBlock(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<string> {
  // 這個查詢現在每份報告都會跑（不再只跑在設定版本成功的路徑上），
  // 所以自己吞掉例外：文件讀不到就當作沒勾選，不可以讓報告產不出來。
  let data: Array<{ title: string; extracted_text: string | null; char_count: number }> | null = null;
  try {
    const result = await admin
      .from("ai_documents")
      .select("title, extracted_text, char_count")
      .eq("include_in_prompt", true)
      .order("created_at", { ascending: true });
    if (result.error) {
      console.warn("[prompt-settings] 讀取參考文件失敗，本次報告不附文件", result.error);
      return "";
    }
    data = result.data;
  } catch (error) {
    console.warn("[prompt-settings] 讀取參考文件發生例外，本次報告不附文件", error);
    return "";
  }

  if (!data?.length) return "";

  const parts: string[] = [];
  let used = 0;
  let truncated = 0;

  for (const doc of data) {
    const text = String(doc.extracted_text || "").trim();
    if (!text) continue;
    const remaining = DOCUMENT_CHAR_BUDGET - used;
    if (remaining <= 0) {
      truncated += 1;
      continue;
    }
    const slice = text.length > remaining ? `${text.slice(0, remaining)}⋯（後略）` : text;
    used += slice.length;
    parts.push(`【${doc.title}】\n${slice}`);
  }

  if (!parts.length) return "";

  const notice = truncated
    ? `\n（另有 ${truncated} 份文件因超出字數上限未納入，請到後台調整勾選）`
    : "";

  return `風羿老師補充參考資料（僅作為判讀依據，不得直接照抄進報告）：\n\n${parts.join("\n\n")}${notice}`;
}

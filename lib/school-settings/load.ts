// 巽風｜流派設定載入
//
// 放在 lib/yixue 外面，是因為這裡要讀資料庫。lib/yixue 必須維持純函式
// （無 I/O、無 Date.now），才能讓數百條 golden case 逐欄位比對，guard.test.ts 在管這件事。
//
// 與報告設定同一個原則：**任何失敗都回退程式預設值**。
// 流派讀不到就用 fengyi-v1，報告照常產出——設定問題不該讓收費產品下線。

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveSchool, ACTIVE_SCHOOL_ID } from "@/lib/yixue";
import { schoolConfigSchema } from "@/lib/yixue/school/schema";
import type { SchoolConfig } from "@/lib/yixue/school/types";

export type LoadedSchool = {
  school: SchoolConfig;
  /** 已發布版本的 DB id；用程式預設值時為 null。 */
  profileId: string | null;
  fallbackReason: string | null;
};

const CACHE_TTL_MS = 60_000;
let cache: { value: LoadedSchool; expiresAt: number } | null = null;

export function invalidateSchoolCache() {
  cache = null;
}

export const SCHOOL_CACHE_SECONDS = CACHE_TTL_MS / 1000;

function defaultResult(reason: string | null): LoadedSchool {
  return { school: resolveSchool(ACTIVE_SCHOOL_ID), profileId: null, fallbackReason: reason };
}

export async function loadSchool(now: number): Promise<LoadedSchool> {
  if (cache && cache.expiresAt > now) return cache.value;
  const result = await read();
  cache = { value: result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

async function read(): Promise<LoadedSchool> {
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.warn("[school] supabase client 建立失敗，改用程式預設流派", error);
    return defaultResult("supabase_unavailable");
  }

  const { data, error } = await admin
    .from("ai_school_profiles")
    .select("id, settings")
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    // 42P01 = 表還沒建。這是尚未套用 migration 的正常狀態，不是故障。
    const reason = error.code === "42P01" ? "table_missing" : "query_failed";
    if (reason === "query_failed") console.warn("[school] 讀取流派失敗，改用程式預設值", error);
    return defaultResult(reason);
  }
  if (!data) return defaultResult("no_published_profile");

  const parsed = schoolConfigSchema.safeParse(data.settings);
  if (!parsed.success) {
    console.warn("[school] 已發布流派驗證失敗，改用程式預設值", {
      profileId: data.id,
      issue: parsed.error.issues[0]?.message
    });
    return defaultResult("invalid_settings");
  }

  return { school: parsed.data as SchoolConfig, profileId: data.id, fallbackReason: null };
}

// 讀 council_provider_calls，給後台頁面與排程告警共用。
//
// 刻意不 select 報告正文：這個 view 本來就只有呼叫結果，
// 數幾次失敗不需要把每份付費報告的判讀內容拉出來。

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderCall } from "./provider-health";

/** 一次最多讀幾列。三家 × 兩輪 = 每份報告 6 列，5000 列約等於 830 份報告。 */
const MAX_ROWS = 5000;

export async function loadProviderCalls(
  admin: SupabaseClient,
  days = 30,
  now: Date = new Date()
): Promise<ProviderCall[]> {
  const since = new Date(now.getTime() - days * 24 * 3600_000).toISOString();
  const { data, error } = await admin
    .from("council_provider_calls")
    .select("role, ok, error, status, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;
  return (data || []) as ProviderCall[];
}

// 計算會員本月已使用的 council 免費額度
// 用於 VIP 月內前 N 份免費的扣點判定

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getMonthlyCouncilUsage(input: {
  userId: string;
  reference?: Date;
}): Promise<{ freeQuotaUsedThisMonth: number; totalThisMonth: number }> {
  const admin = createSupabaseAdminClient();
  const ref = input.reference || new Date();
  const monthStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1)).toISOString();

  const { data, error } = await admin
    .from("council_runs")
    .select("id, free_quota_used")
    .eq("user_id", input.userId)
    .gte("created_at", monthStart);

  if (error) throw error;

  const rows = data || [];
  const freeQuotaUsedThisMonth = rows.filter((r: any) => r.free_quota_used === true).length;
  const totalThisMonth = rows.length;

  return { freeQuotaUsedThisMonth, totalThisMonth };
}

/** 每位會員每個台北日曆日最多產出的決策報告份數（含備援稿，因為備援稿一樣燒了 LLM 成本）。 */
export const COUNCIL_DAILY_LIMIT = 20;

/** 台北時間（UTC+8、無夏令時間）當日 00:00 對應的 UTC ISO 字串。 */
export function taipeiDayStartIso(now: Date = new Date()): string {
  const OFFSET_MS = 8 * 60 * 60 * 1000;
  const taipei = new Date(now.getTime() + OFFSET_MS);
  const startUtc = Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()) - OFFSET_MS;
  return new Date(startUtc).toISOString();
}

/** 會員今天（台北時間）已產出幾份。 */
export async function getTodayCouncilCount(userId: string, now: Date = new Date()): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("council_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", taipeiDayStartIso(now));
  if (error) throw error;
  return count || 0;
}

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

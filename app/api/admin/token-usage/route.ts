// 巽風 admin｜token 用量儀表板資料來源
// GET /api/admin/token-usage?days=30 → 最近 N 天每日 token + cost 拆解（per model）

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchUsageStats } from "@/lib/admin/token-usage";
import { MODEL_PRICING, USD_TO_NTD } from "@/lib/ai/pricing";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") || 30);
    const admin = createSupabaseAdminClient();
    const stats = await fetchUsageStats(admin, days);
    return apiJson({
      ok: true,
      stats,
      pricing: MODEL_PRICING,
      exchange_rate_usd_twd: USD_TO_NTD
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

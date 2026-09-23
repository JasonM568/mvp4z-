// 後台｜決策報告的 AI 模型健康狀態。
//
// 存在的理由：終稿只由 OpenAI 寫，所以其他兩家掛掉時報告照樣產得出來，
// 只是從三家意見變兩家——**會員付一樣的錢、拿到少一家意見的報告，
// 而且畫面上沒有任何跡象。** 這一頁就是把那個「沒有跡象」變成有跡象。
//
// 不依賴寄信：正式站目前沒有 RESEND_API_KEY，告警信一封都寄不出去。
// 只做寄信等於做了一個今天不會響的鈴，所以先做看得到的。

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadProviderCalls } from "@/lib/ai/council/provider-health-query";
import { HEALTH_THRESHOLDS, summarizeProviderHealth } from "@/lib/ai/council/provider-health";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const calls = await loadProviderCalls(admin);
    return apiJson({
      ok: true,
      health: summarizeProviderHealth(calls),
      thresholds: HEALTH_THRESHOLDS,
      sampleSize: calls.length,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

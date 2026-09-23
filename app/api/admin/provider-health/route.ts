// 後台｜決策報告的 AI 模型健康狀態。
//
// 存在的理由：終稿只由 OpenAI 寫，所以其他兩家掛掉時報告照樣產得出來，
// 只是從三家意見變兩家——**會員付一樣的錢、拿到少一家意見的報告，
// 而且畫面上沒有任何跡象。** 這一頁就是把那個「沒有跡象」變成有跡象。
//
// 刻意不依賴寄信。這頁做出來的時候正式站根本沒設 RESEND_API_KEY，
// 全站 admin 告警一封都沒寄出過而沒有人知道——只做寄信等於做了一個不會響的鈴。
// （2026-09-23 當天稍晚 key 補上、xunfeng.tw 網域也驗證完成，告警已能寄出；
// 但「看得到」與「會通知」是兩件事，這頁的存在理由不隨之消失。）

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

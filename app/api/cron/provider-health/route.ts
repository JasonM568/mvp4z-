// Vercel Cron：決策報告的 AI 模型失敗率告警。
//
// 起因：2026-09-23 查正式庫發現 Gemini 失敗率 11.0%，而 OpenAI 0.8%、DeepSeek 1.7%
// ——高一個數量級，最近一次就在當天。但沒有任何人會知道，因為終稿是 OpenAI 寫的，
// 少一家意見的報告看起來跟正常報告一模一樣。
//
// 這支排程每天掃一次，只有在越過門檻時才寄信（門檻與理由見 provider-health.ts）。
// 全綠就安靜——會天天寄的告警，三天後就沒有人在看了。
//
// 觸發：
//   - 每天台灣時間 09:10（UTC 01:10）：vercel.json schedule "10 1 * * *"
//   - 手動：curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/provider-health
//   - 預覽：?dry_run=1 回傳會寄出的內容但不寄
//
// 寄信通道：2026-09-23 已打通（RESEND_API_KEY 已設，xunfeng.tw 在 Resend 驗證完成，
// 實際收到測試信）。在那之前這支只會 skip，而且沒有任何地方看得出來。
//
// ⚠️ 回應裡的 delivery.skipped / delivery.reason 仍要看：
// **看到 skipped 或 resend_failed 就是沒有通知到，不要當成已經通知。**
// 想當場確認鈴還會不會響，用後台 /admin/provider-health 的「寄一封測試告警給我」。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { loadProviderCalls } from "@/lib/ai/council/provider-health-query";
import { buildHealthAlert, needsAlert, summarizeProviderHealth } from "@/lib/ai/council/provider-health";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("Authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  try {
    const admin = createSupabaseAdminClient();
    const calls = await loadProviderCalls(admin);
    const health = summarizeProviderHealth(calls);

    if (!needsAlert(health)) {
      return NextResponse.json({
        ok: true,
        alerted: false,
        reason: "全部在門檻內",
        health: health.map((h) => ({ role: h.role, level: h.level, reason: h.reason }))
      });
    }

    const alert = buildHealthAlert(health);
    if (dryRun) {
      return NextResponse.json({ ok: true, dry_run: true, alert, health });
    }

    const sent = await sendAdminAlert(alert);
    // 寄不出去也要留在 log 裡，否則沒有 Resend 的期間等於整件事沒發生過。
    if (!sent.ok) {
      console.warn("[cron/provider-health] 告警未送達", { reason: sent.reason, subject: alert.subject });
    }

    return NextResponse.json({
      ok: true,
      alerted: true,
      delivery: sent,
      subject: alert.subject,
      health: health.map((h) => ({ role: h.role, level: h.level, reason: h.reason }))
    });
  } catch (error) {
    console.error("[cron/provider-health] 失敗", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

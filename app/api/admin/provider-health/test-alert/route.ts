// 後台｜寄一封測試告警給按下按鈕的管理員。
//
// 為什麼需要這支：告警最糟的失敗方式是**安靜地不運作**。
// 巽風的 admin 告警就這樣壞了不知道多久——正式站沒設 RESEND_API_KEY，
// sendAdminAlert() 每次都回 skipped，於是綠界付款異常也好、註冊異常也好，
// 一封都沒真的寄出去，而且沒有任何地方看得出來。
//
// 所以要有一個「現在就證明鈴會響」的按鈕，而不是等真的出事時才發現它不響。
//
// 只寄給發出請求的管理員本人，不寄給全體：拿測試信去吵每一位管理員很沒禮貌。
// 因此也不接受共用的 ADMIN_KEY——那條路徑沒有具名身分，不知道該寄給誰。

import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadProviderCalls } from "@/lib/ai/council/provider-health-query";
import { buildHealthAlert, needsAlert, summarizeProviderHealth } from "@/lib/ai/council/provider-health";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireAdmin(request);
    if (!profile?.email) {
      throw statusError("測試告警需要以管理員帳號登入（共用金鑰沒有收件人）", 400);
    }

    // 用真實資料組信，不是寄一封 "hello world"。
    // 測試要測的是「這封信寄出去長什麼樣、內容對不對」，不只是通道有沒有通。
    const admin = createSupabaseAdminClient();
    const health = summarizeProviderHealth(await loadProviderCalls(admin));
    const alert = needsAlert(health)
      ? buildHealthAlert(health)
      : {
          subject: "[巽風] 告警通道測試（目前三家模型都正常）",
          text: [
            "這是一封測試信，用來確認告警真的寄得出來。",
            "",
            "目前三家模型都在門檻內，所以沒有實際異常。",
            ...health.map((h) => `・${h.label}：七日 ${h.week.failures}/${h.week.calls}　${h.reason}`),
            "",
            "後台明細：https://www.xunfeng.tw/admin/provider-health"
          ].join("\n")
        };

    const sent = await sendAdminAlert({
      subject: `${alert.subject}（測試）`,
      text: `※ 這是手動觸發的測試信，收件人只有你一人。\n\n${alert.text}`,
      to: [profile.email]
    });

    return apiJson({ ok: sent.ok, sentTo: profile.email, delivery: sent });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

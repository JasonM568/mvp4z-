// 報告生成當下的即時告警。
//
// 為什麼不能只靠每天一次的排程（/api/cron/provider-health）：2026-11-07 兩家金鑰同時失效，
// 排程要等到隔天早上 9:10 才會掃到，這之間每一份報告都在靜默降級。
//
// 觸發條件（不受樣本數限制）：
//   1. 任何一家回 400／401／403——金鑰或請求本身被拒，重試永遠救不了；
//   2. 同一家在同一份報告的兩輪都失敗——等於連續失敗 2 次。
// 冷卻：同一個 key 3 小時內只寄一次，避免每份報告都寄一封；冷卻狀態存在 admin_audit_logs。

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import type { ModelResult } from "./providers";

export const ALERT_COOLDOWN_MS = 3 * 3600_000;
const AUDIT_ACTION = "provider_failure_alert";

const KEY_ERROR_STATUSES = new Set([400, 401, 403]);

export type ProviderAlertTrigger = {
  /** 冷卻用的識別：role + 類型。 */
  key: string;
  role: string;
  label: string;
  kind: "key_rejected" | "consecutive_failures";
  detail: string;
};

/** 純函式：這份報告的呼叫結果裡，有哪些該告警。 */
export function detectProviderAlerts(results: ModelResult[]): ProviderAlertTrigger[] {
  const byRole = new Map<string, ModelResult[]>();
  for (const r of results) {
    if (r.role === "finalChatGPT") continue;
    byRole.set(r.role, [...(byRole.get(r.role) || []), r]);
  }

  const triggers: ProviderAlertTrigger[] = [];
  for (const [role, calls] of byRole) {
    const failed = calls.filter((c) => !c.ok);
    if (!failed.length) continue;
    const label = calls[0].label.split("｜")[0];

    const rejected = failed.find((c) => c.status != null && KEY_ERROR_STATUSES.has(c.status));
    if (rejected) {
      triggers.push({
        key: `${role}:key_rejected`,
        role,
        label,
        kind: "key_rejected",
        detail: `HTTP ${rejected.status}：${(rejected.error || "").slice(0, 160)}`
      });
      continue;
    }
    if (failed.length >= 2) {
      triggers.push({
        key: `${role}:consecutive_failures`,
        role,
        label,
        kind: "consecutive_failures",
        detail: `本份報告兩輪皆失敗：${(failed[failed.length - 1].error || "").slice(0, 160)}`
      });
    }
  }
  return triggers;
}

export function buildFailureAlert(triggers: ProviderAlertTrigger[], runId: string | null, now: Date = new Date()) {
  const lines = [
    "決策報告剛剛有分身呼叫失敗，該份報告已改走備援稿、未扣點（三方必到）。",
    "",
    ...triggers.flatMap((t) => [
      `■ ${t.label}　[${t.kind === "key_rejected" ? "金鑰／請求被拒" : "連續失敗"}]`,
      `  ${t.detail}`,
      ""
    ]),
    "請檢查 Vercel Production 的金鑰與模型名稱，更新後必須 Redeploy 才會生效。",
    runId ? `該份報告：https://www.xunfeng.tw/admin/council-runs/${runId}` : "",
    "後台明細：https://www.xunfeng.tw/admin/provider-health",
    `產生時間：${now.toISOString()}`
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return {
    subject: `[巽風] 報告分身呼叫失敗：${[...new Set(triggers.map((t) => t.label))].join("、")}`,
    text: lines.join("\n")
  };
}

/**
 * 報告寫入後呼叫。任何失敗都吞掉——告警壞了不能拖垮報告交付。
 * 回傳是否有寄出，供測試與 log 使用。
 */
export async function notifyProviderFailures(
  admin: SupabaseClient,
  results: ModelResult[],
  runId: string | null,
  now: Date = new Date()
): Promise<{ sent: boolean; triggers: number; reason?: string }> {
  try {
    const triggers = detectProviderAlerts(results);
    if (!triggers.length) return { sent: false, triggers: 0, reason: "no_trigger" };

    const since = new Date(now.getTime() - ALERT_COOLDOWN_MS).toISOString();
    const { data: recent } = await admin
      .from("admin_audit_logs")
      .select("metadata")
      .eq("action", AUDIT_ACTION)
      .gte("created_at", since);
    const cooled = new Set(
      (recent || []).flatMap((row: { metadata?: { keys?: string[] } | null }) => row.metadata?.keys || [])
    );
    const fresh = triggers.filter((t) => !cooled.has(t.key));
    if (!fresh.length) return { sent: false, triggers: triggers.length, reason: "cooldown" };

    const sent = await sendAdminAlert(buildFailureAlert(fresh, runId, now));
    if (!sent.ok) {
      console.warn("[council] 即時告警未送達", { reason: sent.reason });
      // 沒送達就不進冷卻，下一份報告還會再試。
      return { sent: false, triggers: triggers.length, reason: sent.reason };
    }
    await admin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: AUDIT_ACTION,
      target_type: "council_run",
      target_id: runId,
      metadata: { keys: fresh.map((t) => t.key) }
    });
    return { sent: true, triggers: triggers.length };
  } catch (error) {
    console.warn("[council] 即時告警例外", { error: error instanceof Error ? error.message : String(error) });
    return { sent: false, triggers: 0, reason: "threw" };
  }
}

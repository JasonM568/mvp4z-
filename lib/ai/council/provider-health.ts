// Provider 健康狀態統計。
//
// 要回答的問題只有一個：**有沒有哪一家模型正在讓報告靜默降級？**
//
// 終稿只由 OpenAI 寫，Gemini 或 DeepSeek 掛掉時報告照樣生得出來，
// 只是從三家意見變兩家——會員付一樣的錢，拿到少一家意見的報告，
// 而且畫面上沒有任何跡象。這就是這個模組存在的理由。
//
// 資料來源是 council_provider_calls view（council_runs 的 provider 呼叫攤平）。
// 判定邏輯放在這裡而不是 SQL，是為了能被測試鎖住——門檻一旦設錯，
// 不是狂叫就是永遠不叫，兩種都會讓人不再相信告警。

export type ProviderRole = "openaiFengYi" | "geminiFengYi" | "deepseekAttack";

export type ProviderCall = {
  role: string;
  ok: boolean;
  error: string | null;
  status: number | null;
  created_at: string;
};

export const PROVIDER_LABELS: Record<ProviderRole, string> = {
  openaiFengYi: "OpenAI｜主判讀",
  geminiFengYi: "Gemini｜策略推演",
  deepseekAttack: "DeepSeek｜攻防反證"
};

export const PROVIDER_ROLES = Object.keys(PROVIDER_LABELS) as ProviderRole[];

/**
 * 門檻。
 *
 * 兩個設計考量：
 *
 * 1. **小樣本不判定。** 這是付費報告，一天只有幾份，七天可能只有十幾次呼叫。
 *    一次失敗就是 10% 失敗率——沒有最小樣本數的話，告警會在正常波動下狂叫，
 *    叫到沒有人再看它。所以先要有足夠的呼叫次數才用比率判定。
 *
 * 2. **絕對次數是另一條路。** 樣本不足但 24 小時內連續失敗好幾次，
 *    那不是波動，是真的出事了，不該因為「樣本不夠」而沉默。
 *
 * 現況參考（2026-09-23 全期間）：Gemini 11.0%、DeepSeek 1.7%、OpenAI 0.8%。
 * 15% 的門檻設在 Gemini 目前水準之上一點——會在它明顯惡化時響，而不是一直響。
 */
export const HEALTH_THRESHOLDS = {
  /** 用比率判定前，七日內至少要有這麼多次呼叫。 */
  minSampleFor7dRate: 10,
  /** 七日失敗率達到這個比例就算「注意」。 */
  warnRate7d: 0.15,
  /** 不看比率，24 小時內失敗這麼多次就算「注意」。 */
  warnFailures24h: 3,
  /**
   * 判定「疑似整個掛掉」前，24 小時內至少要有這麼多次呼叫。
   *
   * 設 4 而不是 3：一份報告會打同一家兩次（第一輪＋第二輪攻防），
   * 所以 4 次全滅代表「連續兩份報告都拿不到這一家的意見」，
   * 那才是不可用；3 次只是一份半，比較像瞬間尖峰。
   */
  minSampleForDown: 4
} as const;

export type HealthLevel = "ok" | "warn" | "down";

export type WindowStat = { calls: number; failures: number; rate: number };

export type ProviderHealth = {
  role: ProviderRole;
  label: string;
  level: HealthLevel;
  /** 為什麼是這個等級。讓看的人不必回頭讀程式碼就知道門檻踩在哪。 */
  reason: string;
  day: WindowStat;
  week: WindowStat;
  month: WindowStat;
  lastFailureAt: string | null;
  /** 近期最常見的失敗訊息，最多三種。 */
  topErrors: { error: string; count: number }[];
};

const HOUR = 3600_000;

function statOf(calls: ProviderCall[]): WindowStat {
  const failures = calls.filter((c) => !c.ok).length;
  return { calls: calls.length, failures, rate: calls.length ? failures / calls.length : 0 };
}

function judge(day: WindowStat, week: WindowStat): { level: HealthLevel; reason: string } {
  if (day.calls >= HEALTH_THRESHOLDS.minSampleForDown && day.failures === day.calls) {
    return { level: "down", reason: `24 小時內 ${day.calls} 次呼叫全部失敗，疑似整個不可用` };
  }
  if (day.failures >= HEALTH_THRESHOLDS.warnFailures24h) {
    return { level: "warn", reason: `24 小時內失敗 ${day.failures} 次` };
  }
  if (week.calls >= HEALTH_THRESHOLDS.minSampleFor7dRate && week.rate >= HEALTH_THRESHOLDS.warnRate7d) {
    return {
      level: "warn",
      reason: `七日失敗率 ${(week.rate * 100).toFixed(1)}%（${week.failures}/${week.calls}），高於 ${(HEALTH_THRESHOLDS.warnRate7d * 100).toFixed(0)}% 門檻`
    };
  }
  if (week.calls < HEALTH_THRESHOLDS.minSampleFor7dRate) {
    return { level: "ok", reason: `七日內僅 ${week.calls} 次呼叫，樣本不足以用比率判定` };
  }
  return { level: "ok", reason: `七日失敗率 ${(week.rate * 100).toFixed(1)}%，在門檻內` };
}

function topErrorsOf(calls: ProviderCall[]): { error: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of calls) {
    if (c.ok) continue;
    const key = (c.error || "未記錄錯誤訊息").trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

/**
 * 算出每一家的健康狀態。
 *
 * `calls` 傳進來的應該是 30 天內的紀錄；更舊的會被 month 視窗濾掉，
 * 但先在查詢端限制範圍比較省。
 */
export function summarizeProviderHealth(calls: ProviderCall[], now: Date = new Date()): ProviderHealth[] {
  const t = now.getTime();
  return PROVIDER_ROLES.map((role) => {
    const mine = calls.filter((c) => c.role === role);
    const since = (hours: number) => mine.filter((c) => t - Date.parse(c.created_at) <= hours * HOUR);

    const day = statOf(since(24));
    const week = statOf(since(24 * 7));
    const monthCalls = since(24 * 30);
    const { level, reason } = judge(day, week);

    const failures = mine.filter((c) => !c.ok).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    return {
      role,
      label: PROVIDER_LABELS[role],
      level,
      reason,
      day,
      week,
      month: statOf(monthCalls),
      lastFailureAt: failures[0]?.created_at ?? null,
      topErrors: topErrorsOf(monthCalls)
    };
  });
}

/** 有沒有任何一家需要通知。ok 全綠就不寄信——沒事不要吵人。 */
export function needsAlert(health: ProviderHealth[]): boolean {
  return health.some((h) => h.level !== "ok");
}

/** 告警信內容。純文字，因為 sendAdminAlert 只送 text。 */
export function buildHealthAlert(health: ProviderHealth[], now: Date = new Date()) {
  const bad = health.filter((h) => h.level !== "ok");
  const worst = bad.some((h) => h.level === "down") ? "不可用" : "異常偏高";

  const lines = [
    `決策報告的 AI 模型失敗率${worst}。`,
    "",
    "終稿由 OpenAI 產出，所以就算其他家掛掉，報告仍然生得出來——",
    "但會從三家意見變成兩家，而會員看不出任何差別。以下是目前狀況：",
    ""
  ];

  for (const h of bad) {
    lines.push(`■ ${h.label}　[${h.level === "down" ? "疑似不可用" : "注意"}]`);
    lines.push(`  ${h.reason}`);
    lines.push(`  24 小時：${h.day.failures}/${h.day.calls} 次失敗　七日：${h.week.failures}/${h.week.calls}　三十日：${h.month.failures}/${h.month.calls}`);
    if (h.lastFailureAt) lines.push(`  最近一次失敗：${h.lastFailureAt}`);
    for (const e of h.topErrors) lines.push(`  ・${e.error}（${e.count} 次）`);
    lines.push("");
  }

  const fine = health.filter((h) => h.level === "ok");
  if (fine.length) {
    lines.push("其餘正常：" + fine.map((h) => `${h.label}（七日 ${h.week.failures}/${h.week.calls}）`).join("、"));
    lines.push("");
  }

  lines.push("後台明細：https://www.xunfeng.tw/admin/provider-health");
  lines.push(`產生時間：${now.toISOString()}`);

  return {
    subject: `[巽風] 決策報告模型失敗率${worst}：${bad.map((h) => h.label.split("｜")[0]).join("、")}`,
    text: lines.join("\n")
  };
}

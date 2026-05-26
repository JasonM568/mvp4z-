// admin token 用量儀表板的資料聚合 helper。
//
// 資料來源：
//   - council_runs（易學決策報告，每筆含 first_round + debate_round jsonb，
//     每個 entry 有 role + tokensIn + tokensOut。final 部分要 derive：
//     total_tokens_in - sum(first+debate) 即為 final 那次 OpenAI 的 in）
//   - usage_logs（AI 聊天 + 其他 type）。沒記 model，預設算 OpenAI pricing。
//
// 聚合策略：
//   1. 撈最近 N 天 raw rows
//   2. 按 day(YYYY-MM-DD, 台北時區) + provider group by
//   3. 計算 tokens 與成本
//
// 量小情況下（< 10k rows）一次撈完前端聚合即可；大量再考慮 SQL aggregate function。

import {
  COUNCIL_ROLE_TO_MODEL,
  MODEL_PRICING,
  USD_TO_NTD,
  type ModelKey
} from "@/lib/ai/pricing";
import type { SupabaseClient } from "@supabase/supabase-js";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function toTaipeiDate(timestamp: string): string {
  const date = new Date(new Date(timestamp).getTime() + TAIPEI_OFFSET_MS);
  return date.toISOString().slice(0, 10);
}

export interface DailyUsageRow {
  date: string;                    // YYYY-MM-DD (台北)
  council_runs: number;            // 當日 council run 數
  chat_messages: number;           // 當日 chat 訊息數
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_usd: number;
  cost_ntd: number;
  by_model: Record<ModelKey, { tokens_in: number; tokens_out: number; cost_usd: number; cost_ntd: number }>;
}

export interface UsageStats {
  range: { from: string; to: string; days: number };
  daily: DailyUsageRow[];
  totals: {
    council_runs: number;
    chat_messages: number;
    tokens_in: number;
    tokens_out: number;
    tokens_total: number;
    cost_usd: number;
    cost_ntd: number;
    by_model: Record<ModelKey, { tokens_in: number; tokens_out: number; cost_usd: number; cost_ntd: number }>;
  };
}

interface RoundEntry {
  role?: string;
  tokensIn?: number;
  tokensOut?: number;
}

function emptyByModel() {
  return Object.fromEntries(
    (Object.keys(MODEL_PRICING) as ModelKey[]).map((k) => [k, { tokens_in: 0, tokens_out: 0, cost_usd: 0, cost_ntd: 0 }])
  ) as Record<ModelKey, { tokens_in: number; tokens_out: number; cost_usd: number; cost_ntd: number }>;
}

function addTokens(target: { tokens_in: number; tokens_out: number; cost_usd: number; cost_ntd: number }, model: ModelKey, tIn: number, tOut: number) {
  const pricing = MODEL_PRICING[model];
  const usd = (tIn * pricing.inputPerMillion + tOut * pricing.outputPerMillion) / 1_000_000;
  target.tokens_in += tIn;
  target.tokens_out += tOut;
  target.cost_usd += usd;
  target.cost_ntd += usd * USD_TO_NTD;
}

export async function fetchUsageStats(admin: SupabaseClient, days: number): Promise<UsageStats> {
  const clampedDays = Math.max(1, Math.min(days, 365));
  const from = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  const today = toTaipeiDate(new Date().toISOString());

  const [councilResp, chatResp] = await Promise.all([
    admin
      .from("council_runs")
      .select("first_round, debate_round, total_tokens_in, total_tokens_out, generated_at")
      .gte("generated_at", fromIso),
    admin
      .from("usage_logs")
      .select("type, tokens_input, tokens_output, created_at")
      .gte("created_at", fromIso)
      .eq("type", "chat")
  ]);

  if (councilResp.error) throw councilResp.error;
  if (chatResp.error) throw chatResp.error;

  // 建空 daily bucket（連續日期，避免 chart 斷掉）
  const daily = new Map<string, DailyUsageRow>();
  for (let i = 0; i < clampedDays; i++) {
    const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateKey = toTaipeiDate(dt.toISOString());
    if (!daily.has(dateKey)) {
      daily.set(dateKey, {
        date: dateKey,
        council_runs: 0,
        chat_messages: 0,
        tokens_in: 0,
        tokens_out: 0,
        tokens_total: 0,
        cost_usd: 0,
        cost_ntd: 0,
        by_model: emptyByModel()
      });
    }
  }

  // council_runs 處理：每筆要拆 per-round per-role + derive final
  for (const row of (councilResp.data || []) as Array<{
    first_round: RoundEntry[] | null;
    debate_round: RoundEntry[] | null;
    total_tokens_in: number;
    total_tokens_out: number;
    generated_at: string;
  }>) {
    const dateKey = toTaipeiDate(row.generated_at);
    const day = daily.get(dateKey);
    if (!day) continue; // 落在 range 外（理論上 gte 後不會發生）
    day.council_runs += 1;

    let firstDebateIn = 0;
    let firstDebateOut = 0;
    for (const entry of [...(row.first_round || []), ...(row.debate_round || [])]) {
      const model = COUNCIL_ROLE_TO_MODEL[entry.role || ""];
      if (!model) continue;
      const tIn = Number(entry.tokensIn || 0);
      const tOut = Number(entry.tokensOut || 0);
      firstDebateIn += tIn;
      firstDebateOut += tOut;
      addTokens(day.by_model[model], model, tIn, tOut);
    }

    // Final 那次 OpenAI 沒寫進 first/debate，從 total - first+debate derive
    const finalIn = Math.max(0, row.total_tokens_in - firstDebateIn);
    const finalOut = Math.max(0, row.total_tokens_out - firstDebateOut);
    if (finalIn > 0 || finalOut > 0) {
      addTokens(day.by_model.openai, "openai", finalIn, finalOut);
    }
  }

  // usage_logs（chat）處理：預設算 OpenAI pricing
  for (const row of (chatResp.data || []) as Array<{
    tokens_input: number | null;
    tokens_output: number | null;
    created_at: string;
  }>) {
    const dateKey = toTaipeiDate(row.created_at);
    const day = daily.get(dateKey);
    if (!day) continue;
    day.chat_messages += 1;
    const tIn = Number(row.tokens_input || 0);
    const tOut = Number(row.tokens_output || 0);
    addTokens(day.by_model.openai, "openai", tIn, tOut);
  }

  // roll-up day totals from by_model
  for (const day of daily.values()) {
    for (const model of Object.keys(day.by_model) as ModelKey[]) {
      const m = day.by_model[model];
      day.tokens_in += m.tokens_in;
      day.tokens_out += m.tokens_out;
      day.cost_usd += m.cost_usd;
      day.cost_ntd += m.cost_ntd;
    }
    day.tokens_total = day.tokens_in + day.tokens_out;
  }

  // 排序：舊到新（chart x 軸）
  const dailyArr = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));

  // 加總
  const totals = {
    council_runs: 0,
    chat_messages: 0,
    tokens_in: 0,
    tokens_out: 0,
    tokens_total: 0,
    cost_usd: 0,
    cost_ntd: 0,
    by_model: emptyByModel()
  };
  for (const day of dailyArr) {
    totals.council_runs += day.council_runs;
    totals.chat_messages += day.chat_messages;
    totals.tokens_in += day.tokens_in;
    totals.tokens_out += day.tokens_out;
    totals.tokens_total += day.tokens_total;
    totals.cost_usd += day.cost_usd;
    totals.cost_ntd += day.cost_ntd;
    for (const model of Object.keys(day.by_model) as ModelKey[]) {
      const m = day.by_model[model];
      const t = totals.by_model[model];
      t.tokens_in += m.tokens_in;
      t.tokens_out += m.tokens_out;
      t.cost_usd += m.cost_usd;
      t.cost_ntd += m.cost_ntd;
    }
  }

  return {
    range: { from: dailyArr[0]?.date || today, to: today, days: clampedDays },
    daily: dailyArr,
    totals
  };
}

"use client";

// Admin Token 用量儀表板
// /admin/token-usage
//
// 顯示：
//   - KPI：總 tokens、總成本 (NT$)、council 份數、chat 訊息數、平均單份成本
//   - 趨勢圖（_chart.tsx）：每日 tokens 按 model 堆疊 + 成本折線
//   - Per-model 拆解表：tokens / cost / pricing
//   - 每日明細表（最近 N 天，新到舊）

import { useEffect, useState } from "react";
import { adminFetch } from "../_shell";
import {
  MODEL_PRICING,
  USD_TO_NTD,
  formatNtd,
  formatTokens,
  formatUsd,
  type ModelKey
} from "@/lib/ai/pricing";
import { TokenUsageChart } from "./_chart";

type ByModel = { tokens_in: number; tokens_out: number; cost_usd: number; cost_ntd: number };
type DailyRow = {
  date: string;
  council_runs: number;
  chat_messages: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost_usd: number;
  cost_ntd: number;
  by_model: Record<ModelKey, ByModel>;
};
type Stats = {
  range: { from: string; to: string; days: number };
  daily: DailyRow[];
  totals: DailyRow & { by_model: Record<ModelKey, ByModel> };
};

const RANGE_OPTIONS = [
  { label: "近 7 天", value: 7 },
  { label: "近 30 天", value: 30 },
  { label: "近 90 天", value: 90 }
];

export default function TokenUsagePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminFetch(`/api/admin/token-usage?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) {
          setError(d.error);
        } else {
          setStats(d.stats);
        }
      })
      .catch((e) => setError(e?.message || "載入失敗"))
      .finally(() => setLoading(false));
  }, [days]);

  const chartData = (stats?.daily || []).map((d) => ({
    date: d.date,
    openai_tokens: d.by_model.openai.tokens_in + d.by_model.openai.tokens_out,
    gemini_tokens: d.by_model.gemini.tokens_in + d.by_model.gemini.tokens_out,
    deepseek_tokens: d.by_model.deepseek.tokens_in + d.by_model.deepseek.tokens_out,
    cost_ntd: Number(d.cost_ntd.toFixed(2))
  }));

  const avgCouncilCostNtd = stats && stats.totals.council_runs > 0
    ? stats.totals.cost_ntd / stats.totals.council_runs
    : 0;

  return (
    <>
      <h1>Token 用量儀表板</h1>
      <p className="lead">
        統計 council 報告（OpenAI + Gemini + DeepSeek 多模型）與 AI 聊天的 token 用量，
        並依各家 pricing 換算 USD/NTD（匯率 hardcode {USD_TO_NTD}）。
      </p>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#9ec4ad" }}>時間範圍：</span>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`admin-action-btn small ${days === opt.value ? "" : "ghost"}`}
            onClick={() => setDays(opt.value)}
            disabled={loading}
          >
            {opt.label}
          </button>
        ))}
        {stats && (
          <span style={{ fontSize: 12, color: "#9ec4ad", marginLeft: "auto" }}>
            {stats.range.from} ～ {stats.range.to}
          </span>
        )}
      </div>

      {error && <p className="admin-inline-message" style={{ color: "#ff8a8a" }}>{error}</p>}
      {loading && !stats && <p style={{ color: "#9ec4ad" }}>載入中…</p>}

      {stats && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">總成本</div>
              <div className="value">{formatNtd(stats.totals.cost_ntd)}</div>
              <div className="hint">{formatUsd(stats.totals.cost_usd)} USD</div>
            </div>
            <div className="kpi-card">
              <div className="label">總 Token</div>
              <div className="value">{formatTokens(stats.totals.tokens_total)}</div>
              <div className="hint">in {formatTokens(stats.totals.tokens_in)} / out {formatTokens(stats.totals.tokens_out)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">易學報告</div>
              <div className="value">{stats.totals.council_runs}</div>
              <div className="hint">
                平均 {avgCouncilCostNtd > 0 ? formatNtd(avgCouncilCostNtd) : "—"} / 份
              </div>
            </div>
            <div className="kpi-card">
              <div className="label">AI 聊天</div>
              <div className="value">{stats.totals.chat_messages}</div>
              <div className="hint">條訊息</div>
            </div>
          </div>

          <h2 style={{ marginTop: 32 }}>每日趨勢</h2>
          <div style={{ background: "#0a1f15", padding: 16, borderRadius: 8, border: "1px solid #1f3a2a" }}>
            <TokenUsageChart data={chartData} />
          </div>

          <h2 style={{ marginTop: 32 }}>各模型拆解</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>Pricing (USD / 1M)</th>
                  <th>Tokens In</th>
                  <th>Tokens Out</th>
                  <th>Total</th>
                  <th>成本 (USD)</th>
                  <th>成本 (NT$)</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(MODEL_PRICING) as ModelKey[]).map((model) => {
                  const m = stats.totals.by_model[model];
                  const p = MODEL_PRICING[model];
                  return (
                    <tr key={model}>
                      <td>{p.label}</td>
                      <td style={{ fontSize: 12, color: "#9ec4ad" }}>
                        in ${p.inputPerMillion.toFixed(2)} / out ${p.outputPerMillion.toFixed(2)}
                      </td>
                      <td>{m.tokens_in.toLocaleString("en-US")}</td>
                      <td>{m.tokens_out.toLocaleString("en-US")}</td>
                      <td>{(m.tokens_in + m.tokens_out).toLocaleString("en-US")}</td>
                      <td>{formatUsd(m.cost_usd)}</td>
                      <td>{formatNtd(m.cost_ntd)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600 }}>
                  <td colSpan={2}>合計</td>
                  <td>{stats.totals.tokens_in.toLocaleString("en-US")}</td>
                  <td>{stats.totals.tokens_out.toLocaleString("en-US")}</td>
                  <td>{stats.totals.tokens_total.toLocaleString("en-US")}</td>
                  <td>{formatUsd(stats.totals.cost_usd)}</td>
                  <td>{formatNtd(stats.totals.cost_ntd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h2 style={{ marginTop: 32 }}>每日明細</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>易學報告</th>
                  <th>AI 聊天</th>
                  <th>Tokens In</th>
                  <th>Tokens Out</th>
                  <th>Total</th>
                  <th>成本 (NT$)</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.daily].reverse().map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.council_runs || "—"}</td>
                    <td>{d.chat_messages || "—"}</td>
                    <td>{d.tokens_in ? d.tokens_in.toLocaleString("en-US") : "—"}</td>
                    <td>{d.tokens_out ? d.tokens_out.toLocaleString("en-US") : "—"}</td>
                    <td>{d.tokens_total ? d.tokens_total.toLocaleString("en-US") : "—"}</td>
                    <td>{d.cost_ntd ? formatNtd(d.cost_ntd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: "#9ec4ad" }}>
            * Pricing 來源：各家 2026 年初公布價格，定義在 <code>lib/ai/pricing.ts</code>，
            匯率 USD = NT$ {USD_TO_NTD} hardcode。改價直接改該檔再 commit。
          </p>
        </>
      )}
    </>
  );
}

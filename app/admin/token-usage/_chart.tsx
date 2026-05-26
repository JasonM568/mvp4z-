"use client";

// Token 用量趨勢圖：30 天每日 token 量 + 成本（NT$）
// 用 Recharts 組合圖：左 Y 軸 token 數（柱狀按 model 分色），右 Y 軸 NT$（折線）。

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { MODEL_PRICING, type ModelKey } from "@/lib/ai/pricing";

interface DailyPoint {
  date: string;
  openai_tokens: number;
  gemini_tokens: number;
  deepseek_tokens: number;
  cost_ntd: number;
}

const MODEL_COLOR: Record<ModelKey, string> = {
  openai: "#6ff0b4",    // 巽風薄荷綠
  gemini: "#d2a954",    // 暖金
  deepseek: "#7fb1ff"   // 補色：淺藍
};

export function TokenUsageChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f3a2a" />
        <XAxis dataKey="date" stroke="#9ec4ad" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis
          yAxisId="tokens"
          stroke="#9ec4ad"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          label={{ value: "Tokens", angle: -90, position: "insideLeft", fill: "#9ec4ad", fontSize: 12 }}
        />
        <YAxis
          yAxisId="cost"
          orientation="right"
          stroke="#d2a954"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `NT$${v.toFixed(0)}`}
          label={{ value: "成本 (NT$)", angle: 90, position: "insideRight", fill: "#d2a954", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{ background: "#04120d", border: "1px solid #1f3a2a", color: "#fff8ec" }}
          formatter={(value, _name, item) => {
            const n = Number(value || 0);
            if (item?.dataKey === "cost_ntd") return [`NT$ ${n.toFixed(2)}`, "當日成本"];
            return [n.toLocaleString("en-US"), String(item?.name || "")];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#9ec4ad" }} />
        <Bar yAxisId="tokens" dataKey="openai_tokens" stackId="t" fill={MODEL_COLOR.openai} name={MODEL_PRICING.openai.label} />
        <Bar yAxisId="tokens" dataKey="gemini_tokens" stackId="t" fill={MODEL_COLOR.gemini} name={MODEL_PRICING.gemini.label} />
        <Bar yAxisId="tokens" dataKey="deepseek_tokens" stackId="t" fill={MODEL_COLOR.deepseek} name={MODEL_PRICING.deepseek.label} />
        <Line yAxisId="cost" type="monotone" dataKey="cost_ntd" stroke="#d2a954" strokeWidth={2} dot={{ r: 3, fill: "#d2a954" }} name="每日成本 NT$" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

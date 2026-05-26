// 三家 LLM provider 的 pricing 常數與 cost 計算 helper。
//
// 用於 admin token 用量儀表板（/admin/token-usage）顯示成本。
// Pricing 來源：各家 2026 年初公布的價格表。
// **改價時直接改本檔常數**（沒讀 env var，要 commit）。
// **匯率 hardcode USD=NT$30**，要改也要 commit（避免動到的人需要 review）。
//
// 注意：council_runs.first_round/debate_round 內的 role 用於 mapping 到 provider；
// usage_logs 沒記 provider/model（type='chat' 預設打 OpenAI），這邊 default 用
// OpenAI pricing。若未來 chat 改成多 provider，要在 usage_logs 加欄位再來這對齊。

export const USD_TO_NTD = 30;

// USD per 1M tokens
export interface ModelPricing {
  label: string;
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING = {
  openai: {
    label: "OpenAI gpt-4.1-mini",
    inputPerMillion: 0.4,
    outputPerMillion: 1.6
  },
  gemini: {
    label: "Gemini 2.5 Flash",
    inputPerMillion: 0.3,
    outputPerMillion: 2.5
  },
  deepseek: {
    label: "DeepSeek Chat",
    inputPerMillion: 0.27,
    outputPerMillion: 1.1
  }
} as const satisfies Record<string, ModelPricing>;

export type ModelKey = keyof typeof MODEL_PRICING;

// council role → provider mapping（對應 lib/ai/council/providers.ts CouncilRole）
export const COUNCIL_ROLE_TO_MODEL: Record<string, ModelKey> = {
  openaiFengYi: "openai",
  finalChatGPT: "openai",
  geminiFengYi: "gemini",
  deepseekAttack: "deepseek"
};

export interface TokenCost {
  usd: number;
  ntd: number;
}

export function calcCost(model: ModelKey, tokensIn: number, tokensOut: number): TokenCost {
  const pricing = MODEL_PRICING[model];
  const usd = (tokensIn * pricing.inputPerMillion + tokensOut * pricing.outputPerMillion) / 1_000_000;
  return { usd, ntd: usd * USD_TO_NTD };
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function formatNtd(ntd: number): string {
  // < 1 元顯示小數兩位、≥ 1 元顯示整數（千分位）
  if (ntd < 1) return `NT$ ${ntd.toFixed(2)}`;
  return `NT$ ${Math.round(ntd).toLocaleString("zh-TW")}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString("en-US");
}

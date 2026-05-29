// 巽風 council 多模型呼叫封裝
// 三個 provider 都用裸 fetch 統一錯誤處理，每次呼叫附 60s timeout
// 回傳值包含 tokens 計數，供 usage_logs / council_runs 統計成本

export type CouncilRole = "openaiFengYi" | "geminiFengYi" | "deepseekAttack" | "finalChatGPT";

export type ModelResult = {
  role: CouncilRole;
  label: string;
  ok: boolean;
  text: string;
  error?: string;
  tokensIn: number;
  tokensOut: number;
};

// 回合分身：單次 45s + 最多 2 次嘗試（暫時性失敗重試）。
// 終稿不同：prompt 最重（要讀完前兩輪上萬字再生成長報告），需要「一次連續的長時間」，
// 重試救不了「慢但正常」的呼叫，所以終稿改由 route 傳 { timeoutMs: 110000, attempts: 1 }。
// 最壞：R1(45×2=90) + R2(45×2=90) + 終稿(110×1) = 290s，仍在 route maxDuration=300s 內。
const PROVIDER_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 2;

export type CallOptions = { timeoutMs?: number; attempts?: number };

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

// 逾時／限流／5xx／網路中斷這類暫時性失敗再試一次；金鑰未設定不重試（重試也沒用）。
async function withRetry(attempts: number, fn: () => Promise<ModelResult>): Promise<ModelResult> {
  let last: ModelResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await fn();
    if (result.ok) return result;
    last = result;
    if ((result.error || "").includes("未設定")) break;
  }
  return last as ModelResult;
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function emptyResult(role: CouncilRole, label: string, error: string): ModelResult {
  return { role, label, ok: false, text: "", error, tokensIn: 0, tokensOut: 0 };
}

export function callOpenAI(role: CouncilRole, label: string, system: string, prompt: string, opts: CallOptions = {}): Promise<ModelResult> {
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const attempts = opts.attempts ?? MAX_ATTEMPTS;
  return withRetry(attempts, () => callOpenAIOnce(role, label, system, prompt, timeoutMs));
}

async function callOpenAIOnce(role: CouncilRole, label: string, system: string, prompt: string, timeoutMs: number): Promise<ModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!apiKey) return emptyResult(role, label, "OPENAI_API_KEY 未設定");

  const timer = timeoutSignal(timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      }),
      signal: timer.signal
    });
    const data = await safeJson(res);
    if (!res.ok) {
      return emptyResult(role, label, data?.error?.message || `OpenAI 系統狀態：${res.status}`);
    }
    return {
      role,
      label,
      ok: true,
      text: data?.choices?.[0]?.message?.content || "無內容回傳",
      tokensIn: Number(data?.usage?.prompt_tokens || 0),
      tokensOut: Number(data?.usage?.completion_tokens || 0)
    };
  } catch (error: any) {
    return emptyResult(role, label, error?.name === "AbortError" ? "OpenAI 系統回應逾時" : error?.message || "OpenAI 系統狀態");
  } finally {
    timer.clear();
  }
}

export function callGemini(role: CouncilRole, label: string, system: string, prompt: string, opts: CallOptions = {}): Promise<ModelResult> {
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const attempts = opts.attempts ?? MAX_ATTEMPTS;
  return withRetry(attempts, () => callGeminiOnce(role, label, system, prompt, timeoutMs));
}

async function callGeminiOnce(role: CouncilRole, label: string, system: string, prompt: string, timeoutMs: number): Promise<ModelResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) return emptyResult(role, label, "GEMINI_API_KEY 未設定");

  const timer = timeoutSignal(timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          // gemini-2.5-flash 預設開啟 thinking，會多花 10~40s 容易頂到 timeout。
          // 本系統要的是穩定的判讀文字、不需要長思考，thinkingBudget=0 直接關閉。
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 8192
        }
      }),
      signal: timer.signal
    });
    const data = await safeJson(res);
    if (!res.ok) {
      return emptyResult(role, label, data?.error?.message || `Gemini 系統狀態：${res.status}`);
    }
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join("\n") || "無內容回傳";
    return {
      role,
      label,
      ok: true,
      text,
      tokensIn: Number(data?.usageMetadata?.promptTokenCount || 0),
      tokensOut: Number(data?.usageMetadata?.candidatesTokenCount || 0)
    };
  } catch (error: any) {
    return emptyResult(role, label, error?.name === "AbortError" ? "Gemini 系統回應逾時" : error?.message || "Gemini 系統狀態");
  } finally {
    timer.clear();
  }
}

export function callDeepSeek(role: CouncilRole, label: string, system: string, prompt: string, opts: CallOptions = {}): Promise<ModelResult> {
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const attempts = opts.attempts ?? MAX_ATTEMPTS;
  return withRetry(attempts, () => callDeepSeekOnce(role, label, system, prompt, timeoutMs));
}

async function callDeepSeekOnce(role: CouncilRole, label: string, system: string, prompt: string, timeoutMs: number): Promise<ModelResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) return emptyResult(role, label, "DEEPSEEK_API_KEY 未設定");

  const timer = timeoutSignal(timeoutMs);
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      }),
      signal: timer.signal
    });
    const data = await safeJson(res);
    if (!res.ok) {
      return emptyResult(role, label, data?.error?.message || `DeepSeek 系統狀態：${res.status}`);
    }
    return {
      role,
      label,
      ok: true,
      text: data?.choices?.[0]?.message?.content || "無內容回傳",
      tokensIn: Number(data?.usage?.prompt_tokens || 0),
      tokensOut: Number(data?.usage?.completion_tokens || 0)
    };
  } catch (error: any) {
    return emptyResult(role, label, error?.name === "AbortError" ? "DeepSeek 系統回應逾時" : error?.message || "DeepSeek 系統狀態");
  } finally {
    timer.clear();
  }
}

// 失敗分身改放中性註記：避免「校核未完成／逾時」被餵進終稿 prompt，
// 害終稿模型把單一分身缺席誤寫成「資料不足」。終稿改以其餘分身整合即可。
const ROUND_SKIP_NOTE =
  "（本分身本輪未提供補充意見，請以其他分身的判讀為主進行整合，不需在正式報告中特別說明此分身缺漏。）";

export function stringifyRound(title: string, results: ModelResult[]) {
  return `\n\n## ${title}\n` + results.map((r) => `\n### ${r.label}\n${r.ok ? r.text : ROUND_SKIP_NOTE}`).join("\n");
}

export function sumTokens(results: ModelResult[]) {
  return results.reduce(
    (acc, r) => {
      acc.in += r.tokensIn || 0;
      acc.out += r.tokensOut || 0;
      return acc;
    },
    { in: 0, out: 0 }
  );
}

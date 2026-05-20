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

const PROVIDER_TIMEOUT_MS = 60000;

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
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

export async function callOpenAI(role: CouncilRole, label: string, system: string, prompt: string): Promise<ModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!apiKey) return emptyResult(role, label, "OPENAI_API_KEY 未設定");

  const timer = timeoutSignal(PROVIDER_TIMEOUT_MS);
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

export async function callGemini(role: CouncilRole, label: string, system: string, prompt: string): Promise<ModelResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) return emptyResult(role, label, "GEMINI_API_KEY 未設定");

  const timer = timeoutSignal(PROVIDER_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35 }
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

export async function callDeepSeek(role: CouncilRole, label: string, system: string, prompt: string): Promise<ModelResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) return emptyResult(role, label, "DEEPSEEK_API_KEY 未設定");

  const timer = timeoutSignal(PROVIDER_TIMEOUT_MS);
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

export function stringifyRound(title: string, results: ModelResult[]) {
  return `\n\n## ${title}\n` + results.map((r) => `\n### ${r.label}\n${r.ok ? r.text : `校核未完成：${r.error}`}`).join("\n");
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

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
  /**
   * 上游回的 HTTP status。逾時與網路中斷沒有 status，留 null。
   *
   * 沒有這個欄位就無法區分「該退避重試」與「重試也沒用」——
   * 只看錯誤訊息字串會在上游改字時整個失效。
   */
  status?: number | null;
  /** 實際嘗試了幾次。用來看退避有沒有在作用，也進 council_runs 供事後追。 */
  attempts?: number;
  tokensIn: number;
  tokensOut: number;
};

// 回合分身：單次 45s。
// 終稿不同：prompt 最重（要讀完前兩輪上萬字再生成長報告），需要「一次連續的長時間」，
// 重試救不了「慢但正常」的呼叫，所以終稿改由 route 傳 { timeoutMs: 110000, attempts: 1 }。
const PROVIDER_TIMEOUT_MS = 45000;

// 嘗試次數是上限，真正的約束是預算（見 withRetry）。
// 從 2 提高到 4 是為了 Gemini 的「high demand」：那種錯誤是秒回的，
// 四次帶退避的嘗試總共只花約 18 秒，遠在單輪預算內；而逾時路徑受預算所限
// 仍然只會跑兩次，所以最壞情況沒有變。
const MAX_ATTEMPTS = 4;

// 退避：1.5s → 3s → 6s，上限 8s，帶 ±25% jitter。
// 不是越久越好——預算就那麼多，睡太久等於把重試的機會睡掉。
const RETRY_BASE_DELAY_MS = 1500;
const RETRY_MAX_DELAY_MS = 8000;

export type CallOptions = {
  timeoutMs?: number;
  attempts?: number;
  /**
   * 這一次呼叫（含所有重試與退避）的總時間上限。
   * 預設 attempts × timeoutMs 是刻意的：**沿用改版前的最壞情況**，
   * 退避只吃「快速失敗」省下來的時間，不會讓整份報告更接近 maxDuration。
   */
  budgetMs?: number;
};

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

/**
 * 這個失敗值不值得再試一次。
 *
 * 判斷依據是 HTTP status 而不是錯誤訊息字串——上游隨時會改寫文案，
 * 依賴字串的分類會在某天上游換句話說時靜默失效。
 *
 * 重試：429（限流）、5xx（上游壞掉或壅塞，含 Gemini 的 high demand）、
 *       沒有 status（逾時、網路中斷）
 * 不重試：400／401／403 這類請求本身有問題的，以及金鑰未設定——再打一百次也一樣。
 */
export function isRetryableFailure(result: ModelResult): boolean {
  if ((result.error || "").includes("未設定")) return false;
  const status = result.status;
  if (status === null || status === undefined) return true;
  if (status === 429) return true;
  return status >= 500;
}

/** 第 n 次失敗後要等多久。指數退避加 jitter，避免多個 provider 同步重試。 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  const jitter = 1 + (random() - 0.5) * 0.5; // ±25%
  return Math.round(base * jitter);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 帶退避的重試，且**受總預算約束**。
 *
 * 為什麼要有預算：一份報告最壞是 R1 + R2 + 終稿 = 290s，而 route 的 maxDuration
 * 是 300s，只剩 10 秒餘裕。無條件加 sleep 會讓報告整個逾時——那不是改善，是換一種壞法。
 *
 * 可行的原因是「high demand」這類壅塞錯誤是**秒回**的，不是逾時。第一次 2 秒就失敗，
 * 該輪就還剩 43 秒可以拿來退避與重試。所以睡之前一律先算得下去才睡。
 *
 * 兩個門檻分開判斷是刻意的：
 * - 連「再跑一次完整嘗試」的時間都沒有 → 直接放棄，不做注定被砍斷的呼叫
 * - 有時間跑但塞不下退避（例如前一次就是跑滿 45 秒的逾時）→ 不睡，直接重試
 *   這一條保留了改版前逾時會重試一次的行為，最壞情況因此完全沒變。
 */
export type RetryDeps = {
  /** 現在幾點。注入是為了能測預算邊界，不必真的等 45 秒。 */
  now?: () => number;
  /** 睡多久。注入後測試能斷言「睡了幾次、各睡多久」，而不是只能看它有沒有變慢。 */
  sleepFn?: (ms: number) => Promise<void>;
};

export async function withRetry(
  attempts: number,
  timeoutMs: number,
  budgetMs: number,
  fn: () => Promise<ModelResult>,
  deps: RetryDeps = {}
): Promise<ModelResult> {
  const now = deps.now ?? Date.now;
  const doSleep = deps.sleepFn ?? sleep;
  const started = now();
  let last: ModelResult | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await fn();
    if (result.ok) return { ...result, attempts: attempt };
    last = { ...result, attempts: attempt };

    if (attempt === attempts) break;
    if (!isRetryableFailure(result)) break;

    const elapsed = now() - started;
    const backoff = backoffDelayMs(attempt);
    // 連再跑一次完整嘗試的時間都沒有 → 放棄，不做注定被砍斷的呼叫。
    if (elapsed + timeoutMs > budgetMs) break;
    // 跑得下但塞不下退避（例如前一次就是跑滿的逾時）→ 不睡，直接重試。
    // 這一條保留了改版前「逾時會再試一次」的行為，最壞情況因此完全沒變。
    if (elapsed + backoff + timeoutMs <= budgetMs) await doSleep(backoff);
  }

  return last as ModelResult;
}

/** 三家 provider 共用的呼叫外殼：把 options 解出來，套上預算與重試。 */
function callWithRetry(
  opts: CallOptions,
  once: (timeoutMs: number) => Promise<ModelResult>
): Promise<ModelResult> {
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const attempts = opts.attempts ?? MAX_ATTEMPTS;
  const budgetMs = opts.budgetMs ?? timeoutMs * (opts.attempts ?? 2);
  return withRetry(attempts, timeoutMs, budgetMs, () => once(timeoutMs));
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// status 預設 null＝「沒有 HTTP 回應」（逾時、網路中斷、金鑰未設定），
// 這個預設值本身就是重試分類的一部分，不要隨手改成 0。
function emptyResult(role: CouncilRole, label: string, error: string, status: number | null = null): ModelResult {
  return { role, label, ok: false, text: "", error, status, tokensIn: 0, tokensOut: 0 };
}

export function callOpenAI(role: CouncilRole, label: string, system: string, prompt: string, opts: CallOptions = {}): Promise<ModelResult> {
  return callWithRetry(opts, (timeoutMs) => callOpenAIOnce(role, label, system, prompt, timeoutMs));
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
      return emptyResult(role, label, data?.error?.message || `OpenAI 系統狀態：${res.status}`, res.status);
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
  return callWithRetry(opts, (timeoutMs) => callGeminiOnce(role, label, system, prompt, timeoutMs));
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
      return emptyResult(role, label, data?.error?.message || `Gemini 系統狀態：${res.status}`, res.status);
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
  return callWithRetry(opts, (timeoutMs) => callDeepSeekOnce(role, label, system, prompt, timeoutMs));
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
      return emptyResult(role, label, data?.error?.message || `DeepSeek 系統狀態：${res.status}`, res.status);
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

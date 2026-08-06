// 巽風 council 結構化輸出契約（四象儀表板資料來源）
// 終稿 LLM 在「專業聲明」後以定界符附一份機讀 JSON，route.ts 先切出此區塊再洗正文，
// JSON 不得經過 cleanReportText（會洗壞 key），字串欄位另行逐一清洗。
// 解析失敗一律回 null：前端降級顯示純文字報告，絕不影響扣點與報告交付。

import { z } from "zod";
import { YixuePayload } from "@/lib/ai/council/personas";
import { cleanReportText } from "@/lib/ai/council/quality";

export const STRUCT_OPEN = "<<<XF_STRUCT>>>";
export const STRUCT_CLOSE = "<<<END_XF_STRUCT>>>";

export type AspectKey = "bazi" | "qimen" | "liuyao" | "meihua";

const DECISIONS = ["可進", "可試行", "暫緩", "不建議", "補資料後再判"] as const;
const SIGNALS = ["green", "yellow", "red"] as const;

// 寬容數值：接受 "87%"、87.4 之類輸入，取整並夾在 0-100；解析不出來就是 undefined
function toPercent(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : parseFloat(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const percentSchema = z.preprocess(toPercent, z.number());

const decisionSchema = z.preprocess(
  (v) => (DECISIONS.includes(String(v ?? "").trim() as (typeof DECISIONS)[number]) ? String(v).trim() : undefined),
  z.enum(DECISIONS).optional()
);

const signalSchema = z.preprocess(
  (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    return SIGNALS.includes(s as (typeof SIGNALS)[number]) ? s : undefined;
  },
  z.enum(SIGNALS).optional()
);

export const councilStructuredSchema = z.object({
  headline: z.string().trim().min(4).max(120),
  decision: decisionSchema,
  resonance: percentSchema,
  aspects: z
    .array(
      z.object({
        key: z.enum(["bazi", "qimen", "liuyao", "meihua"]),
        summary: z.string().trim().min(2).max(120),
        confidence: percentSchema,
        signal: signalSchema,
        timing: z.string().trim().max(80).optional()
      })
    )
    .min(1)
    .max(4),
  steps: z.array(z.string().trim().min(2).max(80)).min(1).max(3)
});

export type CouncilStructured = z.infer<typeof councilStructuredSchema>;

// 與 enabledTermNames 同步的 key 版本（含全空保底八字）
export function enabledAspectKeys(modules?: YixuePayload["modules"]): AspectKey[] {
  const m = modules || {};
  const keys: AspectKey[] = [];
  if (m.bazi) keys.push("bazi");
  if (m.qimen) keys.push("qimen");
  if (m.liuyao) keys.push("liuyao");
  if (m.meihua) keys.push("meihua");
  return keys.length ? keys : ["bazi"];
}

const TERM_KEY_TABLE = "八字命理=bazi、奇門遁甲=qimen、卜卦／六爻=liuyao、梅花易數=meihua";

export function buildStructuredPrompt(modules?: YixuePayload["modules"]): string {
  const keys = enabledAspectKeys(modules);
  return `
機讀資料區塊要求（此為格式規則的唯一例外）：
正式報告「專業聲明」段落結束後，請另起一行，輸出以下機讀資料區塊。
此區塊不算報告段落、不受「禁止 Markdown 與符號」規則限制，區塊內必須是合法 JSON，格式如下：

${STRUCT_OPEN}
{"headline":"一句話順轉結論","decision":"可試行","resonance":87,"aspects":[{"key":"${keys[0]}","summary":"該術數一句話總結","confidence":80,"signal":"green","timing":"三個月後"}],"steps":["行動一","行動二","行動三"]}
${STRUCT_CLOSE}

機讀區塊規則：
1. headline：本案順轉結論一句話，40 字內，必須具體可執行，且與正文最終建議一致。
2. decision：只能是「可進、可試行、暫緩、不建議、補資料後再判」其中之一，須與個案總論一致。
3. resonance：0 到 100 的整數，代表本次啟用術數結論的一致程度（共鳴度），須與交叉驗證段落一致；只啟用一個術數時代表該術數判讀的整體確信度。
4. aspects：只能包含本次啟用術數，key 只允許：${keys.join("、")}。對照表：${TERM_KEY_TABLE}。
   每項包含：summary（該術數一句話總結，40 字內）、confidence（0 到 100 整數，可判斷程度）、
   signal（吉凶信號，只能是 green、yellow、red；卜卦／六爻必填，其他術數可省略）、
   timing（時間窗或應期提示，20 字內，沒有就省略此欄位）。
5. steps：1 到 3 條立即可執行的行動，每條 30 字內，對應正文 3 日內行動方案。
6. 區塊內不得有註解、不得改用其他定界符、不得出現未啟用術數、定界符前後不得再有其他文字。
`.trim();
}

// 從終稿原文切出正文與機讀區塊。用 lastIndexOf 防模型把定界符寫進正文中段。
export function extractStructuredBlock(raw: string): {
  reportText: string;
  structuredRaw: string | null;
} {
  const text = raw || "";
  const start = text.lastIndexOf(STRUCT_OPEN);
  if (start === -1) {
    return { reportText: stripDelimiters(text).trim(), structuredRaw: null };
  }
  const afterOpen = start + STRUCT_OPEN.length;
  const end = text.indexOf(STRUCT_CLOSE, afterOpen);
  const structuredRaw = (end === -1 ? text.slice(afterOpen) : text.slice(afterOpen, end)).trim();
  const reportText = stripDelimiters(text.slice(0, start)).trim();
  return { reportText, structuredRaw: structuredRaw || null };
}

function stripDelimiters(text: string) {
  return text.split(STRUCT_OPEN).join("").split(STRUCT_CLOSE).join("");
}

// 解析 + 清洗 + 過濾成只留啟用術數。任何失敗回 null，絕不 throw。
export function parseStructured(
  raw: string | null,
  modules?: YixuePayload["modules"]
): CouncilStructured | null {
  if (!raw) return null;
  try {
    const jsonText = sliceJsonObject(raw);
    if (!jsonText) return null;
    const result = councilStructuredSchema.safeParse(JSON.parse(jsonText));
    if (!result.success) return null;

    const allowed = new Set(enabledAspectKeys(modules));
    const seen = new Set<AspectKey>();
    const aspects = result.data.aspects.filter((a) => {
      if (!allowed.has(a.key) || seen.has(a.key)) return false;
      seen.add(a.key);
      return true;
    });
    if (!aspects.length) return null;

    return {
      headline: cleanShortText(result.data.headline),
      decision: result.data.decision,
      resonance: result.data.resonance,
      aspects: aspects.map((a) => ({
        ...a,
        summary: cleanShortText(a.summary),
        timing: a.timing ? cleanShortText(a.timing) : undefined
      })),
      steps: result.data.steps.map(cleanShortText).filter(Boolean)
    };
  } catch {
    return null;
  }
}

// 模型偶爾會在 JSON 前後多話，取第一個 { 到最後一個 } 之間
function sliceJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

// 短字串沿用品牌清洗（防模型名／技術字眼洩漏），再壓掉換行
function cleanShortText(text: string): string {
  return cleanReportText(text).replace(/\s+/g, " ").trim();
}

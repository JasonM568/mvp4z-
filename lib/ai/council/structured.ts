// 巽風 council 結構化輸出契約（四象儀表板資料來源）
// 終稿 LLM 在「專業聲明」後以定界符附一份機讀 JSON，route.ts 先切出此區塊再洗正文，
// JSON 不得經過 cleanReportText（會洗壞 key），字串欄位另行逐一清洗。
// 解析失敗一律回 null：前端降級顯示純文字報告，絕不影響扣點與報告交付。

import { z } from "zod";
import { YixuePayload } from "@/lib/ai/council/personas";
import { cleanReportText } from "@/lib/ai/council/quality";
import { computeResonance, type ResonanceBasis, type ResonanceInput } from "@/lib/ai/council/resonance";

export const STRUCT_OPEN = "<<<XF_STRUCT>>>";
export const STRUCT_CLOSE = "<<<END_XF_STRUCT>>>";

export type AspectKey = "bazi" | "qimen" | "liuyao" | "meihua";

// 決策型態依風羿老師《四象問天機｜綜合判讀與回應規則》第十一節的七種收斂型態。
// 2026-09-05 從五種擴成七種：原本沒有「借力」與「調整策略」這兩條路，
// 而老師的規則明說盤面顯示「自己力量不足、第三方有力」時要指出借力，
// 只給可進／暫緩會逼模型把這種局硬歸到別的型態。
const DECISIONS = [
  "可直接推進",
  "有條件可成",
  "宜借力推進",
  "宜等待時機",
  "宜調整策略後再進",
  "宜暫時停止",
  "補資料後再判"
] as const;

// 舊詞對照。用途有二：
// 1. 資料庫裡 40 份舊報告的 structured.decision 存的是舊詞，讀出來仍要能對到顏色。
// 2. 模型有時會沿用舊詞（訓練資料或前文殘留），與其判為 undefined 不如正規化。
// 「資料不足，補資料後再判」在老師文件裡帶逗號，這裡沿用既有的「補資料後再判」當值，
// 語意相同、可當徽章文字，也讓舊資料不必轉檔。
const LEGACY_DECISIONS: Record<string, (typeof DECISIONS)[number]> = {
  可進: "可直接推進",
  可試行: "有條件可成",
  暫緩: "宜等待時機",
  不建議: "宜暫時停止",
  不可進: "宜暫時停止",
  "資料不足，補資料後再判": "補資料後再判"
};

/** 把任意輸入正規化成七種決策型態之一；對不上回 null。前端徽章與解析共用。 */
export function normalizeDecision(value: unknown): (typeof DECISIONS)[number] | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (DECISIONS.includes(text as (typeof DECISIONS)[number])) {
    return text as (typeof DECISIONS)[number];
  }
  return LEGACY_DECISIONS[text] ?? null;
}

export const DECISION_TYPES = DECISIONS;
export type CouncilDecision = (typeof DECISIONS)[number];

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
  (v) => normalizeDecision(v) ?? undefined,
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
  // 模型仍可能因訓練慣性寫出 resonance，收下但一律忽略——
  // 共鳴度改由 computeResonance() 依真實資料算，見 resonance.ts 的說明。
  resonance: percentSchema.optional(),
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

type ParsedStructured = z.infer<typeof councilStructuredSchema>;

export type CouncilStructured = Omit<ParsedStructured, "resonance"> & {
  /** 由 computeResonance() 算出，恆為 60–90 的整數。 */
  resonance: number;
  /** 分數怎麼來的。前端會顯示，讓這個數字可被檢查。 */
  resonanceBasis?: ResonanceBasis;
};

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
{"headline":"一句話順轉結論","decision":"有條件可成","aspects":[{"key":"${keys[0]}","summary":"該術數一句話總結","confidence":80,"signal":"green","timing":"三個月後"}],"steps":["行動一","行動二","行動三"]}
${STRUCT_CLOSE}

機讀區塊規則：
1. headline：本案順轉結論一句話，40 字內，必須具體可執行，且與正文最終建議一致。
2. decision：只能是「${DECISIONS.join("、")}」其中之一，須與個案總論一致。
   判為「有條件可成」要在正文說清楚條件；判為「宜借力推進」要在正文指出應借何種力量
   （權責人物、專業人士、中介者、合作者、制度、文件證據、資金資源）；
   判為「宜等待時機」要交代在等什麼訊號，不得無期限等待。
3. 不要輸出 resonance 或任何整體分數欄位。共鳴度由系統依各術信號的一致度、
   確信度、排盤完整度與排盤覆蓋率計算，模型自填的分數一律被忽略。
4. aspects：只能包含本次啟用術數，key 只允許：${keys.join("、")}。對照表：${TERM_KEY_TABLE}。
   每項包含：summary（該術數一句話總結，40 字內）、confidence（0 到 100 整數，可判斷程度）、
   signal（吉凶信號，只能是 green、yellow、red）、
   timing（時間窗或應期提示，20 字內，沒有就省略此欄位）。
   confidence 與 signal 是整體共鳴度的計算輸入，請依該術盤面實際可判讀的程度誠實給值，
   盤面不清、資料不足就給低分，不要為了好看一律給高分。signal 每一術都要給。
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
/**
 * 解析終稿的機讀區塊。
 *
 * resonanceContext 是必填的：共鳴度必須由程式算，把它做成參數而不是事後補，
 * 就沒有「忘記計算導致前端拿到 0 分」的可能。
 */
export function parseStructured(
  raw: string | null,
  modules: YixuePayload["modules"] | undefined,
  resonanceContext: Omit<ResonanceInput, "aspects">
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

    const resonance = computeResonance({
      ...resonanceContext,
      aspects: aspects.map((a) => ({ signal: a.signal, confidence: a.confidence }))
    });

    return {
      headline: cleanShortText(result.data.headline),
      decision: result.data.decision,
      resonance: resonance.value,
      resonanceBasis: resonance.basis,
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

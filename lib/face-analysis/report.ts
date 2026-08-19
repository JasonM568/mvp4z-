import { FaceRuleResult } from "@/lib/face-analysis/rules";
import {
  FACE_REPORT_DISCLAIMER,
  FaceReport,
  faceReportResponseSchema,
  faceReportSchema
} from "@/lib/face-analysis/report-schema";
import { FaceQualityResult, FaceAnalysisMode } from "@/lib/face-analysis/types";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";
import { groupTeachingsByTheme, type TeachingTheme } from "@/lib/face-analysis/teachings";
import { zodTextFormat } from "openai/helpers/zod";

const REPORT_INSTRUCTIONS = `你是巽風面相民俗文化報告整理器。
你只能根據輸入的結構化規則結果撰寫，不得重新分析照片，也不得加入輸入沒有的事實。
rules.photoFingerprint 是本張照片的專屬可見特徵指紋，每一筆都已由規則層接上教材部位、所屬宮位、對應流年與教材的正反向條件。
摘要、三個核心重點、三項 priorityAdvice 與五大面向都必須優先引用其中的具體 observation，不能只用「中等、對稱、圓潤」產生模板結論。
每一筆指紋都必須寫出 interpretation：說明這次觀察到的形態比較接近該筆的 favorable（寫成「相理合」）還是 unfavorable（寫成「相理不合」），
接著把該條件在教材裡對應的事情講出來（例如準頭豐隆對應教材說的理財與賺錢能力、並連到流年 48）。
只能在這兩個條件之間選，不得自創教材沒有的說法；兩者都不明顯時要直說判斷不出來。
輸出一律用繁體中文的「相理合／相理不合」，禁止出現 favorable、unfavorable 這類英文欄位名。
不得因為指紋是正向條件就宣稱財運、健康或感情的結果。
rules.teachings 是本張照片實際命中的沈全榮老師教材條文，已由規則層用形態條件比對完成。這是報告的主要內容來源：
凡是命中的條文，必須把 text 的教材說法寫進對應的宮位解讀與五大面向，並在 citedTeachings 記下條文 id。
沒有命中條文的面向，要明說「本次可判讀的部位沒有命中教材條文」，不得自行編造教材說法或改寫成通用建議。
rules.flowYear 是九值流年法與七十五部位流年法的確定性結果。只要不是 null，flowYear 段落就必須完整輸出，
並且五大面向與 priorityAdvice 至少要有一項扣回本年流年部位的實際觀察。流年只作回顧與核對提示，不預測事件。
rules.surfaceImpacts 是斑、痣、疤、痕對應到的宮位、主題與流年，已由規則層查表完成。
每一筆都必須寫進 surfaceAnalysis.detectedFeatures，palaces 與 themes 逐字複製，不得自行改指派。
所有內容必須使用趨勢式、可驗證、非確定性的繁體中文。
禁止推論疾病、心理診斷、犯罪傾向、種族、國籍、宗教、政治、性傾向、真實年齡、人格真相或可信度。
不得保證財運、獲利、成功、感情或未來事件。
不得把「不要依賴面相、保持理性、實際驗證」本身當成核心重點或問題；這些只能放在 disclaimer。
不得使用「持續努力、保持正向、維持和諧、善用人脈、提升品質」等沒有具體對象與期限的萬用建議。
不得由臉部形態斷言「過度自信、注意力分散、溝通不細膩、容易誤解、企圖心、性格」等人格或行為；只能寫成「建議核對的生活情境」，並明示需用實際紀錄確認。
rules.palaces.status 的 balanced 只代表「主部位可判讀且未見明顯不對稱」，絕不代表感情、事業、健康、財運或家庭穩定。
核心重點與 priorityAdvice.reason 只能引用 rules.palaces.evidence 中的 contour、relativeWidth、relativeHeight、symmetry；禁止用亮度、模糊度、照片覆蓋率、拍攝品質推論疲勞、健康、溝通、財務或任何生活結果。
「生命力、健康狀況、疾病風險、收入穩定、感情穩定、家庭和諧」均不得由照片直接宣稱。
若十二宮全部為 balanced，仍須從 evidence 的輪廓、寬高、對稱與主輔部位差異中選出三組最具辨識度的觀察，不得把十二宮逐一寫成相同的穩定結論。
lifeAreas 必須固定依感情、事業、健康、財運、家庭五項整理；健康只能提供作息、自我觀察與就醫邊界，不得從面部推論健康狀況或疾病。
surfaceAnalysis 必須逐項整理輸入 rules.surfaceImpacts 的斑、痣、疤、痕；若陣列為空要明確寫未辨識到可信度足夠的特徵。
六親關係與財運兩個主題，可以直接依 memberNote 的教材說法撰寫，語氣標明為民俗說法。
健康主題只能寫「這個部位在教材屬哪一宮、建議以健檢與作息紀錄核對」，一律不得寫出臟腑、器官、病名、疾病風險或壽元。
氣色只描述照片呈現的明暗、均勻度、色偏與美肌可能性，不得連結器官、疾病、健康、人格或命運。
collaborationFramework 必須提供合作條件、相處方式、風險訊號與核對問題，但不得只憑面相判定「適合／不適合合作」，不判定對方忠誠、善惡或是否可信。
十二宮與 30/60/90 天行動必須完整，disclaimer 必須逐字使用 server 提供的固定內容。`;

/**
 * 面相報告有自己的模型政策，不跟著聊天用的 OPENAI_MODEL 走。
 * 報告要引用教材條文與流年部位做具體判讀，mini 等級會退回模板式敘述，
 * 因此預設用完整版模型；要調整只能透過 FACE_REPORT_OPENAI_MODEL。
 */
const DEFAULT_OPENAI_REPORT_MODEL = "gpt-4.1";

const TEACHER_AREA_FRAMEWORK = {
  relationship: {
    label: "感情",
    palaces: ["夫妻宮", "命宮", "兄弟宮"],
    method: "夫妻宮以眼尾奸門為主，不能單看奸門；須同時交叉眉、眼、鼻、印堂十字帶。教材以奸門豐盈平整為傳統正向條件，但不可由單張照片斷定婚姻結果。",
    sources: ["老師面相筆記 p.72–77", "十二宮講義 p.10–13"]
  },
  career: {
    label: "事業",
    palaces: ["官祿宮", "命宮", "遷移宮", "奴僕宮"],
    method: "官祿宮以額頭中正為主，交叉印堂、眉眼；教材的正向條件是正面四平八穩、側面額骨微凸。再以遷移宮看外部變動與合作環境，奴僕宮看團隊與部屬基礎。",
    sources: ["老師面相筆記 p.60–69", "老師面相筆記 p.90–91"]
  },
  health: {
    label: "健康",
    palaces: ["疾厄宮", "命宮"],
    method: "疾厄宮以山根、年壽為主，交叉鼻與眼的形神氣；教材以高、寬、厚、清楚為傳統觀察條件。自動報告只能說明部位是否可判讀，絕對不能對應器官、疾病或壽命。",
    sources: ["老師面相筆記 p.78–84", "十二宮講義 p.14–16"]
  },
  finance: {
    label: "財運",
    palaces: ["財帛宮", "福德宮", "田宅宮"],
    method: "財帛宮必須按年齡分三倉：30 歲以下天倉，31–50 歲人倉，51 歲起地倉。教材再交叉鼻部寬厚、眉尾聚散、眼部可判讀度與地閣寬滿；田宅宮只作資產與居住的傳統參照。",
    sources: ["老師面相筆記 p.84–86", "老師面相筆記 p.77–78"]
  },
  family: {
    label: "家庭",
    palaces: ["父母宮", "兄弟宮", "子女宮", "田宅宮"],
    method: "家庭不由單一宮位下結論：父母宮看日月角與額部左右，兄弟宮以眉為主、顴骨為輔，子女宮交叉淚堂、人中、地閣，田宅宮看眼瞼與下停。只能提供關係觀察題，不推定親屬命運。",
    sources: ["老師面相筆記 p.66–78", "老師面相筆記 p.86–90"]
  }
} as const;

const AREA_FEATURES: Record<keyof typeof TEACHER_AREA_FRAMEWORK, readonly string[]> = {
  relationship: ["outerEyeCorners", "eyebrows", "eyes", "nose", "glabella"],
  career: ["forehead", "glabella", "eyebrows", "eyes", "jaw"],
  health: ["nasalRoot", "nose", "eyes", "glabella"],
  finance: ["forehead", "nose", "eyebrows", "eyes", "chin", "jaw"],
  family: ["forehead", "eyebrows", "cheeks", "tearTroughs", "philtrum", "chin", "eyes"]
};

function calculatedAlignment(palaces: FaceRuleResult["palaces"], features: readonly string[]) {
  const unique = new Map<string, string | number | boolean>();
  for (const palace of palaces) {
    for (const evidence of palace.evidence) {
      if (features.includes(evidence.region) && ["contour", "relativeWidth", "relativeHeight", "symmetry"].includes(evidence.field)) {
        unique.set(`${evidence.region}:${evidence.field}`, evidence.observed);
      }
    }
  }
  if (unique.size === 0) return "insufficient" as const;
  const scores = [...unique.entries()].map(([key, value]) => {
    if (value === "not_assessable") return 0;
    if (key.endsWith(":symmetry")) return value === "balanced" ? 1 : value === "slightly_asymmetric" ? 0.5 : 0;
    if (key.endsWith(":relativeWidth") || key.endsWith(":relativeHeight")) return value === "medium" ? 1 : value === "wide" || value === "long" ? 0.85 : 0.35;
    if (key.endsWith(":contour")) return value === "rounded" || value === "straight" ? 1 : 0.5;
    return 0;
  });
  const score = scores.reduce<number>((sum, value) => sum + value, 0) / scores.length;
  return score >= 0.82 ? "high" as const : score >= 0.58 ? "medium" as const : "low" as const;
}

/** 五大面向鍵值對應教材規則表的主題標籤。 */
const AREA_THEMES: Record<keyof typeof TEACHER_AREA_FRAMEWORK, TeachingTheme> = {
  relationship: "感情",
  career: "事業",
  health: "健康",
  finance: "財運",
  family: "家庭"
};

function teacherGrounding(rules: FaceRuleResult) {
  const byTheme = groupTeachingsByTheme(rules.teachings);
  return Object.fromEntries(Object.entries(TEACHER_AREA_FRAMEWORK).map(([key, framework]) => {
    const palaces = rules.palaces.filter((palace) => (framework.palaces as readonly string[]).includes(palace.name));
    return [key, {
      ...framework,
      // 本面向實際命中的教材條文；空陣列代表本次沒有可引用的教材說法。
      matchedTeachings: byTheme[AREA_THEMES[key as keyof typeof TEACHER_AREA_FRAMEWORK]] || [],
      obtainedData: palaces.map((palace) => ({ name: palace.name, parts: palace.parts, status: palace.status, evidence: palace.evidence })),
      calculatedAlignment: calculatedAlignment(palaces, AREA_FEATURES[key as keyof typeof TEACHER_AREA_FRAMEWORK]),
      assessability: palaces.every((palace) => palace.status === "balanced") ? "high" : palaces.some((palace) => palace.status === "limited") ? "low" : "medium",
      downgradeReason: palaces.filter((palace) => palace.status !== "balanced").map((palace) => `${palace.name}：${palace.status === "limited" ? "主部位無法判讀" : "主輔部位有差異或資料不完整"}`)
    }];
  }));
}

export async function generateFaceReport(input: {
  mode: FaceAnalysisMode;
  subjectAge: number | null;
  quality: FaceQualityResult;
  rules: FaceRuleResult;
  knowledge?: Array<{ cardId: string; title: string; category: string; observation: string; editorSummary: string | null }>;
  collaborationAssessment?: boolean;
  collaborationProject?: string | null;
  surface?: Pick<FaceVisionResult, "surfaceFeatures" | "complexion">;
}) {
  if ((process.env.FACE_REPORT_PROVIDER || "openai").trim().toLowerCase() !== "openai") {
    throw new Error("FACE_REPORT_PROVIDER_UNSUPPORTED");
  }
  const model = process.env.FACE_REPORT_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_REPORT_MODEL;
  const startedAt = Date.now();
  const controller = new AbortController();
  // 時間預算（route maxDuration 300s）：Vision 最多 45s ＋ 報告 110s ＋ 照片下載與扣點寫入約 10s。
  // 舊值 75s 是在契約擴大前訂的；加入流年、指紋教材對應與斑痣宮位後，
  // 實測輸出約 6,100 tokens、耗時約 73s，已經貼著舊上限，會間歇性逾時。
  const timeout = setTimeout(() => controller.abort(), 110_000);
  const reportInput = {
      mode: input.mode,
      subjectAge: input.subjectAge,
      collaborationAssessment: Boolean(input.collaborationAssessment),
      collaborationProject: input.collaborationAssessment ? input.collaborationProject : null,
      photoQuality: {
        faceCoverage: input.quality.faceCoverage,
        blurScore: input.quality.blurScore,
        brightnessScore: input.quality.brightnessScore,
        limitations: input.quality.reasons
      },
      rules: input.rules,
      // 流年、斑痣對應與教材條文都在 rules 裡，但這三段是新報告的主要內容來源，
      // 額外提到頂層讓模型不會漏掉。teacherNote 已在規則層剝除，不會進到這裡。
      flowYear: input.rules.flowYear,
      surfaceImpacts: input.rules.surfaceImpacts,
      teachings: input.rules.teachings,
      surface: input.surface || {
        surfaceFeatures: [],
        complexion: { assessable: false, evenness: "not_assessable", brightness: "not_assessable", colorCast: "not_assessable", possibleBeautyFilter: false, confidence: 0, limitation: "未提供表面特徵資料" }
      },
      teacherAreaFramework: teacherGrounding(input.rules),
      approvedKnowledge: (input.knowledge || []).map((item) => ({ cardId: item.cardId, title: item.title, category: item.category, observation: item.observation, editorSummary: item.editorSummary })),
      fixedDisclaimer: FACE_REPORT_DISCLAIMER
  };
  let response: { output_parsed?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
  try {
    response = await createOpenAIClient().responses.parse({
      model, store: false,
      instructions: `${REPORT_INSTRUCTIONS}\n\n${outputContract(input.mode, Boolean(input.collaborationAssessment))}`,
      input: `請依下列資料輸出單一 JSON object：\n${JSON.stringify(reportInput)}`,
      text: { format: zodTextFormat(faceReportResponseSchema(input.mode), "face_report") },
      // 契約新增流年、斑痣宮位對應與教材條文引用後輸出明顯變長，5400 會被截斷。
      max_output_tokens: 9000, temperature: 0
    }, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("FACE_REPORT_PROVIDER_TIMEOUT");
    const providerError = error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown };
    console.error("FACE_REPORT_PROVIDER_FAILED", {
      name: typeof providerError.name === "string" ? providerError.name : "unknown",
      status: typeof providerError.status === "number" ? providerError.status : null,
      code: typeof providerError.code === "string" ? providerError.code : null,
      message: typeof providerError.message === "string" ? providerError.message.slice(0, 240) : "unknown"
    });
    throw new Error("FACE_REPORT_PROVIDER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.output_parsed) throw new Error("FACE_REPORT_EMPTY_OUTPUT");
  let report: FaceReport;
  try {
    const normalized = normalizeUnsafeOverclaims(response.output_parsed);
    // 指紋除了 interpretation 之外全部蓋回規則層查表結果：
    // 部位、宮位、流年、教材條件都不容模型改寫，只有「接近哪個條件」的判斷來自模型。
    const canonical = normalized && typeof normalized === "object"
      ? {
          ...normalized,
          photoFingerprint: input.rules.photoFingerprint.map((item, index) => ({
            observation: item.observation,
            partName: item.partName,
            palaces: [...item.palaces],
            flowYearNote: item.flowYearNote,
            teaching: `教材看的是${item.looksAt}。相理合：${item.favorable}　相理不合：${item.unfavorable}（${item.source}）`,
            interpretation: readModelInterpretation(normalized, index)
          }))
        }
      : normalized;
    report = faceReportSchema.parse(canonical);
  } catch (error) {
    console.error("FACE_REPORT_SCHEMA_REJECTED", {
      issues: error && typeof error === "object" && "issues" in error ? JSON.stringify(error.issues).slice(0, 1200) : "unknown"
    });
    throw new Error("FACE_REPORT_SCHEMA_INVALID");
  }
  const enforced = enforceTeachingCitations(report, input.rules);
  if (enforced.violations.length > 0) {
    console.warn("FACE_REPORT_CITATION_VIOLATION", { violations: JSON.stringify(enforced.violations).slice(0, 600) });
  }

  return {
    report: enforced.report,
    trace: {
      provider: "openai",
      model,
      tokensInput: Number(response.usage?.input_tokens || 0),
      tokensOutput: Number(response.usage?.output_tokens || 0),
      latencyMs: Date.now() - startedAt,
      // 教材引用把關結果；空陣列代表本次引用全部對得回規則層。
      citationViolations: enforced.violations
    }
  };
}

/** 取模型寫的第 index 筆 interpretation；缺漏時給明確的保守說明，不留空字串。 */
export const readModelInterpretationForTest = (parsed: unknown, index: number) => readModelInterpretation(parsed, index);

function readModelInterpretation(parsed: unknown, index: number): string {
  const list = parsed && typeof parsed === "object" && "photoFingerprint" in parsed
    ? (parsed as { photoFingerprint?: unknown }).photoFingerprint
    : undefined;
  const item = Array.isArray(list) ? list[index] : undefined;
  const text = item && typeof item === "object" && "interpretation" in item ? (item as { interpretation?: unknown }).interpretation : undefined;
  if (typeof text !== "string" || text.trim().length === 0) {
    return "本次無法判定這項觀察比較接近教材的哪一個條件，僅列出部位與流年對照供核對。";
  }
  // 契約要求用「相理合／相理不合」；模型偶爾會漏出英文欄位名，這裡兜底改寫。
  return text
    .trim()
    .replace(/unfavorable/gi, "相理不合")
    .replace(/favorable/gi, "相理合");
}

export type TeachingCitationViolation = Readonly<{
  area: string;
  /** 模型填了但規則層根本沒命中的條文 id。 */
  unknownIds: readonly string[];
  /** 該面向有命中條文卻一條都沒引用。 */
  missingCitation: boolean;
}>;

/**
 * 強制驗證教材引用。
 *
 * outputContract 只能「要求」模型引用命中的條文；這裡才是真正的把關：
 * 任何不存在於本次規則層命中結果的 id 一律剔除，並記錄違規供稽核。
 *
 * 不因單一違規整份退件——報告已扣點且模型已呼叫，退件對使用者是淨損失；
 * 改為剔除假引用並把違規寫進 trace，讓老師在後台看得到哪一份報告的引用不乾淨。
 */
export function enforceTeachingCitations(report: FaceReport, rules: FaceRuleResult) {
  const validIds = new Set(rules.teachings.map((item) => item.id));
  const matchedThemes = groupTeachingsByTheme(rules.teachings);
  const violations: TeachingCitationViolation[] = [];

  const lifeAreas = Object.fromEntries(
    Object.entries(report.lifeAreas).map(([area, reading]) => {
      const cited = reading.citedTeachings || [];
      const kept = cited.filter((id) => validIds.has(id));
      const unknownIds = cited.filter((id) => !validIds.has(id));
      const availableCount = (matchedThemes[AREA_THEMES[area as keyof typeof AREA_THEMES]] || []).length;
      const missingCitation = availableCount > 0 && kept.length === 0;
      if (unknownIds.length > 0 || missingCitation) {
        violations.push({ area, unknownIds, missingCitation });
      }
      return [area, { ...reading, citedTeachings: kept }];
    })
  ) as FaceReport["lifeAreas"];

  return { report: { ...report, lifeAreas } as FaceReport, violations };
}

function normalizeUnsafeOverclaims(value: unknown): unknown {
  if (typeof value === "string") {
    if (value === FACE_REPORT_DISCLAIMER) return value;
    return value
      .replace(/生命力(?:良好|穩定|旺盛)?/g, "可見部位結構")
      .replace(/健康(?:狀況)?(?:良好|穩定|無.{0,4}異常)/g, "健康面向僅能觀察部位形態，不代表實際健康狀況")
      .replace(/合作關係基礎(?:穩定|良好)/g, "合作相關部位符合部分傳統觀察條件")
      .replace(/事業合作環境(?:穩定|良好)/g, "事業合作相關部位符合部分傳統觀察條件")
      .replace(/財務狀況.{0,8}(?:穩定|良好)/g, "財務相關部位符合部分傳統觀察條件")
      .replace(/感情關係.{0,8}(?:穩定|良好|和諧)/g, "感情相關部位符合部分傳統觀察條件")
      .replace(/家庭關係.{0,8}(?:穩定|良好|和諧)/g, "家庭相關部位符合部分傳統觀察條件")
      .replace(/事業環境.{0,8}(?:穩定|良好)/g, "事業相關部位符合部分傳統觀察條件");
  }
  if (Array.isArray(value)) return value.map(normalizeUnsafeOverclaims);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeUnsafeOverclaims(item)]));
  }
  return value;
}

function outputContract(mode: FaceAnalysisMode, collaborationAssessment: boolean) {
  const common = `輸出 JSON 契約：
- schemaVersion 必須為 "1.0"；mode 必須為 "${mode}"。
- summary 必須是 100–180 個字元的繁體中文。
- photoQuality、currentTrend 為字串。
- photoFingerprint 必須依 rules.photoFingerprint 的順序逐筆輸出，數量與輸入完全一致。
- 每筆只有 observation、partName、palaces、flowYearNote、teaching、interpretation 六個欄位。
- observation、partName、palaces、flowYearNote、teaching 逐字複製輸入，不得改寫（server 會再蓋回一次，改寫無效）。
- interpretation 必須以「較接近相理合」或「較接近相理不合」開頭，接著說出該條件在教材裡對應到什麼；
  兩者都不明顯時以「本次判斷不出偏向哪一邊」開頭。禁止在輸出中出現 favorable、unfavorable 等英文欄位名。
- hitsCurrentAge 為 true 時，interpretation 要點明本年正好走到這個部位。禁止斷言結果或保證運勢。
- coreHighlights 必須恰好三筆，依序回答「最明顯的具體部位組合」、「該組合在民俗語境下的可用方向」、「近期最需節制的做法」。每筆必須點名至少一個宮位或部位，禁止寫成使用說明。
- coreHighlights 三筆合計至少必須逐字引用 rules.photoFingerprint 中三個不同 observation；若無法引用就不得產生肯定結論。
- priorityAdvice 必須恰好三筆，每筆只有 problem、reason、advice；problem 必須以「建議核對：」開頭，描述生活中可辨認的具體情境，不得宣稱該情境已存在；reason 必須點名宮位與可見形態證據；advice 必須包含明確動作、期限或檢核方式。
- palaces 必須恰好 12 筆且不可重複，name 依序為：命宮、官祿宮、父母宮、福德宮、遷移宮、兄弟宮、夫妻宮、子女宮、疾厄宮、財帛宮、奴僕宮、田宅宮。
- 每筆 palace 只有 name、status、evidence、interpretation、advice；status 只能是 balanced、watch 或 limited。
- 各宮解讀必須依據輸入 rules.palaces 內同名宮位的 parts（老師教材部位）與 evidence 形態特徵（輪廓／寬窄／長短／對稱），不得依光線或拍攝條件下論斷。
- 若 rules.teachings 有條文的 palaces 含這一宮，interpretation 必須引用該條文的教材說法，不得只重述形態枚舉。
- flowYear：rules.flowYear 為 null 時輸出 null；否則必須完整輸出且只含 age、positions、crossCheck、gates、focus、reflection。
- flowYear.age 複製 rules.flowYear.age。positions 必須恰好兩筆，method 依序為 seventy_five_regions 與 nine_value，
  position 逐字複製 rules.flowYear.seventyFive.position 與 rules.flowYear.nineValue.position，
  observation 必須寫出該部位在本張照片的實際形態（引用同一筆的 morphology 與 status），不得寫成通用敘述。
- flowYear.crossCheck 必須逐字複製 rules.flowYear.crossCheck.text。
- flowYear.gates：rules.flowYear.gates 每一筆都要寫成一句話，包含歲數與教材說法；沒有就輸出空陣列。
- flowYear.focus 必須寫出「本年這兩個部位對應到生活中該核對的一件具體事」，要有可執行的動作與時間點，
  不得寫成「注意健康」「保持穩定」這類萬用句，也不得預測會發生什麼事。
- flowYear.reflection 說明教材併看法怎麼讀這一年，並說明本次判讀的限制。
- actions 必須恰好三筆，period 依序為 30_days、60_days、90_days，每筆只有 period 與 action。
- 三筆 actions 的內容不得相同：30 天是立即整理或測試，60 天是根據紀錄調整，90 天是決定保留、加碼或停止。
- disclaimer 必須與 fixedDisclaimer 完全一致。
- surfaceAnalysis 必須只含 detectedFeatures、complexionObservation、filterWarning、summary。
- detectedFeatures 必須逐筆對應 rules.surfaceImpacts，一筆都不能少也不能增加照片中未觀察到的斑、痣、疤或痕。
- 每筆：type 保持原值；location 用 regionLabel 與 sideLabel 寫成繁體中文部位與左右；observation 只寫可見外觀；
  palaces 逐字複製該筆的 palaces；themes 逐字複製該筆的 themes；confidence 依輸入信心度轉為 high／medium／low。
- traditionalReference 依該筆 memberNote 的教材說法撰寫。themes 含「六親」或「財運」時，必須具體寫出教材說的關係或錢財對應，
  不得稀釋成「僅供參考」。themes 含「健康」時，只能寫出部位所屬宮位與「建議以健檢及作息紀錄核對」，
  禁止出現任何臟腑、器官、病名、疾病風險或壽元敘述。
- flowYearNote 必須用該筆的 flowYearPositions 與 flowYearAges 寫出對應歲數；hitsCurrentAge 為 true 時要明說本年正好走到這個部位。
- 若沒有特徵，detectedFeatures 必須為空陣列且 summary 明確寫「本次未辨識到可信度足夠的斑、痣、疤或痕」。
- complexionObservation 只整理 surface.complexion 的畫面明暗、均勻度、色偏與限制；possibleBeautyFilter 為 true 時 filterWarning 必須提醒美肌、磨皮或濾鏡可能造成失真，否則可為 null。
- 不得輸出未列出的欄位。`;
  return `${common}
- lifeAreas 必須只含 relationship、career、health、finance、family，依序回答感情、事業、健康、財運、家庭。
- 每個 lifeArea 必須只含 conclusion、alignment、visibleBasis、teacherInterpretation、watchout、action、confidence、citedTeachings、sources。
- teacherInterpretation 必須優先引用該面向 teacherAreaFramework.matchedTeachings 的教材說法，逐條寫成完整句子，
  並帶出該條文命中的部位與形態（observedMorphology）。citedTeachings 必須列出實際引用到的條文 id。
- 若該面向 matchedTeachings 為空陣列，teacherInterpretation 必須明說「本次可判讀的部位沒有命中教材條文」，
  citedTeachings 輸出空陣列，且不得自行編造教材說法。
- health 面向的 matchedTeachings 若含 healthSensitive 條文，只能引用其部位與核對提醒，不得寫臟腑或病名。
- alignment 必須逐字複製該面向 teacherAreaFramework.calculatedAlignment，不得自行評分。它是本次可見形態對老師建議觀察條件的符合度，不是人生結果、運勢分數或照片可信度。
- conclusion 必須以「老師建議符合度為高／中／低／資料不足」開頭，再說最強的一組部位與最需要留意的一組部位；不得寫「以實際狀況為準」或其他免責廢話。
- visibleBasis 必須點名本次實際可見部位及形態，並明說哪些主部位不可判讀；不得把拍攝品質當成生活結論。
- 五個 visibleBasis 各自必須引用至少一項 rules.photoFingerprint 的原始 observation；不同面向應優先選擇不同特徵，不得五項重複同一句模板。
- teacherInterpretation 必須按 teacherAreaFramework.method 進行多宮位交叉解讀，不得自創關聯。
- watchout 必須指出一個具體的反向條件或本次判讀限制；action 必須給一個 7–30 天內可執行的驗證動作。
- confidence 必須對應 teacherAreaFramework.assessability；sources 必須複製該面向 teacherAreaFramework.sources 中的 1–4 筆，不得虛構頁碼。
- health 不得宣稱健康狀況、器官功能、疾病風險或壽命，只能提醒以實際作息、健檢與專業意見核對。
- health 的 alignment 只代表山根、鼻、眼等可見形態與教材觀察條件的相符度；conclusion 禁止出現「健康良好、健康穩定、無異常、抵抗力好」。
- collaborationFramework ${collaborationAssessment ? "必須是完整物件" : "必須為 null"}。
${collaborationAssessment ? `- collaborationFramework 必須只含 verdict、verdictReason、suitableRole、suitability、interactionStyle、riskSignals(2–6 個字串)、questionsToVerify(3–8 個字串)、boundaries。
- verdict 只能是 recommended、conditional、not_recommended；必須綜合 collaborationProject、五大面向、部位可判讀度與實際核對條件。
- verdictReason 必須先直接回答「這個人對此合作項目是否適合」，再說明支持與反對依據；不得將面部觀察當成人格或可信度事實。
- suitableRole 必須說明此人較適合的專案角色、負責邊界與不建議承擔的任務。` : ""}
- suitability 只能說明「在什麼合作條件下值得試行」，不得宣告此人適合或不適合合作。
- interactionStyle 要給具體的溝通頻率、決策方式、分工與衝突處理建議。
- riskSignals 與 questionsToVerify 必須是合作過程中可觀察、可記錄的現實行為，不得當作已發生的人格事實。`;
}

export function renderFaceReportText(report: FaceReport) {
  const sections = [
    `# 巽風面相文化觀察報告`,
    `## 摘要\n${report.summary}`,
    `## 照片品質\n${report.photoQuality}`,
    `## 目前趨勢\n${report.currentTrend}`,
    `## 這張照片實際辨識到的特徵\n${report.photoFingerprint
      .map(
        (item) =>
          `### ${item.observation}\n` +
          `教材部位：${item.partName}\n\n` +
          `對應宮位：${item.palaces.join("、")}\n\n` +
          `流年對照：${item.flowYearNote}\n\n` +
          `教材依據：${item.teaching}\n\n` +
          `本次判讀：${item.interpretation}`
      )
      .join("\n\n")}`,
    `## 三個核心重點\n${report.coreHighlights.map((item) => `- ${item}`).join("\n")}`,
    `## 明確問題與建議\n${report.priorityAdvice.map((item, index) => `### 問題 ${index + 1}：${item.problem}\n理由：${item.reason}\n\n建議：${item.advice}`).join("\n\n")}`,
    `## 斑、痣、疤、痕與氣色\n${report.surfaceAnalysis.summary}\n\n${
      report.surfaceAnalysis.detectedFeatures
        .map(
          (item) =>
            `### ${item.location}：${item.type === "spot" ? "斑" : item.type === "mole" ? "痣" : item.type === "scar" ? "疤" : "痕"}\n` +
            `對應宮位：${item.palaces.join("、")}\n\n` +
            `對應主題：${item.themes.join("、")}\n\n` +
            `外觀觀察：${item.observation}\n\n` +
            `教材說法：${item.traditionalReference}\n\n` +
            `流年對照：${item.flowYearNote}\n\n` +
            `信心度：${item.confidence}`
        )
        .join("\n\n") || "本次未辨識到可信度足夠的斑、痣、疤或痕。"
    }\n\n氣色觀察：${report.surfaceAnalysis.complexionObservation}${report.surfaceAnalysis.filterWarning ? `\n\n照片限制：${report.surfaceAnalysis.filterWarning}` : ""}`,
  ];

  if (report.flowYear) {
    const methodLabels = { seventy_five_regions: "七十五部位流年法", nine_value: "九值流年法" } as const;
    sections.push(
      `## 本年流年（${report.flowYear.age} 歲）\n` +
        `${report.flowYear.positions.map((item) => `### ${methodLabels[item.method]}：${item.position}\n${item.observation}`).join("\n\n")}\n\n` +
        `### 併看法\n${report.flowYear.crossCheck}\n\n` +
        (report.flowYear.gates.length > 0 ? `### 三關四隘\n${report.flowYear.gates.map((item) => `- ${item}`).join("\n")}\n\n` : "") +
        `### 本年該核對的事\n${report.flowYear.focus}\n\n` +
        `### 判讀說明\n${report.flowYear.reflection}`
    );
  }
  // 五大面向與合作評估是兩件獨立的事：沒有勾合作評估時，五大面向仍必須輸出。
  sections.push(
    `## 五大面向\n${Object.entries({ 感情: report.lifeAreas.relationship, 事業: report.lifeAreas.career, 健康: report.lifeAreas.health, 財運: report.lifeAreas.finance, 家庭: report.lifeAreas.family }).map(([label, item]) => `### ${label}\n老師建議符合度：${item.alignment}\n\n結論：${item.conclusion}\n\n可見依據：${item.visibleBasis}\n\n老師綜合判讀：${item.teacherInterpretation}\n\n需留意：${item.watchout}\n\n具體建議：${item.action}\n\n可判斷程度：${item.confidence}`).join("\n\n")}`
  );
  if (report.collaborationFramework) sections.push(
    `## 合作對象綜合評估\n### 綜合結論\n${report.collaborationFramework.verdict}\n\n${report.collaborationFramework.verdictReason}\n\n### 建議承擔角色\n${report.collaborationFramework.suitableRole}\n\n### 合作適配條件\n${report.collaborationFramework.suitability}\n\n### 建議相處模式\n${report.collaborationFramework.interactionStyle}\n\n### 需留意的合作訊號\n${report.collaborationFramework.riskSignals.map((item) => `- ${item}`).join("\n")}\n\n### 合作前核對問題\n${report.collaborationFramework.questionsToVerify.map((item) => `- ${item}`).join("\n")}\n\n### 判斷界線\n${report.collaborationFramework.boundaries}`
  );
  sections.push(
    `## 30／60／90 天行動\n${report.actions.map((item) => `- ${item.period}: ${item.action}`).join("\n")}`,
    `## 使用說明\n${report.disclaimer}`
  );
  return sections.join("\n\n");
}

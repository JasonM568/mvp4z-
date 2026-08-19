import { FACE_RULE_MIN_CONFIDENCE, FEATURE_LABELS, type FaceFeatureName } from "@/lib/face-analysis/face-features";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

/**
 * 教材依據稽核鏈。
 *
 * 回答的問題是：「這份報告寫的每一句教材說法，到底是從哪來的？」
 * 把四段串成一條可核的鏈路：
 *
 *   Vision 對這張照片的觀測值
 *     → 命中了哪一條形態條件
 *       → 對應到哪一條沈師教材條文（含頁碼）
 *         → 報告有沒有真的引用它
 *
 * 資料一律取自該次執行當下寫入的 `model_trace.teacherAudit`，
 * 不用現行規則表重算——否則規則表改版後，舊報告的稽核結果會跟著變，失去追溯意義。
 */

export type AuditTeaching = Readonly<{
  id: string;
  feature: FaceFeatureName;
  featureLabel: string;
  observedMorphology: string;
  text: string;
  themes: readonly string[];
  palaces: readonly string[];
  source: string;
  confidence: number;
}>;

export type AuditChainRow = Readonly<{
  id: string;
  featureLabel: string;
  /** Vision 對該部位的原始觀測值。 */
  observed: string;
  confidence: number;
  /** 教材條文與出處頁碼。 */
  teaching: string;
  source: string;
  palaces: readonly string[];
  themes: readonly string[];
  /** 報告是否真的引用了這條；false 代表命中但沒寫進報告。 */
  citedInReport: boolean;
  citedBy: readonly string[];
}>;

export type FaceAuditResult = Readonly<{
  available: boolean;
  reason?: string;
  /** 本次照片一共命中幾條教材條文。 */
  matchedCount: number;
  /** 其中有幾條真的被報告引用。 */
  citedCount: number;
  chain: readonly AuditChainRow[];
  /** 模型填了但規則層沒命中的假引用。空陣列代表乾淨。 */
  unknownCitations: readonly string[];
  /** 未參與判讀的部位與原因，說明「為什麼這些地方沒有結論」。 */
  skippedFeatures: readonly Readonly<{ featureLabel: string; reason: string }>[];
  flowYear: unknown;
  surfaceImpacts: unknown;
}>;

const AREA_LABELS: Record<string, string> = {
  relationship: "感情",
  career: "事業",
  health: "健康",
  finance: "財運",
  family: "家庭"
};

function readCitations(reportStructured: unknown): { byId: Map<string, string[]>; all: string[] } {
  const byId = new Map<string, string[]>();
  const all: string[] = [];
  const lifeAreas =
    reportStructured && typeof reportStructured === "object" && "lifeAreas" in reportStructured
      ? (reportStructured as { lifeAreas?: Record<string, { citedTeachings?: unknown }> }).lifeAreas
      : undefined;
  if (!lifeAreas) return { byId, all };
  for (const [area, reading] of Object.entries(lifeAreas)) {
    const cited = Array.isArray(reading?.citedTeachings) ? reading.citedTeachings : [];
    for (const raw of cited) {
      if (typeof raw !== "string") continue;
      all.push(raw);
      byId.set(raw, [...(byId.get(raw) || []), AREA_LABELS[area] || area]);
    }
  }
  return { byId, all };
}

/**
 * 列出「Vision 有看到、但沒有進入判讀」的部位及原因。
 * 教材條文只在部位清楚可判讀時才套用，這裡把被跳過的原因攤開，
 * 避免老師誤以為系統漏看。
 */
function collectSkipped(vision: FaceVisionResult): Array<{ featureLabel: string; reason: string }> {
  const skipped: Array<{ featureLabel: string; reason: string }> = [];
  const entries: Array<[FaceFeatureName, FaceVisionResult["regions"][keyof FaceVisionResult["regions"]]]> = [
    ...(Object.entries(vision.regions) as Array<[FaceFeatureName, FaceVisionResult["regions"][keyof FaceVisionResult["regions"]]]>),
    ...(Object.entries(vision.details) as Array<[FaceFeatureName, FaceVisionResult["regions"][keyof FaceVisionResult["regions"]]]>)
  ];
  for (const [feature, value] of entries) {
    const noMorphology =
      value.contour === "not_assessable" &&
      value.relativeWidth === "not_assessable" &&
      value.relativeHeight === "not_assessable";
    if (value.visibility !== "clear") {
      skipped.push({ featureLabel: FEATURE_LABELS[feature], reason: `可見度為「${value.visibility}」，教材條文不套用` });
    } else if (value.confidence < FACE_RULE_MIN_CONFIDENCE) {
      skipped.push({ featureLabel: FEATURE_LABELS[feature], reason: `信心度 ${value.confidence.toFixed(2)} 低於門檻 ${FACE_RULE_MIN_CONFIDENCE}` });
    } else if (noMorphology) {
      skipped.push({ featureLabel: FEATURE_LABELS[feature], reason: "輪廓、寬窄、長短皆無法判讀" });
    }
  }
  return skipped;
}

export function buildFaceAudit(input: {
  visionResult: unknown;
  reportStructured: unknown;
  modelTrace: unknown;
}): FaceAuditResult {
  const trace = input.modelTrace && typeof input.modelTrace === "object" ? (input.modelTrace as Record<string, unknown>) : null;
  const teacherAudit = trace?.teacherAudit && typeof trace.teacherAudit === "object" ? (trace.teacherAudit as Record<string, unknown>) : null;

  const empty: FaceAuditResult = {
    available: false,
    reason: "這份報告產生於教材稽核鏈上線（2026-08-19）之前，沒有保存當時命中的教材條文，無法回溯。",
    matchedCount: 0,
    citedCount: 0,
    chain: [],
    unknownCitations: [],
    skippedFeatures: [],
    flowYear: null,
    surfaceImpacts: null
  };
  if (!teacherAudit || !Array.isArray(teacherAudit.teachings)) return empty;

  const teachings = teacherAudit.teachings as AuditTeaching[];
  const { byId, all } = readCitations(input.reportStructured);
  const matchedIds = new Set(teachings.map((item) => item.id));

  const chain: AuditChainRow[] = teachings.map((item) => ({
    id: item.id,
    featureLabel: item.featureLabel,
    observed: item.observedMorphology,
    confidence: item.confidence,
    teaching: item.text,
    source: item.source,
    palaces: item.palaces,
    themes: item.themes,
    citedInReport: byId.has(item.id),
    citedBy: byId.get(item.id) || []
  }));

  const vision = input.visionResult as FaceVisionResult | null;

  return {
    available: true,
    matchedCount: chain.length,
    citedCount: chain.filter((row) => row.citedInReport).length,
    chain,
    unknownCitations: [...new Set(all.filter((id) => !matchedIds.has(id)))],
    skippedFeatures: vision?.regions && vision?.details ? collectSkipped(vision) : [],
    flowYear: teacherAudit.flowYear ?? null,
    surfaceImpacts: teacherAudit.surfaceImpacts ?? null
  };
}

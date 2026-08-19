import type { FaceAnalysisMode } from "@/lib/face-analysis/types";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";
import {
  CONTOUR_LABELS,
  FACE_RULE_MIN_CONFIDENCE,
  FEATURE_LABELS,
  HEIGHT_LABELS,
  SYMMETRY_LABELS,
  WIDTH_LABELS,
  featureValue,
  isReadable,
  type DetailName,
  type FaceFeatureName,
  type FeatureValue,
  type RegionName,
  type RegionValue
} from "@/lib/face-analysis/face-features";
import { resolveFlowYear, type FlowYearResult } from "@/lib/face-analysis/flow-year";
import { mapSurfaceImpacts, type SurfaceImpact } from "@/lib/face-analysis/surface-map";
import { matchTeachings, type MatchedTeaching } from "@/lib/face-analysis/teachings";

export { FACE_RULE_MIN_CONFIDENCE };

/**
 * 沈全榮老師十二宮體系（docs/specs/face-analysis/SPEC-05）。
 * 宮名與順序依老師筆記 p.59 十二宮總論，不用麻衣古籍版宮名。
 */
export const FACE_PALACE_NAMES = [
  "命宮",
  "官祿宮",
  "父母宮",
  "福德宮",
  "遷移宮",
  "兄弟宮",
  "夫妻宮",
  "子女宮",
  "疾厄宮",
  "財帛宮",
  "奴僕宮",
  "田宅宮"
] as const;

export type FacePalaceName = (typeof FACE_PALACE_NAMES)[number];
export type RuleStatus = "balanced" | "watch" | "limited";

export type RuleEvidence = Readonly<{
  region: FaceFeatureName | "orientation" | "landmarks";
  field: string;
  observed: string | number | boolean;
  confidence: number;
}>;

export type RuleItem = Readonly<{
  ruleId: string;
  text: string;
  evidence: readonly RuleEvidence[];
}>;

export type PalaceRuleResult = Readonly<{
  name: FacePalaceName;
  /** 沈師教材定義的部位，供報告撰稿引用（細部位在 Vision v2 前以八大區塊近似） */
  parts: string;
  status: RuleStatus;
  ruleId: string;
  evidence: readonly RuleEvidence[];
}>;

export type FaceRuleResult = Readonly<{
  version: "3.0";
  mode: FaceAnalysisMode;
  photoFingerprint: readonly RuleItem[];
  overallTrend: RuleItem;
  palaces: readonly PalaceRuleResult[];
  /** 九值流年法＋七十五部位流年法的確定性結果（沈師教材 p.11–13）。 */
  flowYear: FlowYearResult | null;
  /** 斑、痣、疤、痕對應到的宮位、主題與流年（會員版，已剝除教材原文）。 */
  surfaceImpacts: readonly Omit<SurfaceImpact, "teacherNote">[];
  /** 本張照片命中的教材形態條文。 */
  teachings: readonly MatchedTeaching[];
  observations: readonly RuleItem[];
  cautions: readonly RuleItem[];
  actionPlan: readonly RuleItem[];
}>;

type PalaceMapping = Readonly<{
  parts: string;
  primary: readonly FaceFeatureName[];
  auxiliary: readonly FaceFeatureName[];
}>;
export type FaceRuleProfileSettings = Readonly<{ schemaVersion: "1.0"; palaces: readonly { name: FacePalaceName; primary: readonly FaceFeatureName[]; auxiliary: readonly FaceFeatureName[] }[] }>;

/**
 * Vision v2 已納入老師核可的六個細部位；其餘仍以八大區塊近似。
 * 主／輔劃分依 SPEC-05 對應表。
 */
const PALACE_MAPPINGS: Readonly<Record<Exclude<FacePalaceName, "財帛宮">, PalaceMapping>> = {
  命宮: { parts: "印堂（輔：兩眉）", primary: ["glabella"], auxiliary: ["eyebrows"] },
  官祿宮: { parts: "額頭中正（輔：印堂、眉眼）", primary: ["forehead"], auxiliary: ["glabella", "eyebrows", "eyes"] },
  父母宮: { parts: "日月角（輔：上中府、眼眉、髮際）", primary: ["forehead"], auxiliary: ["eyebrows", "eyes"] },
  福德宮: { parts: "兩眉上緣（輔：印堂）", primary: ["eyebrows"], auxiliary: ["glabella"] },
  遷移宮: { parts: "山林驛馬／額角髮際（輔：印堂、眼神）", primary: ["forehead"], auxiliary: ["glabella", "eyes"] },
  兄弟宮: { parts: "眉毛（輔:顴骨）", primary: ["eyebrows"], auxiliary: ["cheeks"] },
  夫妻宮: { parts: "眼尾奸門（輔：眉、眼、鼻、印堂十字帶）", primary: ["outerEyeCorners"], auxiliary: ["eyebrows", "eyes", "nose", "glabella"] },
  子女宮: { parts: "淚堂（輔：下停地閣、眼、人中）", primary: ["tearTroughs"], auxiliary: ["chin", "eyes", "philtrum"] },
  疾厄宮: { parts: "山根（輔：鼻、眼形神氣）", primary: ["nasalRoot"], auxiliary: ["nose", "eyes"] },
  奴僕宮: { parts: "下停鼻准以下：下顎腮骨（輔：法令、地閣、口）", primary: ["jaw"], auxiliary: ["mouth", "cheeks", "chin"] },
  田宅宮: { parts: "眼瞼（輔：下巴嘴角、准圓）", primary: ["eyes"], auxiliary: ["jaw", "mouth"] }
};

/** 財帛宮三倉分年齡段（筆記 p.84-86）：天倉＝青年祖蔭、人倉 31-50＝自賺、地倉 51 起＝晚年。 */
function treasuryMapping(subjectAge: number | null | undefined): PalaceMapping & { band: string } {
  if (subjectAge != null && subjectAge <= 30) {
    return { band: "天倉", parts: "天倉（髮際額頭；青年財，祖先父母給的）", primary: ["forehead"], auxiliary: ["eyebrows", "nose"] };
  }
  if (subjectAge != null && subjectAge >= 51) {
    return { band: "地倉", parts: "地倉（地閣懸臂；晚年財，子女晚輩）", primary: ["chin"], auxiliary: ["jaw", "mouth", "nose"] };
  }
  return { band: "人倉", parts: "人倉（眉眼鼻；中年 31-50 自賺之財）", primary: ["nose"], auxiliary: ["eyebrows", "eyes"] };
}

function morphologyEvidence(vision: FaceVisionResult, region: FaceFeatureName): RuleEvidence[] {
  const value = featureValue(vision, region);
  return [
    { region, field: "contour", observed: value.contour, confidence: value.confidence },
    { region, field: "relativeWidth", observed: value.relativeWidth, confidence: value.confidence },
    { region, field: "relativeHeight", observed: value.relativeHeight, confidence: value.confidence },
    { region, field: "symmetry", observed: value.symmetry, confidence: value.confidence }
  ];
}

function auxiliaryEvidence(vision: FaceVisionResult, region: FaceFeatureName): RuleEvidence[] {
  const value = featureValue(vision, region);
  return [
    { region, field: "contour", observed: value.contour, confidence: value.confidence },
    { region, field: "symmetry", observed: value.symmetry, confidence: value.confidence }
  ];
}

/**
 * 宮位狀態只由「形態可判讀程度」與「對稱性」決定（沈師：不對稱有義）。
 * 光線／拍攝條件不進宮位狀態，統一收進 cautions。
 */
function palaceStatus(vision: FaceVisionResult, mapping: PalaceMapping): RuleStatus {
  const primaries = mapping.primary.map((region) => featureValue(vision, region));
  const readable = primaries.filter(isReadable);
  if (readable.length === 0) return "limited";
  if (readable.length < primaries.length) return "watch";
  const mapped = [...mapping.primary, ...mapping.auxiliary].map((region) => featureValue(vision, region));
  if (mapped.some((value) => value.symmetry === "asymmetric" && value.confidence >= FACE_RULE_MIN_CONFIDENCE)) {
    return "watch";
  }
  return "balanced";
}

function buildPalace(
  vision: FaceVisionResult,
  name: FacePalaceName,
  mapping: PalaceMapping,
  ruleIdSuffix: string
): PalaceRuleResult {
  return {
    name,
    parts: mapping.parts,
    status: palaceStatus(vision, mapping),
    ruleId: `PALACE_${name}_${ruleIdSuffix}`,
    evidence: [
      ...mapping.primary.flatMap((region) => morphologyEvidence(vision, region)),
      ...mapping.auxiliary.flatMap((region) => auxiliaryEvidence(vision, region))
    ]
  };
}

/** Deterministic interpretation of validated, visible geometry only. */
export function applyFaceRules(input: {
  vision: FaceVisionResult;
  mode: FaceAnalysisMode;
  subjectAge?: number | null;
  profileSettings?: FaceRuleProfileSettings | null;
}): FaceRuleResult {
  const { vision, mode } = input;
  const treasury = treasuryMapping(input.subjectAge);

  const configured = new Map(input.profileSettings?.palaces.map((item) => [item.name, item]) || []);
  const palaces = FACE_PALACE_NAMES.map((name) =>
    name === "財帛宮"
      ? buildPalace(vision, name, treasury, `${treasury.band}_V2`)
      : buildPalace(vision, name, configured.has(name) ? { ...PALACE_MAPPINGS[name], ...configured.get(name)! } : PALACE_MAPPINGS[name], "V2")
  );

  const limited = palaces.filter((item) => item.status === "limited").length;
  const watched = palaces.filter((item) => item.status === "watch").length;
  const overallStatus: RuleStatus = limited > 3 ? "limited" : watched > 3 ? "watch" : "balanced";

  const overallTrend: RuleItem = {
    ruleId: "OVERALL_VISIBLE_BALANCE_V2",
    text:
      overallStatus === "balanced"
        ? "可見區域整體均衡，建議以趨勢觀察與實際行動交叉驗證。"
        : overallStatus === "watch"
          ? "部分可見區域形態判讀不完整或左右差異明顯，解讀應保留彈性。"
          : "多個區域可見度或信心度不足，不適合進行進一步解讀。",
    evidence: [
      {
        region: "landmarks",
        field: "overallConfidence",
        observed: vision.overallConfidence,
        confidence: vision.overallConfidence
      }
    ]
  };

  const observations: RuleItem[] = (Object.keys(vision.regions) as RegionName[]).map((region) => {
    const value = vision.regions[region];
    return {
      ruleId: `OBS_${region.toUpperCase()}_V2`,
      text: `${FEATURE_LABELS[region]}：輪廓${CONTOUR_LABELS[value.contour]}、寬度${WIDTH_LABELS[value.relativeWidth]}、長度${HEIGHT_LABELS[value.relativeHeight]}、左右${SYMMETRY_LABELS[value.symmetry]}。`,
      evidence: morphologyEvidence(vision, region)
    };
  });

  const cautions: RuleItem[] = [];
  if (vision.limitations.length > 0 || vision.overallConfidence < FACE_RULE_MIN_CONFIDENCE) {
    cautions.push({
      ruleId: "CAUTION_CAPTURE_LIMITATIONS_V1",
      text: "拍攝條件有限制，報告只能就清楚可見的部分提供文化性參考。",
      evidence: [
        {
          region: "landmarks",
          field: "overallConfidence",
          observed: vision.overallConfidence,
          confidence: vision.overallConfidence
        }
      ]
    });
  }
  const unevenRegions = (Object.keys(vision.regions) as RegionName[]).filter(
    (region) => vision.regions[region].illumination !== "even"
  );
  if (unevenRegions.length >= 3) {
    cautions.push({
      ruleId: "CAUTION_UNEVEN_ILLUMINATION_V2",
      text: "多個區域光線不均，形態觀察可能受陰影影響，建議改以均勻光線重拍比對。",
      evidence: unevenRegions.map((region) => ({
        region,
        field: "illumination",
        observed: vision.regions[region].illumination,
        confidence: vision.regions[region].confidence
      }))
    });
  }

  const actionPlan: RuleItem[] = [30, 60, 90].map((days) => ({
    ruleId: `ACTION_${days}_DAY_REVIEW_V1`,
    text:
      mode === "self"
        ? `${days} 天後回顧實際決策、溝通與作息記錄，不以面部觀察取代事實。`
        : `${days} 天後以實際合作紀錄回顧互動，不由面部觀察推斷他人人格或可信度。`,
    evidence: []
  }));

  const age = input.subjectAge;
  const flowYear = resolveFlowYear(vision, age);

  // 斑痣疤痕的教材原文只給老師版；會員報告拿到的是已剝除 teacherNote 的版本。
  const surfaceImpacts = mapSurfaceImpacts(vision.surfaceFeatures, age).map(
    ({ teacherNote: _teacherNote, ...rest }) => rest
  );
  const teachings = matchTeachings(vision, "member");

  // 流年落在教材四隘、或本年部位剛好有斑痣疤痕時，升級為明確提醒。
  if (flowYear) {
    for (const gate of flowYear.gates) {
      if (gate.kind !== "four_passes") continue;
      cautions.push({
        ruleId: `FLOW_YEAR_GATE_${gate.age}_V3`,
        text: `${gate.age} 歲在教材屬四隘之一：${gate.label}。教材建議這一年前後把健檢、工作與重大決定的時程排開，並以實際紀錄回顧，不作事件預測。`,
        evidence: gate.feature
          ? [{ region: gate.feature, field: "flowYearGate", observed: gate.status, confidence: featureValue(vision, gate.feature).confidence }]
          : []
      });
    }
    const currentFeatures = new Set([flowYear.seventyFive.feature, flowYear.nineValue.feature]);
    for (const impact of surfaceImpacts) {
      if (!currentFeatures.has(impact.region)) continue;
      cautions.push({
        ruleId: `FLOW_YEAR_SURFACE_${impact.region.toUpperCase()}_V3`,
        text: `本年流年正好走到${impact.regionLabel}，而這個部位在照片中觀察到${impact.typeLabel}。教材說流年部位以無痣痕紋斑為佳，建議把這一年相關的安排多留一次確認。`,
        evidence: [{ region: impact.region, field: `surface:${impact.type}`, observed: impact.description, confidence: impact.confidence }]
      });
    }
  }

  const photoFingerprint: RuleItem[] = [...vision.distinctiveFeatures]
    .sort((a, b) => (b.salience * b.confidence) - (a.salience * a.confidence))
    .slice(0, 8)
    .map((item) => ({
      ruleId: `FINGERPRINT_${item.feature.toUpperCase()}_V3`,
      text: item.observation,
      evidence: [{ region: item.region, field: `distinctive:${item.feature}`, observed: item.observation, confidence: item.confidence }]
    }));

  return {
    version: "3.0",
    mode,
    photoFingerprint,
    overallTrend,
    palaces,
    flowYear,
    surfaceImpacts,
    teachings,
    observations,
    cautions,
    actionPlan
  };
}

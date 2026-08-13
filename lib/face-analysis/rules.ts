import type { FaceAnalysisMode } from "@/lib/face-analysis/types";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

export const FACE_RULE_MIN_CONFIDENCE = 0.65;

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
  region: keyof FaceVisionResult["regions"] | "orientation" | "landmarks";
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
  version: "2.0";
  mode: FaceAnalysisMode;
  overallTrend: RuleItem;
  palaces: readonly PalaceRuleResult[];
  flowYear: RuleItem | null;
  observations: readonly RuleItem[];
  cautions: readonly RuleItem[];
  actionPlan: readonly RuleItem[];
}>;

type RegionName = keyof FaceVisionResult["regions"];
type RegionValue = FaceVisionResult["regions"][RegionName];

type PalaceMapping = Readonly<{
  parts: string;
  primary: readonly RegionName[];
  auxiliary: readonly RegionName[];
}>;

/**
 * 細部位（印堂、山根、奸門、淚堂…）在 Vision v2 之前無法直接觀察，
 * 先以現行八大區塊近似對應；主／輔劃分依 SPEC-05 對應表。
 */
const PALACE_MAPPINGS: Readonly<Record<Exclude<FacePalaceName, "財帛宮">, PalaceMapping>> = {
  命宮: { parts: "印堂（輔：兩眉）", primary: ["forehead"], auxiliary: ["eyebrows"] },
  官祿宮: { parts: "額頭中正（輔：印堂、眉眼）", primary: ["forehead"], auxiliary: ["eyebrows", "eyes"] },
  父母宮: { parts: "日月角（輔：上中府、眼眉、髮際）", primary: ["forehead"], auxiliary: ["eyebrows", "eyes"] },
  福德宮: { parts: "兩眉上緣（輔：印堂）", primary: ["eyebrows"], auxiliary: ["forehead"] },
  遷移宮: { parts: "山林驛馬／額角髮際（輔：印堂、眼神）", primary: ["forehead"], auxiliary: ["eyes"] },
  兄弟宮: { parts: "眉毛（輔:顴骨）", primary: ["eyebrows"], auxiliary: ["cheeks"] },
  夫妻宮: { parts: "眼尾奸門（輔：眉、眼、鼻、印堂十字帶）", primary: ["eyes"], auxiliary: ["eyebrows", "nose"] },
  子女宮: { parts: "淚堂（輔：下停地閣、眼、人中）", primary: ["eyes"], auxiliary: ["mouth", "jaw"] },
  疾厄宮: { parts: "山根（輔：鼻、眼形神氣）", primary: ["nose"], auxiliary: ["eyes"] },
  奴僕宮: { parts: "下停鼻准以下：下顎腮骨（輔：法令、地閣、口）", primary: ["jaw"], auxiliary: ["mouth", "cheeks"] },
  田宅宮: { parts: "眼瞼（輔：下巴嘴角、准圓）", primary: ["eyes"], auxiliary: ["jaw", "mouth"] }
};

/** 財帛宮三倉分年齡段（筆記 p.84-86）：天倉＝青年祖蔭、人倉 31-50＝自賺、地倉 51 起＝晚年。 */
function treasuryMapping(subjectAge: number | null | undefined): PalaceMapping & { band: string } {
  if (subjectAge != null && subjectAge <= 30) {
    return { band: "天倉", parts: "天倉（髮際額頭；青年財，祖先父母給的）", primary: ["forehead"], auxiliary: ["eyebrows", "nose"] };
  }
  if (subjectAge != null && subjectAge >= 51) {
    return { band: "地倉", parts: "地倉（地閣懸臂；晚年財，子女晚輩）", primary: ["jaw"], auxiliary: ["mouth", "nose"] };
  }
  return { band: "人倉", parts: "人倉（眉眼鼻；中年 31-50 自賺之財）", primary: ["nose"], auxiliary: ["eyebrows", "eyes"] };
}

const REGION_LABELS: Readonly<Record<RegionName, string>> = {
  forehead: "額頭",
  eyebrows: "眉",
  eyes: "眼",
  nose: "鼻",
  cheeks: "顴頰",
  mouth: "口",
  jaw: "下顎（地閣）",
  ears: "耳"
};

const CONTOUR_LABELS: Readonly<Record<RegionValue["contour"], string>> = {
  rounded: "圓潤",
  straight: "平直",
  angular: "稜角分明",
  mixed: "混合",
  not_assessable: "無法判讀"
};

const WIDTH_LABELS: Readonly<Record<RegionValue["relativeWidth"], string>> = {
  narrow: "偏窄",
  medium: "適中",
  wide: "偏寬",
  not_assessable: "無法判讀"
};

const HEIGHT_LABELS: Readonly<Record<RegionValue["relativeHeight"], string>> = {
  short: "偏短",
  medium: "適中",
  long: "偏長",
  not_assessable: "無法判讀"
};

const SYMMETRY_LABELS: Readonly<Record<RegionValue["symmetry"], string>> = {
  balanced: "對稱",
  slightly_asymmetric: "略不對稱",
  asymmetric: "明顯不對稱",
  not_assessable: "無法判讀"
};

function hasMorphology(value: RegionValue): boolean {
  return (
    value.contour !== "not_assessable" ||
    value.relativeWidth !== "not_assessable" ||
    value.relativeHeight !== "not_assessable"
  );
}

function isReadable(value: RegionValue): boolean {
  return value.confidence >= FACE_RULE_MIN_CONFIDENCE && value.visibility === "clear" && hasMorphology(value);
}

function morphologyEvidence(vision: FaceVisionResult, region: RegionName): RuleEvidence[] {
  const value = vision.regions[region];
  return [
    { region, field: "contour", observed: value.contour, confidence: value.confidence },
    { region, field: "relativeWidth", observed: value.relativeWidth, confidence: value.confidence },
    { region, field: "relativeHeight", observed: value.relativeHeight, confidence: value.confidence },
    { region, field: "symmetry", observed: value.symmetry, confidence: value.confidence }
  ];
}

function auxiliaryEvidence(vision: FaceVisionResult, region: RegionName): RuleEvidence[] {
  const value = vision.regions[region];
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
  const primaries = mapping.primary.map((region) => vision.regions[region]);
  const readable = primaries.filter(isReadable);
  if (readable.length === 0) return "limited";
  if (readable.length < primaries.length) return "watch";
  const mapped = [...mapping.primary, ...mapping.auxiliary].map((region) => vision.regions[region]);
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
}): FaceRuleResult {
  const { vision, mode } = input;
  const treasury = treasuryMapping(input.subjectAge);

  const palaces = FACE_PALACE_NAMES.map((name) =>
    name === "財帛宮"
      ? buildPalace(vision, name, treasury, `${treasury.band}_V2`)
      : buildPalace(vision, name, PALACE_MAPPINGS[name], "V2")
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
      text: `${REGION_LABELS[region]}：輪廓${CONTOUR_LABELS[value.contour]}、寬度${WIDTH_LABELS[value.relativeWidth]}、長度${HEIGHT_LABELS[value.relativeHeight]}、左右${SYMMETRY_LABELS[value.symmetry]}。`,
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
  const flowYear =
    age == null
      ? null
      : {
          ruleId: "FLOW_YEAR_AGE_BAND_V1",
          text: `以當前 ${age} 歲對應的傳統流年區段作為回顧提示，不作事件預測。`,
          evidence: []
        };

  return {
    version: "2.0",
    mode,
    overallTrend,
    palaces,
    flowYear,
    observations,
    cautions,
    actionPlan
  };
}

import type { FaceAnalysisMode } from "@/lib/face-analysis/types";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

export const FACE_RULE_MIN_CONFIDENCE = 0.65;

export const FACE_PALACE_NAMES = [
  "命宮",
  "財帛宮",
  "兄弟宮",
  "田宅宮",
  "男女宮",
  "奴僕宮",
  "妻妾宮",
  "疾厄宮",
  "遷移宮",
  "官祿宮",
  "福德宮",
  "相貌宮"
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
  status: RuleStatus;
  ruleId: string;
  evidence: readonly RuleEvidence[];
}>;

export type FaceRuleResult = Readonly<{
  version: "1.0";
  mode: FaceAnalysisMode;
  overallTrend: RuleItem;
  palaces: readonly PalaceRuleResult[];
  flowYear: RuleItem | null;
  observations: readonly RuleItem[];
  cautions: readonly RuleItem[];
  actionPlan: readonly RuleItem[];
}>;

type RegionName = keyof FaceVisionResult["regions"];

const PALACE_REGION: Readonly<Record<FacePalaceName, RegionName>> = {
  命宮: "forehead",
  財帛宮: "nose",
  兄弟宮: "eyebrows",
  田宅宮: "eyes",
  男女宮: "eyes",
  奴僕宮: "jaw",
  妻妾宮: "eyes",
  疾厄宮: "nose",
  遷移宮: "forehead",
  官祿宮: "forehead",
  福德宮: "cheeks",
  相貌宮: "mouth"
};

function regionEvidence(vision: FaceVisionResult, region: RegionName): RuleEvidence[] {
  const value = vision.regions[region];
  return [
    { region, field: "visibility", observed: value.visibility, confidence: value.confidence },
    { region, field: "symmetry", observed: value.symmetry, confidence: value.confidence },
    { region, field: "illumination", observed: value.illumination, confidence: value.confidence }
  ];
}

function regionStatus(vision: FaceVisionResult, region: RegionName): RuleStatus {
  const value = vision.regions[region];
  if (value.confidence < FACE_RULE_MIN_CONFIDENCE || value.visibility !== "clear") return "limited";
  if (value.illumination !== "even" || value.symmetry === "asymmetric") return "watch";
  return "balanced";
}

/** Deterministic interpretation of validated, visible geometry only. */
export function applyFaceRules(input: {
  vision: FaceVisionResult;
  mode: FaceAnalysisMode;
  subjectAge?: number | null;
}): FaceRuleResult {
  const { vision, mode } = input;
  const palaces = FACE_PALACE_NAMES.map((name) => {
    const region = PALACE_REGION[name];
    return {
      name,
      status: regionStatus(vision, region),
      ruleId: `PALACE_${name}_${region}`,
      evidence: regionEvidence(vision, region)
    } satisfies PalaceRuleResult;
  });

  const limited = palaces.filter((item) => item.status === "limited").length;
  const watched = palaces.filter((item) => item.status === "watch").length;
  const overallStatus: RuleStatus = limited > 3 ? "limited" : watched > 3 ? "watch" : "balanced";

  const overallTrend: RuleItem = {
    ruleId: "OVERALL_VISIBLE_BALANCE_V1",
    text:
      overallStatus === "balanced"
        ? "可見區域整體均衡，建議以趨勢觀察與實際行動交叉驗證。"
        : overallStatus === "watch"
          ? "部分可見區域受光線或左右差異影響，解讀應保留彈性。"
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

  const observations: RuleItem[] = (Object.keys(vision.regions) as RegionName[]).map((region) => ({
    ruleId: `OBS_${region.toUpperCase()}_V1`,
    text: `${region} 區域的可見度為 ${vision.regions[region].visibility}，對稱觀察為 ${vision.regions[region].symmetry}。`,
    evidence: regionEvidence(vision, region)
  }));

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
    version: "1.0",
    mode,
    overallTrend,
    palaces,
    flowYear,
    observations,
    cautions,
    actionPlan
  };
}


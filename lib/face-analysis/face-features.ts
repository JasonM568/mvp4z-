import type { FaceVisionResult } from "@/lib/face-analysis/vision";

/** 規則層採信 Vision 觀察值的最低信心度。 */
export const FACE_RULE_MIN_CONFIDENCE = 0.65;

export type RegionName = keyof FaceVisionResult["regions"];
export type DetailName = keyof FaceVisionResult["details"];
export type FaceFeatureName = RegionName | DetailName;
export type RegionValue = FaceVisionResult["regions"][RegionName];
export type FeatureValue = RegionValue | FaceVisionResult["details"][DetailName];

export const FEATURE_LABELS: Readonly<Record<FaceFeatureName, string>> = {
  forehead: "額頭",
  eyebrows: "眉",
  eyes: "眼",
  nose: "鼻",
  cheeks: "顴頰",
  mouth: "口",
  jaw: "下顎（地閣）",
  ears: "耳",
  glabella: "印堂",
  nasalRoot: "山根",
  outerEyeCorners: "奸門",
  tearTroughs: "淚堂",
  philtrum: "人中",
  chin: "地閣"
};

export const CONTOUR_LABELS: Readonly<Record<RegionValue["contour"], string>> = {
  rounded: "圓潤",
  straight: "平直",
  angular: "稜角分明",
  mixed: "混合",
  not_assessable: "無法判讀"
};

export const WIDTH_LABELS: Readonly<Record<RegionValue["relativeWidth"], string>> = {
  narrow: "偏窄",
  medium: "適中",
  wide: "偏寬",
  not_assessable: "無法判讀"
};

export const HEIGHT_LABELS: Readonly<Record<RegionValue["relativeHeight"], string>> = {
  short: "偏短",
  medium: "適中",
  long: "偏長",
  not_assessable: "無法判讀"
};

export const SYMMETRY_LABELS: Readonly<Record<RegionValue["symmetry"], string>> = {
  balanced: "對稱",
  slightly_asymmetric: "略不對稱",
  asymmetric: "明顯不對稱",
  not_assessable: "無法判讀"
};

export function featureValue(vision: FaceVisionResult, feature: FaceFeatureName): FeatureValue {
  if (feature in vision.details) return vision.details[feature as DetailName];
  return vision.regions[feature as RegionName];
}

export function hasMorphology(value: FeatureValue): boolean {
  return (
    value.contour !== "not_assessable" ||
    value.relativeWidth !== "not_assessable" ||
    value.relativeHeight !== "not_assessable"
  );
}

export function isReadable(value: FeatureValue): boolean {
  return value.confidence >= FACE_RULE_MIN_CONFIDENCE && value.visibility === "clear" && hasMorphology(value);
}

/** 以繁體中文描述一個部位的形態，供規則文字與報告引用。 */
export function describeMorphology(value: FeatureValue): string {
  return `輪廓${CONTOUR_LABELS[value.contour]}、寬度${WIDTH_LABELS[value.relativeWidth]}、長度${HEIGHT_LABELS[value.relativeHeight]}、左右${SYMMETRY_LABELS[value.symmetry]}`;
}

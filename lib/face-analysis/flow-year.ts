import {
  describeMorphology,
  featureValue,
  isReadable,
  FACE_RULE_MIN_CONFIDENCE,
  FEATURE_LABELS,
  type FaceFeatureName
} from "@/lib/face-analysis/face-features";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

/**
 * 沈全榮老師教材流年技法（283 頁筆記 p.11–13）。
 *
 * 三個確定性資料表，全部照錄教材，不由模型推導：
 * - 七十五部位流年法：p.11 流年部位表，1–99 歲逐歲對應部位，百歲週而復始。
 * - 九值流年法：p.11 九宮配置（額1、印堂2、嘴3、左耳4、左眼5、印堂上6、右眉7、右眼8、右耳9），
 *   以九為倍數取餘數，餘 0 視為 9。
 * - 三關四隘：p.12–13，三關 15／25／35，四隘 41 山根、51 人中、61 承漿、71 地閣。
 *
 * 併看法（p.11）：兩法同時參照，以當陽十三部位為準。本模組只輸出「教材指向哪些部位、
 * 本張照片這些部位是否可判讀」，不輸出事件預測、吉凶斷定或健康結論。
 */

export type FlowYearMethod = "seventy_five_regions" | "nine_value";

/** 當陽十三部位（p.10–11）：主；左右兩側為客。當陽有破會影響兩側。 */
export const CENTRAL_THIRTEEN_POSITIONS = [
  "天中",
  "天庭",
  "司空",
  "中正",
  "印堂",
  "山根",
  "年上",
  "壽上",
  "準頭",
  "人中",
  "水星",
  "承漿",
  "地閣"
] as const;

type PositionSpec = Readonly<{
  from: number;
  to: number;
  position: string;
  feature: FaceFeatureName;
}>;

/** p.11 流年部位表，逐字照錄教材的歲數與部位對應。 */
const SEVENTY_FIVE_TABLE: readonly PositionSpec[] = [
  { from: 1, to: 2, position: "天輪", feature: "ears" },
  { from: 3, to: 4, position: "天城", feature: "ears" },
  { from: 5, to: 7, position: "天廓", feature: "ears" },
  { from: 8, to: 9, position: "天輪", feature: "ears" },
  { from: 10, to: 11, position: "人輪", feature: "ears" },
  { from: 12, to: 14, position: "地輪", feature: "ears" },
  { from: 15, to: 15, position: "火星", feature: "forehead" },
  { from: 16, to: 16, position: "天中", feature: "forehead" },
  { from: 17, to: 17, position: "日角", feature: "forehead" },
  { from: 18, to: 18, position: "月角", feature: "forehead" },
  { from: 19, to: 19, position: "天庭", feature: "forehead" },
  { from: 20, to: 21, position: "輔角", feature: "forehead" },
  { from: 22, to: 22, position: "司空", feature: "forehead" },
  { from: 23, to: 24, position: "邊城", feature: "forehead" },
  { from: 25, to: 25, position: "中正", feature: "forehead" },
  { from: 26, to: 26, position: "丘陵", feature: "forehead" },
  { from: 27, to: 27, position: "塚墓", feature: "forehead" },
  { from: 28, to: 28, position: "印堂", feature: "glabella" },
  { from: 29, to: 30, position: "山林", feature: "forehead" },
  { from: 31, to: 31, position: "凌雲", feature: "eyebrows" },
  { from: 32, to: 32, position: "紫氣", feature: "eyebrows" },
  { from: 33, to: 33, position: "繁霞", feature: "eyebrows" },
  { from: 34, to: 34, position: "彩霞", feature: "eyebrows" },
  { from: 35, to: 35, position: "太陽", feature: "eyes" },
  { from: 36, to: 36, position: "太陰", feature: "eyes" },
  { from: 37, to: 37, position: "中陽", feature: "eyes" },
  { from: 38, to: 38, position: "中陰", feature: "eyes" },
  { from: 39, to: 39, position: "少陽", feature: "eyes" },
  { from: 40, to: 40, position: "少陰", feature: "eyes" },
  { from: 41, to: 41, position: "山根", feature: "nasalRoot" },
  { from: 42, to: 42, position: "精舍", feature: "nasalRoot" },
  { from: 43, to: 43, position: "光殿", feature: "nasalRoot" },
  { from: 44, to: 44, position: "年上", feature: "nose" },
  { from: 45, to: 45, position: "壽上", feature: "nose" },
  { from: 46, to: 47, position: "顴", feature: "cheeks" },
  { from: 48, to: 48, position: "準頭", feature: "nose" },
  { from: 49, to: 49, position: "蘭臺", feature: "nose" },
  { from: 50, to: 50, position: "廷尉", feature: "nose" },
  { from: 51, to: 51, position: "人中", feature: "philtrum" },
  { from: 52, to: 53, position: "仙庫", feature: "philtrum" },
  { from: 54, to: 54, position: "食倉", feature: "mouth" },
  { from: 55, to: 55, position: "祿倉", feature: "mouth" },
  { from: 56, to: 57, position: "法令", feature: "mouth" },
  { from: 58, to: 59, position: "虎耳", feature: "jaw" },
  { from: 60, to: 60, position: "水星", feature: "mouth" },
  { from: 61, to: 61, position: "乘漿", feature: "chin" },
  { from: 62, to: 63, position: "地庫", feature: "chin" },
  { from: 64, to: 64, position: "陂池", feature: "jaw" },
  { from: 65, to: 65, position: "鵝鴨", feature: "jaw" },
  { from: 66, to: 67, position: "金縷", feature: "jaw" },
  { from: 68, to: 69, position: "歸來", feature: "chin" },
  { from: 70, to: 70, position: "頌堂", feature: "chin" },
  { from: 71, to: 71, position: "地閣", feature: "chin" },
  { from: 72, to: 73, position: "奴僕", feature: "jaw" },
  { from: 74, to: 75, position: "腮", feature: "jaw" },
  { from: 76, to: 77, position: "子", feature: "chin" },
  { from: 78, to: 79, position: "丑", feature: "chin" },
  { from: 80, to: 81, position: "寅", feature: "jaw" },
  { from: 82, to: 83, position: "卯", feature: "jaw" },
  { from: 84, to: 85, position: "辰", feature: "jaw" },
  { from: 86, to: 87, position: "巳", feature: "jaw" },
  { from: 88, to: 89, position: "午", feature: "chin" },
  { from: 90, to: 91, position: "未", feature: "chin" },
  { from: 92, to: 93, position: "申", feature: "jaw" },
  { from: 94, to: 95, position: "酉", feature: "jaw" },
  { from: 96, to: 97, position: "戌", feature: "jaw" },
  { from: 98, to: 99, position: "亥", feature: "chin" }
];

/** p.11 九值流年法九宮配置，逐字照錄教材圖示。 */
const NINE_VALUE_TABLE: Readonly<Record<number, { position: string; feature: FaceFeatureName; side: "left" | "right" | "center" }>> = {
  1: { position: "額", feature: "forehead", side: "center" },
  2: { position: "印堂", feature: "glabella", side: "center" },
  3: { position: "嘴", feature: "mouth", side: "center" },
  4: { position: "左耳", feature: "ears", side: "left" },
  5: { position: "左眼", feature: "eyes", side: "left" },
  6: { position: "印堂上", feature: "forehead", side: "center" },
  7: { position: "右眉", feature: "eyebrows", side: "right" },
  8: { position: "右眼", feature: "eyes", side: "right" },
  9: { position: "右耳", feature: "ears", side: "right" }
};

/** 三關（p.12–13）：15、25、35。 */
const THREE_GATES: Readonly<Record<number, string>> = {
  15: "火星關（15 歲前看髮際與髮尖是否平整）",
  25: "中正關（25 至 35 為自主學習期的起點）",
  35: "太陽關（35 之後由自主學習轉為知識傳遞）"
};

/** 四隘（p.12–13）：41 山根、51 人中、61 承漿、71 地閣。 */
const FOUR_PASSES: Readonly<Record<number, { position: string; feature: FaceFeatureName; theme: string }>> = {
  41: { position: "山根", feature: "nasalRoot", theme: "老師列為健康與事業的關卡年" },
  51: { position: "人中", feature: "philtrum", theme: "老師列為健康與事業的關卡年" },
  61: { position: "承漿", feature: "chin", theme: "老師列為健康的關卡年" },
  71: { position: "地閣", feature: "chin", theme: "老師列為健康的關卡年" }
};

export type FlowYearPositionReading = Readonly<{
  method: FlowYearMethod;
  age: number;
  position: string;
  /** 該部位是否屬當陽十三部位（主）。 */
  central: boolean;
  feature: FaceFeatureName;
  featureLabel: string;
  /** 本張照片該部位的可判讀狀態。 */
  status: "readable" | "partial" | "unreadable";
  morphology: string;
  confidence: number;
}>;

export type FlowYearGate = Readonly<{
  kind: "three_gates" | "four_passes";
  age: number;
  label: string;
  feature: FaceFeatureName | null;
  status: "readable" | "partial" | "unreadable" | "not_applicable";
}>;

export type FlowYearResult = Readonly<{
  age: number;
  /** 七十五部位流年法本年部位。 */
  seventyFive: FlowYearPositionReading;
  /** 九值流年法本年部位。 */
  nineValue: FlowYearPositionReading;
  /** 併看法結論（p.11：以當陽為準）。 */
  crossCheck: Readonly<{ verdict: "aligned" | "central_prevails" | "peripheral_only" | "both_limited"; text: string }>;
  /** 本年是否落在三關或四隘。 */
  gates: readonly FlowYearGate[];
  /** 前後各兩年的部位，供使用者對照回顧。 */
  neighbors: readonly Readonly<{ age: number; position: string }>[];
}>;

/** 教材為 1–99 歲，百歲週而復始（p.11）。 */
function normalizeAge(age: number): number {
  const wrapped = age % 100;
  return wrapped === 0 ? 100 : wrapped;
}

export function seventyFivePosition(age: number): { position: string; feature: FaceFeatureName } {
  const normalized = normalizeAge(age);
  const match = SEVENTY_FIVE_TABLE.find((entry) => normalized >= entry.from && normalized <= entry.to);
  // 100 歲落在表外，依教材「百歲週而復始」回到起始部位。
  return match ? { position: match.position, feature: match.feature } : { position: "天輪", feature: "ears" };
}

export function nineValuePosition(age: number): { position: string; feature: FaceFeatureName; remainder: number } {
  const remainder = age % 9 === 0 ? 9 : age % 9;
  const entry = NINE_VALUE_TABLE[remainder];
  return { position: entry.position, feature: entry.feature, remainder };
}

function readPosition(
  vision: FaceVisionResult,
  method: FlowYearMethod,
  age: number,
  position: string,
  feature: FaceFeatureName
): FlowYearPositionReading {
  const value = featureValue(vision, feature);
  const status = isReadable(value)
    ? ("readable" as const)
    : value.confidence >= FACE_RULE_MIN_CONFIDENCE && value.visibility !== "obscured"
      ? ("partial" as const)
      : ("unreadable" as const);
  return {
    method,
    age,
    position,
    central: (CENTRAL_THIRTEEN_POSITIONS as readonly string[]).includes(position),
    feature,
    featureLabel: FEATURE_LABELS[feature],
    status,
    morphology: describeMorphology(value),
    confidence: value.confidence
  };
}

/**
 * 併看法（p.11）：七十五部位與九值兩法同時參照。
 * 教材原則是「以當陽為準」——當陽部位可判讀且清楚時，其結論權重高於兩側部位。
 * 這裡只表達「兩法指向的部位在本張照片是否都看得清楚」，不做吉凶加權。
 */
function crossCheck(seventyFive: FlowYearPositionReading, nineValue: FlowYearPositionReading) {
  const bothReadable = seventyFive.status === "readable" && nineValue.status === "readable";
  const bothUnreadable = seventyFive.status === "unreadable" && nineValue.status === "unreadable";
  const central = seventyFive.central ? seventyFive : nineValue.central ? nineValue : null;

  if (bothReadable) {
    return {
      verdict: "aligned" as const,
      text: `七十五部位流年法走${seventyFive.position}、九值流年法走${nineValue.position}，兩個部位在本張照片都清楚可判讀，可依老師的併看法交互對照。`
    };
  }
  if (bothUnreadable) {
    return {
      verdict: "both_limited" as const,
      text: `本年對應的${seventyFive.position}與${nineValue.position}在這張照片都不夠清楚，老師的併看法無法成立，建議以正面均勻光線重拍再看。`
    };
  }
  if (central && central.status === "readable") {
    return {
      verdict: "central_prevails" as const,
      text: `本年兩法分別走${seventyFive.position}與${nineValue.position}，其中${central.position}屬當陽十三部位且清楚可判讀。老師的併看法以當陽為準，另一個部位判讀不完整時，以當陽這一組觀察為主。`
    };
  }
  return {
    verdict: "peripheral_only" as const,
    text: `本年兩法分別走${seventyFive.position}與${nineValue.position}，當陽部位在本張照片判讀不完整，只能就看得清楚的那一組作參考，權重應予保留。`
  };
}

function resolveGates(vision: FaceVisionResult, age: number): FlowYearGate[] {
  const gates: FlowYearGate[] = [];
  const gateLabel = THREE_GATES[age];
  if (gateLabel) {
    gates.push({ kind: "three_gates", age, label: gateLabel, feature: null, status: "not_applicable" });
  }
  const pass = FOUR_PASSES[age];
  if (pass) {
    const value = featureValue(vision, pass.feature);
    gates.push({
      kind: "four_passes",
      age,
      label: `${pass.position}隘（${pass.theme}）`,
      feature: pass.feature,
      status: isReadable(value) ? "readable" : value.visibility === "obscured" ? "unreadable" : "partial"
    });
  }
  return gates;
}

export function resolveFlowYear(vision: FaceVisionResult, age: number | null | undefined): FlowYearResult | null {
  if (age == null || !Number.isFinite(age) || age < 1 || age > 120) return null;
  const rounded = Math.floor(age);
  const seventyFiveSpec = seventyFivePosition(rounded);
  const nineValueSpec = nineValuePosition(rounded);
  const seventyFive = readPosition(vision, "seventy_five_regions", rounded, seventyFiveSpec.position, seventyFiveSpec.feature);
  const nineValue = readPosition(vision, "nine_value", rounded, nineValueSpec.position, nineValueSpec.feature);

  const neighbors = [-2, -1, 1, 2]
    .map((offset) => rounded + offset)
    .filter((value) => value >= 1 && value <= 120)
    .map((value) => ({ age: value, position: seventyFivePosition(value).position }));

  return {
    age: rounded,
    seventyFive,
    nineValue,
    crossCheck: crossCheck(seventyFive, nineValue),
    gates: resolveGates(vision, rounded),
    neighbors
  };
}

/** 反查某部位在七十五部位流年法對應的歲數，供斑痣疤痕標注流年。 */
export function flowYearAgesForFeature(feature: FaceFeatureName): number[] {
  const ages: number[] = [];
  for (const entry of SEVENTY_FIVE_TABLE) {
    if (entry.feature !== feature) continue;
    for (let age = entry.from; age <= entry.to; age += 1) ages.push(age);
  }
  return ages;
}

/** 反查某部位在七十五部位流年法對應的部位名稱清單。 */
export function flowYearPositionsForFeature(feature: FaceFeatureName): { position: string; from: number; to: number }[] {
  return SEVENTY_FIVE_TABLE.filter((entry) => entry.feature === feature).map((entry) => ({
    position: entry.position,
    from: entry.from,
    to: entry.to
  }));
}

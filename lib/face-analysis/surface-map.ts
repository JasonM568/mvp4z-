import { flowYearPositionsForFeature } from "@/lib/face-analysis/flow-year";
import { FEATURE_LABELS, type FaceFeatureName } from "@/lib/face-analysis/face-features";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

/**
 * 斑、痣、疤、痕的部位對應（沈全榮老師教材）。
 *
 * 分流原則（2026-08-19 使用者拍板）：
 * - 六親關係與財運：依教材直接寫進會員報告，語氣為民俗說法。
 * - 自身健康：會員報告只給「部位、對應宮位、建議以健檢核對」，不寫教材的臟腑與疾病原文。
 *   教材原文放 teacherNote，只供老師版與內部稽核，永遠不進 AI 會員報告。
 *
 * 每筆都標教材出處頁碼；沒有出處的不寫。
 */

export type SurfaceTheme = "六親" | "財運" | "健康";
export type SurfaceRegion = FaceVisionResult["surfaceFeatures"][number]["region"];

export type SurfaceMapping = Readonly<{
  palaces: readonly string[];
  themes: readonly SurfaceTheme[];
  /** 可進會員報告的民俗說法（六親／財運）。健康一律不在這裡寫病名。 */
  memberNote: string;
  /** 老師原文摘要，只給老師版與稽核，不進會員報告。 */
  teacherNote: string;
  /** 教材明確點名的流年歲數。 */
  flowYearAges: readonly number[];
  sourcePages: readonly string[];
}>;

export const BUILT_IN_SURFACE_MAPPINGS: Readonly<Record<SurfaceRegion, SurfaceMapping>> = {
  forehead: {
    palaces: ["官祿宮", "父母宮", "遷移宮", "財帛宮（天倉）"],
    themes: ["六親", "財運"],
    memberNote:
      "額頭屬官祿宮與父母宮，也是財帛宮的天倉（青年財、祖蔭）。老師認為當陽十三部位在額頭這一段有破損時，會連帶影響與長輩、上司的相處，年少階段也較奔波。",
    teacherNote:
      "教材：當陽十三部位受傷，破陷最嚴重是表皮加上骨骼受傷；額頭受傷甚至會影響到父母親運勢，可能是祖德不好。女生有疤痕，容易與婆婆有爭端。中正有破，28、31、32、33、34 流年不好。",
    flowYearAges: [28, 31, 32, 33, 34],
    sourcePages: ["283 頁筆記 p.10–11"]
  },
  glabella: {
    palaces: ["命宮"],
    themes: ["六親", "財運"],
    memberNote:
      "印堂是命宮，位於當陽十三部位正中央。老師說印堂有痣要留意人際上的小人干擾與較大的錢財損失，並建議用九值流年法與七十五部位流年法交互印證再下判斷。",
    teacherNote:
      "教材：印堂是在當陽十三部位正中間，有痣會遇到小人；錢財重大虧損；六曜星紫氣在印堂；要用九值流年法、七十五部位交互應證；印堂痣與祖德有關。",
    flowYearAges: [28],
    sourcePages: ["283 頁筆記 p.49–96 印堂段"]
  },
  eyebrows: {
    palaces: ["兄弟宮", "福德宮"],
    themes: ["六親", "財運"],
    memberNote:
      "眉屬兄弟宮。老師認為眉毛有傷痕與手足失和有關，眉毛有痣則常對應兄弟之間金錢借貸傷及情感，對應流年約在 31 至 34 歲這一段。",
    teacherNote:
      "教材：眉毛傷痕，兄弟姐妹鬩牆，看流年是 31、32、33、34。眉毛有痣，兄弟錢財借貸傷情感、兄弟鬩牆，痣越大影響比較明顯。（同段另有壽元相關敘述，列 CRITICAL，不入會員報告。）",
    flowYearAges: [31, 32, 33, 34],
    sourcePages: ["283 頁筆記 p.49–96 眉毛段"]
  },
  eyes: {
    palaces: ["田宅宮", "夫妻宮"],
    themes: ["六親", "財運"],
    memberNote:
      "眼與眼瞼屬田宅宮，也是夫妻宮的輔看部位。老師提到眼部這一段對應流年 35 至 40 歲，其中 37、38 歲常用來對照感情與財務上的變動。",
    teacherNote: "教材：眼球出問題，37、38 至少會應證婚姻、意外、財務（變動）。",
    flowYearAges: [35, 36, 37, 38, 39, 40],
    sourcePages: ["283 頁筆記 p.11"]
  },
  outerEyeCorners: {
    palaces: ["夫妻宮"],
    themes: ["六親"],
    memberNote:
      "眼尾奸門是夫妻宮的主看部位。老師以奸門豐盈平整為傳統正向條件，此處有痕跡時建議把它當成「多留意伴侶溝通」的提醒，不能單憑一張照片論斷婚姻結果。",
    teacherNote: "教材：夫妻宮以奸門為主，須交叉眉、眼、鼻、印堂十字帶；奸門有紋痕主感情波折（相關定論條目列 CRITICAL）。",
    flowYearAges: [],
    sourcePages: ["十二宮講義 p.10–13"]
  },
  tearTroughs: {
    palaces: ["子女宮"],
    themes: ["六親"],
    memberNote:
      "淚堂是子女宮的主看部位。老師把這一區視為與晚輩、子女相處的觀察點，有斑痕時作為關係上的提醒，不推定子女的命運。",
    teacherNote: "教材：子女宮看淚堂，交叉人中、地閣。（生育相關條目列 CRITICAL，不入會員報告。）",
    flowYearAges: [],
    sourcePages: ["283 頁筆記 p.86–90"]
  },
  nasalRoot: {
    palaces: ["疾厄宮"],
    themes: ["健康", "六親"],
    memberNote:
      "山根是疾厄宮的主看部位，也是四隘中的 41 歲關卡。老師把這一段列為健康與事業的關卡年，建議以實際健檢與作息紀錄核對，本報告不對疾病或器官下任何判斷。",
    teacherNote:
      "教材：四隘 41 山根主健康事業；女子鼻子傷痕，鼻梁骨傷痕導致山根橫斷，工作換到不好的，看流年 41、45、48。（望診健康原文整區列 CRITICAL，僅老師內部審核。）",
    flowYearAges: [41, 42, 43],
    sourcePages: ["283 頁筆記 p.12–13", "283 頁筆記 p.78–84"]
  },
  nose: {
    palaces: ["財帛宮（人倉）", "疾厄宮"],
    themes: ["財運", "健康"],
    memberNote:
      "鼻屬財帛宮的人倉（31 至 50 歲自賺之財）。老師說鼻樑有痣對應流年 44 至 47 容易有金錢損耗，鼻準有痣則對應流年 48。這一段同時也是疾厄宮的交叉部位，健康面只建議以健檢核對。",
    teacherNote:
      "教材：鼻樑有痣，44~47 流年所在，會損財。鼻准痣，流年 48。朝天鼻 48、49、50 流年損財。鼻子屬於 41~50 歲流年運。（意外災變與健康敘述列 CRITICAL。）",
    flowYearAges: [44, 45, 46, 47, 48, 49, 50],
    sourcePages: ["283 頁筆記 p.11", "283 頁筆記 p.49–96 鼻部段"]
  },
  cheeks: {
    palaces: ["兄弟宮（輔）", "奴僕宮（輔）"],
    themes: ["六親", "財運"],
    memberNote:
      "顴骨對應流年 46、47 歲，老師把顴視為權責與人際支持的觀察部位，也是兄弟宮的輔看處。此處有痕跡時，建議留意需要授權或協作的場合。",
    teacherNote: "教材：顴骨鼻樑雙破陷，權柄不佳，官司訴訟，倒錢，感情不好。顴骨傷痕要看其他流年部位。",
    flowYearAges: [46, 47],
    sourcePages: ["283 頁筆記 p.10–11"]
  },
  philtrum: {
    palaces: ["子女宮（輔）"],
    themes: ["六親", "財運", "健康"],
    memberNote:
      "人中對應流年 51 歲，是四隘之一；兩側仙庫對應 52 至 55 歲。老師把人中視為與晚輩關係、以及是否適合合夥投資的參考部位。健康面只建議以實際健檢核對。",
    teacherNote:
      "教材：四隘 51 人沖主健康事業。人中淺、橫紋，事業挫敗，健康滑落，看流年知道適不適合合夥投資。仙庫痣看流年 52、53、54、55。（生殖相關敘述列 CRITICAL，且 p.88 疑似誤植待老師確認。）",
    flowYearAges: [51, 52, 53, 54, 55],
    sourcePages: ["283 頁筆記 p.12–13", "283 頁筆記 p.49–96 下停段"]
  },
  mouth: {
    palaces: ["奴僕宮（輔）"],
    themes: ["六親", "財運"],
    memberNote:
      "口與周邊的食倉、祿倉、法令對應流年 54 至 60 歲，老師把這一段視為口德、飲食與部屬關係的觀察區，也與晚年的資源守成有關。",
    teacherNote: "教材：嘴局流年 56~64。法令 56、57；食倉 54；祿倉 55；水星 60。內弓牙，口開是非生。",
    flowYearAges: [54, 55, 56, 57, 60],
    sourcePages: ["283 頁筆記 p.11"]
  },
  jaw: {
    palaces: ["奴僕宮"],
    themes: ["六親", "財運"],
    memberNote:
      "下顎腮骨是奴僕宮的主看部位，對應流年 58 歲之後的下停區段。老師把這一區視為部屬、晚輩與晚年資源的觀察處，有痕跡時作為團隊與託付安排上的提醒。",
    teacherNote: "教材：奴僕宮看下停鼻准以下、下顎腮骨，輔看法令、地閣、口。虎耳 58、59；奴僕 72、73；腮 74、75。",
    flowYearAges: [58, 59, 72, 73, 74, 75],
    sourcePages: ["283 頁筆記 p.90–91", "283 頁筆記 p.11"]
  },
  chin: {
    palaces: ["財帛宮（地倉）", "子女宮（輔）"],
    themes: ["財運", "六親", "健康"],
    memberNote:
      "地閣屬財帛宮的地倉（晚年財、子女晚輩），對應流年 61 歲承漿與 71 歲地閣兩個四隘關卡。老師說下巴這一區同時看晚年資源、子女成就與生活困擾。健康面只建議以健檢與作息紀錄核對。",
    teacherNote:
      "教材：四隘 61 承漿主健康、71 地閣主健康。下巴探討健康、財運、小孩成就、困擾。地閣總論 51 起下停主晚年。（長壽與壽元敘述列 CRITICAL。）",
    flowYearAges: [61, 62, 63, 68, 69, 70, 71],
    sourcePages: ["283 頁筆記 p.11–13", "283 頁筆記 p.193–240 地閣段"]
  },
  ears: {
    palaces: ["父母宮（輔）"],
    themes: ["六親", "健康"],
    memberNote:
      "耳對應流年 1 至 14 歲的幼年段，老師以耳看幼年環境與家庭照顧狀況。此處的痕跡通常回看成長背景，不作為當前結論。健康面只建議以健檢核對。",
    teacherNote: "教材：耳朵總論看健康壽命個性；耳朵三停上停年輕祿、中停中年健康福、下停部署子女包容力健康壽。（耳骿、耳朵氣色與臟腑對應整段列 CRITICAL。）",
    flowYearAges: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    sourcePages: ["283 頁筆記 p.13"]
  }
};

export type SurfaceImpact = Readonly<{
  type: FaceVisionResult["surfaceFeatures"][number]["type"];
  typeLabel: string;
  region: SurfaceRegion;
  regionLabel: string;
  side: FaceVisionResult["surfaceFeatures"][number]["side"];
  sideLabel: string;
  prominence: FaceVisionResult["surfaceFeatures"][number]["prominence"];
  description: string;
  palaces: readonly string[];
  themes: readonly SurfaceTheme[];
  /** 進會員報告的民俗說法。 */
  memberNote: string;
  /** 老師原文摘要，只給老師版；`generateFaceReport` 不得傳給模型。 */
  teacherNote: string;
  /** 該部位在七十五部位流年法的歲數區段。 */
  flowYearPositions: readonly Readonly<{ position: string; from: number; to: number }>[];
  /** 教材明確點名的流年歲數。 */
  flowYearAges: readonly number[];
  /** 本次受檢者年齡是否正好落在該部位的流年段。 */
  hitsCurrentAge: boolean;
  sourcePages: readonly string[];
  confidence: number;
}>;

const TYPE_LABELS: Readonly<Record<SurfaceImpact["type"], string>> = {
  spot: "斑",
  mole: "痣",
  scar: "疤",
  mark: "痕"
};

const SIDE_LABELS: Readonly<Record<SurfaceImpact["side"], string>> = {
  left: "左側",
  right: "右側",
  center: "中央",
  bilateral: "兩側",
  not_assessable: "位置無法判定"
};

/**
 * 把 Vision 抓到的表面特徵對應到宮位、主題與流年。
 * 全部為查表結果，不含模型推論。
 */
export function mapSurfaceImpacts(
  surfaceFeatures: FaceVisionResult["surfaceFeatures"],
  subjectAge: number | null | undefined,
  mappings: Readonly<Record<SurfaceRegion, SurfaceMapping>> = BUILT_IN_SURFACE_MAPPINGS
): SurfaceImpact[] {
  return surfaceFeatures.map((feature) => {
    const mapping = mappings[feature.region] || BUILT_IN_SURFACE_MAPPINGS[feature.region];
    const flowYearPositions = flowYearPositionsForFeature(feature.region);
    const hitsCurrentAge =
      subjectAge != null &&
      flowYearPositions.some((entry) => subjectAge >= entry.from && subjectAge <= entry.to);
    return {
      type: feature.type,
      typeLabel: TYPE_LABELS[feature.type],
      region: feature.region,
      regionLabel: FEATURE_LABELS[feature.region],
      side: feature.side,
      sideLabel: SIDE_LABELS[feature.side],
      prominence: feature.prominence,
      description: feature.description,
      palaces: mapping.palaces,
      themes: mapping.themes,
      memberNote: mapping.memberNote,
      teacherNote: mapping.teacherNote,
      flowYearPositions,
      flowYearAges: mapping.flowYearAges,
      hitsCurrentAge,
      sourcePages: mapping.sourcePages,
      confidence: feature.confidence
    };
  });
}

/** 只保留可進會員報告的欄位；teacherNote 一律剝除。 */
export function toMemberSurfaceImpacts(impacts: readonly SurfaceImpact[]) {
  return impacts.map(({ teacherNote: _teacherNote, ...rest }) => rest);
}

import type { FaceVisionResult } from "@/lib/face-analysis/vision";

/**
 * 照片特徵指紋 → 沈師教材部位的對應。
 *
 * 為什麼需要這張表：`distinctiveFeatures` 是 Vision 對這張照片抓到的具體特徵
 * （例如「鼻頭圓潤且略微突出」），是整份報告最貼身的一段；但它原本只是把觀察文字
 * 原樣搬進報告，沒有接上任何教材——看得到部位狀況，卻不知道對應什麼事。
 *
 * `distinctiveFeatures.feature` 是 16 個結構化枚舉，粒度比十二宮的八大區塊細得多
 * （noseTip 就是準頭、就是流年 48），正好是流年需要的顆粒度。這張表把每個枚舉接上：
 * 教材部位名、所屬宮位、對應流年歲數、教材的正向條件與反向條件、出處頁碼。
 *
 * 判斷分工：部位、宮位、流年、正反向條件**全部是查表結果**，模型不能更動；
 * 只有「這次觀察到的形態比較接近哪一個條件」需要判斷，而模型只能在本表提供的
 * 正／反向條件之間選，不能自創教材說法。
 *
 * 健康：一律不寫臟腑、病名。教材中鼻准對應腸胃氣管、眉眼距離對應腸胃等敘述
 * 屬望診健康，整區 CRITICAL，不進本表。
 */

export type FingerprintFeature = FaceVisionResult["distinctiveFeatures"][number]["feature"];

type FingerprintMapping = Readonly<{
  /** 教材部位名。 */
  partName: string;
  palaces: readonly string[];
  /** 七十五部位流年法對應歲數。 */
  flowYearAges: readonly number[];
  /** 該部位在教材裡看的是什麼。 */
  looksAt: string;
  /** 教材的正向條件（相理合）。 */
  favorable: string;
  /** 教材的反向條件（相理不合）。 */
  unfavorable: string;
  source: string;
}>;

const FINGERPRINT_MAPPINGS: Readonly<Record<FingerprintFeature, FingerprintMapping>> = {
  foreheadShape: {
    partName: "額頭（天中、天庭、司空、中正一段）",
    palaces: ["官祿宮", "父母宮", "財帛宮（天倉）"],
    flowYearAges: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30],
    looksAt: "年少階段的資源與發展空間、與長輩上司的相處",
    favorable: "教材以額頭高、寬、髮際平整、沒有破相為好額；男生三至四指幅為佳。對應年少資源足、知道長上要什麼。",
    unfavorable: "額頭低窄為面積不足，年少較奔波；有髮尖為不順的一年；一高一低則年輕起伏大、好一年不好一年。",
    source: "283 頁筆記 p.10–11、p.103–113"
  },
  eyebrowShape: {
    partName: "眉（凌雲、紫氣、繁霞、彩霞）",
    palaces: ["兄弟宮", "福德宮"],
    flowYearAges: [31, 32, 33, 34],
    looksAt: "手足與同輩的相處、情緒穩定度",
    favorable: "教材以眉形秀麗、眉頭不亂、眉退印（眉離眼遠、印堂寬闊）為佳；眉尾聚者功名光彩。",
    unfavorable: "眉毛稀疏不好相處；眉散則情緒不穩；兩眉交鎖、雜紋多在教材屬不利的相理。",
    source: "283 頁筆記 p.49–96 眉毛段、p.97–144"
  },
  eyebrowTail: {
    partName: "眉尾（彩霞）",
    palaces: ["兄弟宮", "福德宮"],
    flowYearAges: [34],
    looksAt: "聚合的能力，教材同時看錢財是否留得住與情緒收放",
    favorable: "眉尾聚而不散，教材說眉尾聚者功名光彩。",
    unfavorable: "眉尾散不聚，教材說不聚財、情緒不穩定；眉無形則不聚財。",
    source: "283 頁筆記 p.49–96 眉毛段"
  },
  eyeShape: {
    partName: "眼（太陽、太陰、中陽、中陰、少陽、少陰）",
    palaces: ["田宅宮", "夫妻宮"],
    flowYearAges: [35, 36, 37, 38, 39, 40],
    looksAt: "看事情的耐性與情緒收放",
    favorable: "教材以眼形宜正不宜偏、眼如刀裁者情緒穩定、理性為佳。",
    unfavorable: "眼睛短圓對應情緒化、眼神睜露；眼形不正在教材屬需保留的相理。",
    source: "283 頁筆記 p.27–36、p.49–96 眼部段"
  },
  eyeTilt: {
    partName: "眼尾（奸門一帶）",
    palaces: ["夫妻宮", "田宅宮"],
    flowYearAges: [35, 36, 37, 38, 39, 40],
    looksAt: "情感相處的節奏與爭鬥性",
    favorable: "教材說眼尾稍微高一點還好，收尾乾淨為佳。",
    unfavorable: "眼尾太高、吊眼梢在教材屬不佳；眼尾收尾不好、魚尾紋多對應較勞累。",
    source: "283 頁筆記 p.49–96 眼部段"
  },
  eyeSpacing: {
    partName: "眉眼距離與印堂寬度",
    palaces: ["命宮", "兄弟宮"],
    flowYearAges: [28],
    looksAt: "心胸的迴旋餘地與個性的緩急",
    favorable: "教材以眉退印、印堂寬而清秀為佳，對應個性穩定、包容力強、心胸開闊，容兩指幅為標準。",
    unfavorable: "眉眼距離窄對應個性急；印堂不開、眉頭逼近則遇事迴旋空間小。",
    source: "283 頁筆記 p.97–144 印堂段"
  },
  nasalBridge: {
    partName: "鼻樑（年上、壽上）",
    palaces: ["疾厄宮", "財帛宮（人倉）"],
    flowYearAges: [44, 45],
    looksAt: "自己作主的力道，教材說鼻為自界、鼻正心正",
    favorable: "教材以鼻樑要挺、要大、鼻梁骨寬為佳；鼻正心正。",
    unfavorable: "鼻樑低陷則作主的力道要靠制度補；鼻梁骨特別尖削、只有骨頭沒有肉，教材說不發是肇因於自己。",
    source: "283 頁筆記 p.49–96 鼻部段"
  },
  noseTip: {
    partName: "準頭（鼻頭）",
    palaces: ["財帛宮（人倉）"],
    flowYearAges: [48],
    looksAt: "財帛的核心部位，教材說鼻准是財產多少",
    favorable: "教材說鼻准豐隆、鼻准大的，理財能力與賺錢能力好；52 歲以後要聚大財，也要看鼻准氣勢。",
    unfavorable: "鼻准有尖、有骨沒有肉；朝天鼻（鼻翼清楚見到鼻孔）教材說存錢能力不足、花錢能力好，48、49、50 流年損財。",
    source: "283 頁筆記 p.11、p.49–96 鼻部段"
  },
  noseWing: {
    partName: "鼻翼（左蘭臺、右廷尉）",
    palaces: ["財帛宮（人倉）"],
    flowYearAges: [49, 50],
    looksAt: "守成與人際的收放，教材說蘭台廷尉主監察",
    favorable: "教材說鼻梁骨寬、兩翼開者，人際關係融合、財務狀況面面俱到。",
    unfavorable: "兩翼不開；鼻桿窄而鼻翼開且肉薄（過冬的青蛙鼻）教材說很難賺錢但是愛花錢；兩翼不對稱則好勝心強、賭性強。",
    source: "283 頁筆記 p.49–96 鼻部段"
  },
  cheekbone: {
    partName: "顴骨",
    palaces: ["兄弟宮", "奴僕宮"],
    flowYearAges: [46, 47],
    looksAt: "權柄大小、關係複雜度與合夥投資",
    favorable: "教材說顴骨最好的是隱圓，像雞蛋藏著，笑時會有兩塊者吉，對應企圖心、外交手腕與決斷力；顴骨要對稱。",
    unfavorable: "顴骨塌陷者不是領導者、交友圈狹隘、比較顧自己；顴骨橫張則關係複雜、固執；不對稱者 44 至 50 大好大壞、起伏很大，46、47 不適合合夥投資。",
    source: "283 頁筆記 p.49–96 顴骨段"
  },
  lipShape: {
    partName: "唇（水星）",
    palaces: ["奴僕宮"],
    flowYearAges: [60],
    looksAt: "表達、意志力與賺錢能力，教材稱嘴為出納官",
    favorable: "教材說陵線分明者條理分明、分析判斷能力好、有說服力、文化水平偏高。",
    unfavorable: "嘴巴帶珠者容易惹口舌是非、個性激進急躁、吵嘴不認輸，珠越明顯越激進。",
    source: "283 頁筆記 p.49–96 嘴部段"
  },
  mouthCorner: {
    partName: "嘴角（法令以 50 歲嘴角線為分水嶺）",
    palaces: ["奴僕宮"],
    flowYearAges: [56, 57, 58, 59, 60],
    looksAt: "晚年的資源守成與部屬託付",
    favorable: "教材以開大合小為佳，嘴角要超過黑眼球外側是標準相理，超過眼尾更大。",
    unfavorable: "嘴角往下、嘴巴偏小鬆弛短小，教材說晚年挨打；若同時地閣偏尖，在託付與授權上要更小心。",
    source: "283 頁筆記 p.49–96 嘴部段"
  },
  philtrumShape: {
    partName: "人中",
    palaces: ["子女宮"],
    flowYearAges: [51, 52, 53],
    looksAt: "包容力與晚輩關係，教材也用來看適不適合合夥投資",
    favorable: "教材以人中寬、深、長、正為標準相理，對應包容力大、能付出照顧的時間比較長。",
    unfavorable: "人中淺、有橫紋或偏斜，教材說在合夥與投資上要更保守。",
    source: "283 頁筆記 p.49–96 人中段"
  },
  jawline: {
    partName: "下顎腮骨（虎耳、奴僕、腮）",
    palaces: ["奴僕宮"],
    flowYearAges: [58, 59, 72, 73, 74, 75],
    looksAt: "部屬、班底與晚年的承載力",
    favorable: "教材說下顎開闊、腮骨微朝者晚年愉快，會有自己的班底，對部屬的提拔不遺餘力。",
    unfavorable: "見不到腮骨的角，教材說底下的班底會批鬥、會有派系問題；下顎尖削則承載較弱；腮骨寬者對部屬要求嚴格，賞罰兩極。",
    source: "283 頁筆記 p.90–91、p.193–240"
  },
  chinShape: {
    partName: "地閣（下巴）",
    palaces: ["財帛宮（地倉）", "子女宮"],
    flowYearAges: [61, 71],
    looksAt: "晚年的資源與居所、子女晚輩的關係",
    favorable: "教材以地閣開闊、飽滿、骨朝為標準相理，骨要多於肉；地閣微朝對應晚年財運好、子女有出息、包容力大。",
    unfavorable: "地閣骨內縮為孤獨相，晚年要更早自己安排；下巴尖削狹窄對應固執；地閣骨左右不齊則與子女部屬易有代溝。",
    source: "283 頁筆記 p.193–240 地閣段"
  },
  earShape: {
    partName: "耳（天輪、天城、天廓、人輪、地輪）",
    palaces: ["父母宮"],
    flowYearAges: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    looksAt: "幼年的環境與家庭照顧，通常回看成長背景，不作為當前結論",
    favorable: "教材以耳正（子午垂直）、耳貼、耳厚、耳長、耳大、城廓分明為標準相理；耳正者聽得進意見、思維正向，大老闆耳正貼者多。",
    unfavorable: "反耳骨者教材說個性叛逆、不受教、容易產生盲點。",
    source: "283 頁筆記 p.13"
  }
};

export type FingerprintReading = Readonly<{
  feature: FingerprintFeature;
  /** Vision 對這張照片的原始觀察文字。 */
  observation: string;
  side: FaceVisionResult["distinctiveFeatures"][number]["side"];
  partName: string;
  palaces: readonly string[];
  looksAt: string;
  favorable: string;
  unfavorable: string;
  flowYearAges: readonly number[];
  /** 依受檢者年齡組出的流年提示。 */
  flowYearNote: string;
  /** 本年是否正好走到這個部位。 */
  hitsCurrentAge: boolean;
  source: string;
  confidence: number;
}>;

function describeAges(ages: readonly number[]): string {
  if (ages.length === 0) return "教材未對此部位標定流年歲數";
  if (ages.length === 1) return `對應流年 ${ages[0]} 歲`;
  // 連續區間收斂成「a 至 b」，非連續則逐一列出。
  const runs: Array<[number, number]> = [];
  for (const age of ages) {
    const last = runs.at(-1);
    if (last && age === last[1] + 1) last[1] = age;
    else runs.push([age, age]);
  }
  return `對應流年 ${runs.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join("、")} 歲`;
}

/**
 * 把 Vision 的照片特徵指紋接上教材部位、宮位與流年。
 * 全部為查表結果，不含任何吉凶判斷。
 */
export function mapFingerprints(
  distinctiveFeatures: FaceVisionResult["distinctiveFeatures"],
  subjectAge: number | null | undefined
): FingerprintReading[] {
  return [...distinctiveFeatures]
    .sort((a, b) => b.salience * b.confidence - a.salience * a.confidence)
    .slice(0, 8)
    .map((item) => {
      const mapping = FINGERPRINT_MAPPINGS[item.feature];
      const hitsCurrentAge = subjectAge != null && mapping.flowYearAges.includes(Math.floor(subjectAge));
      return {
        feature: item.feature,
        observation: item.observation,
        side: item.side,
        partName: mapping.partName,
        palaces: mapping.palaces,
        looksAt: mapping.looksAt,
        favorable: mapping.favorable,
        unfavorable: mapping.unfavorable,
        flowYearAges: mapping.flowYearAges,
        flowYearNote: hitsCurrentAge
          ? `${describeAges(mapping.flowYearAges)}；本年（${Math.floor(subjectAge!)} 歲）正好走到這個部位。`
          : `${describeAges(mapping.flowYearAges)}。`,
        hitsCurrentAge,
        source: mapping.source,
        confidence: item.confidence
      };
    });
}

export const FINGERPRINT_FEATURE_COUNT = Object.keys(FINGERPRINT_MAPPINGS).length;

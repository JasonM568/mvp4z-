// 巽風易學排盤引擎｜盤面型別
//
// 約束（違反會讓 golden test 與 council_runs.chart 落地失效）：
// - 全部是純資料，可 JSON.stringify，不含 class instance、Date、function。
// - 各術的盤面欄位隨該術的 Phase 加入，不預先開空欄位。
//
// 目前實作範圍：Phase 0 曆法底座與四柱、Phase 1 梅花易數、Phase 2 六爻納甲、Phase 3 奇門遁甲。

import type { Fleeting } from "./bazi/fleeting";

/** 干支。label 是「甲子」這種合寫，方便直接印進報告。 */
export type StemBranch = {
  stem: string;
  branch: string;
  label: string;
};

/** 單一柱。時辰不確定時整個 hour 柱為 null，不用「未填」字串矇混。 */
export type Pillar = {
  ganzhi: StemBranch;
};

export type FourPillars = {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  /** 時辰不確定時為 null。下游必須明確處理，不得當成空字串。 */
  hour: Pillar | null;
};

/** 真太陽時的單項修正，逐項列出讓老師可以驗算。 */
export type TimeCorrection = {
  kind: "longitude" | "equationOfTime";
  minutes: number;
  note: string;
};

export type ResolvedTime = {
  inputCalendar: "國曆" | "農曆";
  isLeapMonth: boolean;
  /** 正規化後的當地標準時（Asia/Taipei），格式 YYYY-MM-DD HH:mm:ss。 */
  civil: string;
  /** 套用真太陽時校正後的時刻；trueSolarTime=off 時為 null。 */
  trueSolar: string | null;
  longitude: number | null;
  latitude: number | null;
  placeLabel: string | null;
  corrections: TimeCorrection[];
  /** 早子 00:00–00:59 / 晚子 23:00–23:59；其餘時辰為 null。 */
  ziPeriod: "早子" | "晚子" | null;
};

/** 月令：四柱月柱所屬的節，以及距離該節的天數（Phase 1 起運要用）。 */
export type MonthOrder = {
  term: string;
  /** 該節的精確時刻，秒級。對外顯示才四捨五入到分。 */
  termAt: string;
  daysIntoTerm: number;
};

/**
 * 資料完整度。這是引擎算出來的，將取代 LLM 自評的 confidence。
 * score 0–100，missing 列出缺什麼，讓報告可以誠實說明判讀限制。
 */
export type Completeness = {
  score: number;
  missing: string[];
};

/** 一步大運。 */
export type LuckCycle = {
  /** 第幾步，從 1 起。 */
  index: number;
  ganzhi: StemBranch;
  /** 歲數區間。為「出生後經過的年數」，與虛歲差一，不要混用。 */
  fromAge: number;
  toAge: number;
  fromYear: number;
  toYear: number;
  /** 事件時刻是否落在這一步。沒有參考年時全為 false。 */
  current: boolean;
};

export type LuckCycles = {
  direction: "forward" | "backward";
  directionLabel: string;
  /** 順逆的判定依據，例如「陽年男，故順排」。讓老師與會員驗算得動。 */
  basis: string;
  /** 起運是數到哪一個節。順排數下一個、逆排數上一個。 */
  countedTerm: string;
  countedTermAt: string;
  countedDays: number;
  startAgeYears: number;
  startAgeMonths: number;
  startAgeExact: number;
  startRule: string;
  cycles: LuckCycle[];
};

export type BaziChart = {
  pillars: FourPillars;
  monthOrder: MonthOrder;
  /**
   * 事件／起局時刻的流年與接下來的流月。
   * 放在 bazi 底下而不是頂層：它是八字的判讀依據，不是全盤共用的時間資訊。
   * 沒有事件時間時為 null——那時沒有基準可對齊，硬給等於猜。
   */
  fleeting: Fleeting | null;
  /**
   * 大運。性別未填（表單的「不指定」）時為 null——
   * 順逆排完全由性別決定，猜一個等於有一半的人拿到相反的盤。
   */
  luck: LuckCycles | null;
};

// ---------------------------------------------------------------- 梅花易數

/** 八卦的對外摘要。不外流 lines 以外的內部結構，下游只需要這四項。 */
export type TrigramSummary = {
  name: string;
  /** 自然象：天、澤、火、雷、風、水、山、地。 */
  nature: string;
  element: string;
  symbol: string;
};

export type HexagramSummary = {
  name: string;
  upper: TrigramSummary;
  lower: TrigramSummary;
  /** 六爻陰陽，index 0 為初爻（最下）。true 為陽爻。 */
  lines: boolean[];
};

/** 體用生剋的五種關係。吉凶由此推，不由模型自由發揮。 */
export type TiYongRelation = "用生體" | "體生用" | "用剋體" | "體剋用" | "比和";

export type TiYongJudgement = {
  relation: TiYongRelation;
  note: string;
};

/** 梅花起卦來源。三種起卦方式的輸入形狀不同，用 discriminated union 而非選填欄位。 */
export type MeihuaSource =
  | { mode: "時間起卦" }
  | { mode: "數字起卦"; numbers: number[] }
  | { mode: "上下卦起卦"; upper: string; lower: string; movingLine: number };

export type MeihuaChart = {
  mode: MeihuaSource["mode"];
  /** 起卦數字的完整推導過程，供老師逐步驗算。 */
  derivation: Array<{ label: string; value: number; note?: string }>;
  upperNumber: number;
  lowerNumber: number;
  /** 動爻爻位 1–6。 */
  movingLine: number;
  /** 本卦：事情的當下狀態。 */
  ben: HexagramSummary;
  /** 互卦：事情發展的中間過程。 */
  hu: HexagramSummary;
  /** 變卦：事情的結果。 */
  bian: HexagramSummary;
  ti: { position: "上卦" | "下卦"; trigram: TrigramSummary };
  yong: { position: "上卦" | "下卦"; trigram: TrigramSummary };
  tiYong: TiYongJudgement;
  huToTi: { upper: TiYongJudgement; lower: TiYongJudgement };
  bianToTi: TiYongJudgement;
};

// ---------------------------------------------------------------- 六爻

/** 五行關係，方向由主體看向對象。斷卦看的是方向，不能只說「有生剋」。 */
export type ElementRelation = "生" | "被生" | "剋" | "被剋" | "比和";

export type LiuyaoSource =
  | { mode: "時間起卦" }
  | { mode: "手動輸入"; yao: string[] };

export type LiuyaoGanzhi = {
  stem: string;
  branch: string;
  label: string;
  element: string;
};

export type LiuyaoLine = {
  /** 爻位 1–6，1 為初爻。 */
  position: number;
  positionName: string;
  /** true 為陽爻。 */
  yang: boolean;
  moving: boolean;
  ganzhi: LiuyaoGanzhi;
  relative: string;
  god: string;
  isShi: boolean;
  isYing: boolean;
  /** 旬空：依日柱所在旬判定。 */
  isVoid: boolean;
  /** 月破：被月建所沖。 */
  isMonthBroken: boolean;
  month: { relation: ElementRelation; clash: boolean; combine: boolean };
  day: { relation: ElementRelation; clash: boolean; combine: boolean; same: boolean };
  changed: {
    ganzhi: LiuyaoGanzhi;
    relative: string;
    /** 變爻回頭對動爻的作用（回頭生／回頭剋）。 */
    relationToOriginal: ElementRelation;
  } | null;
};

export type LiuyaoPalace = {
  palace: string;
  palaceElement: string;
  position: string;
  shiYao: number;
  yingYao: number;
};

export type LiuyaoChart = {
  mode: LiuyaoSource["mode"];
  derivation: Array<{ label: string; value: number; note?: string }>;
  ben: { hexagram: HexagramSummary; palace: LiuyaoPalace };
  /** 無動爻時為 null（靜卦）。 */
  bian: { hexagram: HexagramSummary; palace: LiuyaoPalace } | null;
  movingPositions: number[];
  monthBranch: string;
  monthNote: string;
  dayGanzhi: { stem: string; branch: string; label: string };
  voidBranches: [string, string];
  lines: LiuyaoLine[];
};

// ---------------------------------------------------------------- 奇門遁甲

/** 一宮的內容。中五宮不出現在這裡——它寄坤二，其地盤干另以 centerStem 表示。 */
export type QimenPalaceCell = {
  palace: number;
  gua: string;
  direction: string;
  element: string;
  /** 地盤三奇六儀，固定不動。 */
  earthStem: string;
  /** 天盤干，隨九星轉動；坤二宮會同時帶著寄中的中五宮干。 */
  skyStem: string;
  star: string;
  door: string;
  god: string;
};

export type QimenChart = {
  dun: "陽遁" | "陰遁";
  ju: number;
  yuan: string;
  termName: string;
  termAt: string;
  /** 定局所用的符頭（日干為甲或己之日）。 */
  futou: string;
  dayGanzhi: string;
  hourGanzhi: string;
  xunshou: string;
  xunshouYi: string;
  zhiFuStar: string;
  /** 值符星所落宮。時干落中五宮時寄坤二，此時 zhiFuInCenter 為 true。 */
  zhiFuPalace: number;
  zhiFuInCenter: boolean;
  zhiShiDoor: string;
  zhiShiPalace: number;
  /** 中五宮的地盤干。它隨天芮／天禽走，不單獨佔一宮。 */
  centerStem: string;
  cells: QimenPalaceCell[];
};

export type YixueChart = {
  /** 對應 SCHOOL_PRESETS 的 id，寫進 council_runs.school_version。 */
  schoolVersion: string;
  /** 排盤引擎版本。改演算法就要進版，讓 golden set 對得上。 */
  engineVersion: string;
  /**
   * 排盤耗時。由呼叫端量測後填入，不由引擎自己取時間——
   * 引擎必須是純函式才能讓 golden test 逐欄位比對。
   */
  computeMs?: number;
  resolvedTime: ResolvedTime;
  completeness: Completeness;
  bazi: BaziChart | null;
  meihua: MeihuaChart | null;
  liuyao: LiuyaoChart | null;
  qimen: QimenChart | null;
  /** 排盤過程中的降級或存疑事項，會印進 prompt 讓 LLM 知道判讀限制。 */
  warnings: string[];
};

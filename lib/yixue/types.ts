// 巽風易學排盤引擎｜盤面型別
//
// 約束（違反會讓 golden test 與 council_runs.chart 落地失效）：
// - 全部是純資料，可 JSON.stringify，不含 class instance、Date、function。
// - 各術的盤面欄位隨該術的 Phase 加入，不預先開空欄位。
//
// 目前實作範圍：Phase 0 曆法底座與四柱。

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

export type BaziChart = {
  pillars: FourPillars;
  monthOrder: MonthOrder;
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
  /** 排盤過程中的降級或存疑事項，會印進 prompt 讓 LLM 知道判讀限制。 */
  warnings: string[];
};

// 巽風易學排盤引擎｜流派設定型別
//
// 流派分歧是專業決策不是工程決策。每一個欄位都必須在
// docs/specs/yixue-engine/SCHOOL-DECISIONS.md 有對應的決策紀錄，
// 且至少有一個「不同選項會給出不同答案」的 golden case。
// 沒有這兩樣就不准新增欄位——否則會長成沒人理解的旋鈕牆。
//
// 各術的設定段落隨該術的 Phase 一併加入，不預先開空欄位。

/** 曆法與四柱共同底座。所有術數都依賴這段。 */
export type CalendarSchool = {
  /** 固定 Asia/Taipei。使用者輸入的時間一律視為此時區的當地標準時。 */
  timezone: "Asia/Taipei";

  /**
   * 真太陽時校正。
   * - off：不校正，直接用當地標準時（等同 UTC+8 的 120°E 基準）
   * - longitude：只做經度時差（每偏離 120°E 一度 ±4 分鐘）
   * - longitude+eot：經度時差 ＋ 均時差（equation of time）
   */
  trueSolarTime: "off" | "longitude" | "longitude+eot";

  /** 未填出生地時採用的經度。台北 121.5654。 */
  defaultLongitude: number;

  /**
   * 晚子時（23:00–23:59）的日柱是否進位到隔日。
   * - next：進位（tyme4ts 預設派）
   * - same：不進位，仍用當日日柱
   *
   * 實作對應（spike 已驗證兩派皆可純讀取，不需 mutate tyme4ts static）：
   * - next → SixtyCycleHour.fromSolarTime(t).getDay()
   * - same → t.getLunarHour().getLunarDay().getSixtyCycle()
   */
  lateZiDayPillar: "next" | "same";

  /**
   * 早子（00:00–00:59）與晚子（23:00–23:59）的時柱是否分開計算。
   * - split：分早子／晚子，時干依各自所屬日的日干起
   * - merge：不分，一律視為同一個子時
   */
  earlyLateZiHourPillar: "split" | "merge";

  /**
   * 節氣邊界的判定精度。
   * - instant：用節氣的精確時刻（秒級）判定，出生在交節當日仍以時刻分前後
   * - day：以交節當日整日歸入新節氣
   *
   * 註：中央氣象署公布值四捨五入到分，我們一律用秒級原始值判定，
   * 只有在對外顯示時才四捨五入到分。
   */
  termTieBreak: "instant" | "day";
};

export type SchoolConfig = {
  /** 版本 id，會寫進 council_runs.school_version，讓歷史報告可重現。 */
  id: string;
  label: string;
  /** 決策日期與拍板人，對應 SCHOOL-DECISIONS.md。 */
  decidedAt: string;
  decidedBy: string;
  calendar: CalendarSchool;
};

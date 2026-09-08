// 巽風易學排盤引擎｜tyme4ts 邊界層
//
// ★ 全專案只有這個檔可以 import "tyme4ts"。換掉套件的成本鎖在這裡。
//
// 兩條鐵律（2026-08-09 spike 實測，違反會出事）：
//
// 1. 禁止寫入 LunarHour.provider 與 ChildLimit.provider。
//    這兩個是 writable static，Next.js server 並發下改它會污染其他會員的盤。
//    流派切換一律用「純讀取不同路徑」達成，不 mutate 全域。
//
// 2. tyme4ts 的 getName() 輸出簡體中文（惊蛰、劫财、七杀、农历、闰二月…）。
//    本檔一律不用它的名稱，改用下方我們自己的繁體對照表以 index 取名。
//    理由：手工簡繁對照表會漏字（實測就漏了「闰」），而術數名稱都是閉集合，
//    自己擁有名稱表既無漏字風險也不必引入轉換套件。
//    ⚠️ 後續各術新增名稱（十神、納音、八門、九星…）一律比照辦理，不要走轉換。

import { LunarDay, SolarTerm, SolarTime, SixtyCycleHour } from "tyme4ts";
import type { StemBranch } from "../types";

/**
 * 引擎內部傳遞的「時刻」型別。
 *
 * 其他檔案一律用這個別名，不直接 import tyme4ts 的 SolarTime——
 * 否則換套件時每個檔都要改，「成本鎖在單一檔案」的規則就破功了。
 * guard.test.ts 會強制執行這條。
 */
export type EngineTime = SolarTime;

// ---------------------------------------------------------------- 名稱表

/** 天干。兩種字體相同，仍自己擁有以維持「名稱不取自套件」的一致規則。 */
const HEAVEN_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;

/** 地支。 */
const EARTH_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

/** 24 節氣，繁體，順序必須與 tyme4ts 的 SolarTerm index 一致（index 0 為冬至）。 */
const SOLAR_TERMS = [
  "冬至", "小寒", "大寒", "立春", "雨水", "驚蟄",
  "春分", "清明", "穀雨", "立夏", "小滿", "芒種",
  "夏至", "小暑", "大暑", "立秋", "處暑", "白露",
  "秋分", "寒露", "霜降", "立冬", "小雪", "大雪"
] as const;

// ---------------------------------------------------------------- 基本轉換

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function stemBranchOf(stemIndex: number, branchIndex: number): StemBranch {
  const stem = HEAVEN_STEMS[((stemIndex % 10) + 10) % 10];
  const branch = EARTH_BRANCHES[((branchIndex % 12) + 12) % 12];
  return { stem, branch, label: `${stem}${branch}` };
}

/** 把 tyme4ts 的 SixtyCycle 轉成我們的 StemBranch（只取 index，不取它的名稱）。 */
function fromSixtyCycle(sc: { getHeavenStem(): { getIndex(): number }; getEarthBranch(): { getIndex(): number } }): StemBranch {
  return stemBranchOf(sc.getHeavenStem().getIndex(), sc.getEarthBranch().getIndex());
}

export function formatSolarTime(t: SolarTime): string {
  return `${t.getYear()}-${pad(t.getMonth())}-${pad(t.getDay())} ${pad(t.getHour())}:${pad(t.getMinute())}:${pad(t.getSecond())}`;
}

export function makeSolarTime(
  year: number, month: number, day: number, hour: number, minute: number, second = 0
): SolarTime {
  return SolarTime.fromYmdHms(year, month, day, hour, minute, second);
}

/**
 * 農曆轉國曆。閏月以負數月表示（tyme4ts 慣例）。
 * 例：2023 閏二月初一 → lunarToSolar(2023, 2, 1, true) → 2023-03-22
 */
export function lunarToSolar(
  year: number, month: number, day: number, isLeapMonth: boolean
): { year: number; month: number; day: number } {
  const d = LunarDay.fromYmd(year, isLeapMonth ? -month : month, day).getSolarDay();
  return { year: d.getYear(), month: d.getMonth(), day: d.getDay() };
}

// ---------------------------------------------------------------- 四柱

/**
 * 年柱與月柱。
 * tyme4ts 的 SixtyCycleHour 已正確處理「年柱以立春分界、月柱以節分界」，
 * 這兩項無流派爭議，直接沿用它的計算。
 */
export function yearMonthPillars(t: SolarTime): { year: StemBranch; month: StemBranch } {
  const sch = SixtyCycleHour.fromSolarTime(t);
  return { year: fromSixtyCycle(sch.getYear()), month: fromSixtyCycle(sch.getMonth()) };
}

/**
 * 日柱。這是流派分歧點（決策 1）。
 *
 * tyme4ts 在 SixtyCycleHour 建構子把「晚子時進一日」寫死，無 provider 可換，
 * 但兩派值都能純讀取取得（spike 已驗 2024-01-01 23:30 → next=乙丑 / same=甲子）：
 * - next：SixtyCycleHour.getDay()            晚子時已屬新一日
 * - same：LunarHour.getLunarDay().getSixtyCycle()  晚子時仍算當日
 */
export function dayPillar(t: SolarTime, lateZiDayPillar: "next" | "same"): StemBranch {
  if (lateZiDayPillar === "next") {
    return fromSixtyCycle(SixtyCycleHour.fromSolarTime(t).getDay());
  }
  return fromSixtyCycle(t.getLunarHour().getLunarDay().getSixtyCycle());
}

/** 時支：23:00–00:59 為子，其後每兩小時一支。 */
export function hourBranchIndex(hour: number): number {
  return Math.floor(((hour + 1) % 24) / 2);
}

/**
 * 時柱，以五鼠遁自行推算：子時的時干 = (日干 index % 5) * 2，其後順推。
 *
 * 自己算而不用 tyme4ts 的原因：時干必須依「哪一天的日干」起，而那正是
 * 決策 1／決策 2 的分歧所在。自己算才能讓兩個決策一致連動。
 * calendar.test.ts 有一條測試確保預設流派下本函式與 tyme4ts 完全一致。
 */
export function hourPillarFromDayStem(dayStemIndex: number, hour: number): StemBranch {
  const branchIndex = hourBranchIndex(hour);
  const ziStemIndex = (dayStemIndex % 5) * 2;
  return stemBranchOf(ziStemIndex + branchIndex, branchIndex);
}

export function stemIndexOf(sb: StemBranch): number {
  return HEAVEN_STEMS.indexOf(sb.stem as (typeof HEAVEN_STEMS)[number]);
}

/** tyme4ts 自己算的時柱，僅供測試交叉比對用。 */
export function hourPillarByTyme(t: SolarTime): StemBranch {
  return fromSixtyCycle(SixtyCycleHour.fromSolarTime(t).getSixtyCycle());
}

// ---------------------------------------------------------------- 月令

/**
 * 月令：出生時刻所屬的「節」及距該節的天數。
 *
 * 只取節不取氣——月柱以節分界（立春、驚蟄、清明…），中氣（雨水、春分…）不換月。
 * getTerm() 回傳最近的節氣（可能是氣），所以往回走到最近的節。
 */
export function monthOrderAt(t: SolarTime): { term: string; termAt: string; daysIntoTerm: number } {
  let term = t.getTerm();
  while (!term.isJie()) {
    term = term.next(-1);
  }
  const termTime = term.getJulianDay().getSolarTime();
  const days = t.getJulianDay().getDay() - term.getJulianDay().getDay();
  return {
    term: SOLAR_TERMS[term.getIndex()],
    termAt: formatSolarTime(termTime),
    daysIntoTerm: Math.max(0, days)
  };
}

/** 指定年份某節氣的精確時刻。golden test 對照中央氣象署用。 */
export function solarTermAt(year: number, index: number): { name: string; at: string } {
  const term = SolarTerm.fromIndex(year, index);
  return { name: SOLAR_TERMS[index], at: formatSolarTime(term.getJulianDay().getSolarTime()) };
}

export const SOLAR_TERM_NAMES: readonly string[] = SOLAR_TERMS;

// ---------------------------------------------------------------- 農曆與地支序（梅花、六爻起卦用）

/**
 * 取農曆年月日與該年的年支序。
 *
 * 梅花「年月日時起卦法」數的是農曆日期，不是國曆——這是流派可切換項
 * （見 SCHOOL-DECISIONS.md 決策 5），但兩派都需要農曆值才能比較，所以一律提供。
 *
 * branchIndex 為 tyme4ts 的地支 index（子=0）。易學數卦時子算 1，
 * 由呼叫端 +1，不在此處偷偷加，避免「這個 1 是哪來的」變成無人敢動的魔術數字。
 *
 * lateZiDayPillar 沿用曆法流派（決策 1）：晚子時（23:00–23:59）若判定已屬隔日，
 * 這裡的農曆日也要跟著進位。不跟會出現同一份報告裡「八字用隔日、梅花用當日」
 * 的內部矛盾——那比兩派選錯更糟，因為它兩派都不是。
 */
export function lunarDateOf(t: SolarTime, lateZiDayPillar: "next" | "same" = "same"): {
  year: number;
  /** 月份取絕對值；閏月以 isLeapMonth 表示，不用負數外流。 */
  month: number;
  isLeapMonth: boolean;
  day: number;
  /** 農曆年的年支 index，子=0。 */
  yearBranchIndex: number;
} {
  const base = t.getLunarHour().getLunarDay();
  const lunarDay = lateZiDayPillar === "next" && t.getHour() === 23 ? base.next(1) : base;
  const lunarMonth = lunarDay.getLunarMonth();
  const rawMonth = lunarMonth.getMonth();
  return {
    year: lunarMonth.getYear(),
    month: Math.abs(rawMonth),
    isLeapMonth: rawMonth < 0,
    day: lunarDay.getDay(),
    yearBranchIndex: lunarMonth.getLunarYear().getSixtyCycle().getEarthBranch().getIndex()
  };
}

/** 國曆年月日。時間起卦的「國曆派」用。 */
export function solarDateOf(t: SolarTime): { year: number; month: number; day: number } {
  return { year: t.getYear(), month: t.getMonth(), day: t.getDay() };
}

export const EARTH_BRANCH_NAMES: readonly string[] = EARTH_BRANCHES;

/**
 * 當下所在的節氣（24 個全取，含中氣）。
 *
 * 與 monthOrderAt 的差別：八字月柱只以「節」分界，中氣不換月；
 * 奇門的三元定局用的是完整 24 節氣，每個節氣 15 天分上中下三元、各 5 天。
 * 所以這裡不往回走到節，取的就是當下生效的那一個節氣。
 *
 * index 與 SOLAR_TERMS 一致，0 為冬至。奇門的陽遁陰遁正好以此分半：
 * 0–11（冬至到芒種）陽遁、12–23（夏至到大雪）陰遁。
 */
export function currentTermAt(t: SolarTime): { index: number; name: string; at: string; daysInto: number } {
  const term = t.getTerm();
  const termTime = term.getJulianDay().getSolarTime();
  return {
    index: term.getIndex(),
    name: SOLAR_TERMS[term.getIndex()],
    at: formatSolarTime(termTime),
    daysInto: t.getJulianDay().getDay() - term.getJulianDay().getDay()
  };
}

/** 時柱。奇門的值符值使與旬首都依時干支定，八字之外也要用。 */
export function hourPillarOf(t: SolarTime, school: { lateZiDayPillar: "next" | "same"; earlyLateZiHourPillar: "split" | "merge" }): StemBranch {
  const isLateZi = t.getHour() === 23;
  const basis =
    isLateZi && school.earlyLateZiHourPillar === "split" ? dayPillar(t, "next") : dayPillar(t, "same");
  return hourPillarFromDayStem(stemIndexOf(basis), t.getHour());
}

export const HEAVEN_STEM_NAMES: readonly string[] = HEAVEN_STEMS;

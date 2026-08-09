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

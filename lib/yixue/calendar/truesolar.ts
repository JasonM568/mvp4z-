// 巽風易學排盤引擎｜真太陽時校正
//
// tyme4ts 不提供這一段（spike 已確認），自建。
//
// 時鐘時間不等於太陽位置。台灣用東經 120 度的標準時，出生地經度不同，
// 太陽到達正午的時刻就不同。校正分兩項：
//   1. 經度時差：每偏離 120°E 一度 ±4 分鐘（地球 1 小時轉 15 度）
//   2. 均時差：地球公轉軌道離心率與黃赤交角造成的季節性誤差，全年 −14～+16 分鐘
//
// 是否啟用由 school.calendar.trueSolarTime 決定（決策 3，待老師拍板）。

import type { TimeCorrection } from "../types";

/** 台灣標準時的基準經度。 */
const STANDARD_MERIDIAN = 120;

/**
 * 均時差（equation of time），回傳分鐘。
 * 採常見的近似式，誤差約 ±0.5 分鐘——時辰以兩小時為單位，此精度綽綽有餘。
 *
 * dayOfYear 為 1–366。
 */
export function equationOfTimeMinutes(dayOfYear: number): number {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** 一年中的第幾天（1–366）。純計算，不用 Date。 */
export function dayOfYear(year: number, month: number, day: number): number {
  const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return cumulative[month - 1] + day + (leap && month > 2 ? 1 : 0);
}

export type TrueSolarInput = {
  year: number;
  month: number;
  day: number;
  longitude: number;
  mode: "off" | "longitude" | "longitude+eot";
};

/**
 * 計算真太陽時相對當地標準時的總偏移（分鐘）與逐項明細。
 * 明細會落進 chart.resolvedTime.corrections，讓老師可以驗算。
 */
export function trueSolarOffset(input: TrueSolarInput): {
  totalMinutes: number;
  corrections: TimeCorrection[];
} {
  if (input.mode === "off") {
    return { totalMinutes: 0, corrections: [] };
  }

  const corrections: TimeCorrection[] = [];
  const lonMinutes = (input.longitude - STANDARD_MERIDIAN) * 4;
  corrections.push({
    kind: "longitude",
    minutes: round2(lonMinutes),
    note: `出生地經度 ${input.longitude.toFixed(4)}°E 相對標準經線 ${STANDARD_MERIDIAN}°E`
  });

  let total = lonMinutes;
  if (input.mode === "longitude+eot") {
    const eot = equationOfTimeMinutes(dayOfYear(input.year, input.month, input.day));
    corrections.push({
      kind: "equationOfTime",
      minutes: round2(eot),
      note: "地球公轉造成的季節性均時差"
    });
    total += eot;
  }

  return { totalMinutes: total, corrections };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// 巽風易學排盤引擎｜出生時間正規化
//
// 把使用者填的（可能不完整、可能是農曆的）出生資料，正規化成一個可排盤的時刻，
// 並如實記錄「哪些資料缺了、因此哪些判讀會受限」。
//
// 設計原則：缺資料不猜、不用假值蒙混。缺什麼就寫進 missing 與 warnings，
// 讓 completeness 分數反映真實可信度，報告才能誠實說明判讀限制。

import type { ResolvedTime } from "../types";
import type { CalendarSchool } from "../school/types";
import { formatSolarTime, lunarToSolar, makeSolarTime, type EngineTime } from "./tyme";
import { trueSolarOffset } from "./truesolar";
import { findPlace } from "../geo/places";

const BRANCH_ORDER = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/**
 * 各時辰的代表時刻（使用者只給時辰、沒給精確鐘點時使用）。
 * 取時辰中點，因為時支已由時辰決定，中點只影響真太陽時與節氣邊界的判定。
 *
 * 子時橫跨午夜（23:00–00:59），中點無法單一表示——這正是早子／晚子的分歧。
 * 預設取早子 00:30 並發出警告，要求使用者補正確鐘點。
 */
const BRANCH_REPRESENTATIVE_TIME: Record<string, { hour: number; minute: number }> = {
  子: { hour: 0, minute: 30 },
  丑: { hour: 2, minute: 0 },
  寅: { hour: 4, minute: 0 },
  卯: { hour: 6, minute: 0 },
  辰: { hour: 8, minute: 0 },
  巳: { hour: 10, minute: 0 },
  午: { hour: 12, minute: 0 },
  未: { hour: 14, minute: 0 },
  申: { hour: 16, minute: 0 },
  酉: { hour: 18, minute: 0 },
  戌: { hour: 20, minute: 0 },
  亥: { hour: 22, minute: 0 }
};

export type BirthInput = {
  calendar: "國曆" | "農曆";
  isLeapMonth: boolean;
  year: number;
  month: number;
  day: number;
  /** 十二地支之一；不確定時為 null。 */
  hourBranch: string | null;
  /** 精確鐘點（可選）。有值時優先於 hourBranch 的代表時刻。 */
  hour: number | null;
  minute: number | null;
  placeLabel: string | null;
  longitude: number | null;
  latitude: number | null;
};

export type ResolveResult = {
  resolved: ResolvedTime;
  /** 排盤要用的時刻。時辰不確定時仍有值（用於年月日柱），但時柱會是 null。 */
  solarTime: EngineTime;
  /** 時辰是否確定。false 時不得產出時柱。 */
  hourKnown: boolean;
  warnings: string[];
  missing: string[];
};

export function resolveBirthTime(input: BirthInput, school: CalendarSchool): ResolveResult {
  const warnings: string[] = [];
  const missing: string[] = [];

  // 1. 曆法統一成國曆
  let y = input.year;
  let m = input.month;
  let d = input.day;
  if (input.calendar === "農曆") {
    const solar = lunarToSolar(y, m, d, input.isLeapMonth);
    y = solar.year;
    m = solar.month;
    d = solar.day;
  }

  // 2. 決定鐘點
  const hourKnown = Boolean(input.hourBranch && BRANCH_ORDER.includes(input.hourBranch));
  let hour: number;
  let minute: number;

  if (input.hour !== null && input.minute !== null) {
    hour = input.hour;
    minute = input.minute;
  } else if (hourKnown) {
    const rep = BRANCH_REPRESENTATIVE_TIME[input.hourBranch as string];
    hour = rep.hour;
    minute = rep.minute;
    missing.push("精確出生鐘點");
    if (input.hourBranch === "子") {
      warnings.push(
        "子時橫跨午夜，未提供精確鐘點無法判定為早子（00:00–00:59）或晚子（23:00–23:59）。" +
          "本次以早子推算，若實際為晚子，日柱與時柱可能不同。"
      );
    }
  } else {
    // 時辰完全不確定：仍需一個時刻來排年月日柱，取正午以避開兩端邊界。
    hour = 12;
    minute = 0;
    missing.push("出生時辰");
    warnings.push("出生時辰不確定，本次不產出時柱，時柱相關判讀（子女宮、晚年運）不成立。");
  }

  // 3. 出生地與真太陽時
  const place = findPlace(input.placeLabel);
  const longitude = input.longitude ?? place?.longitude ?? null;
  const latitude = input.latitude ?? place?.latitude ?? null;

  if (school.trueSolarTime !== "off" && longitude === null) {
    missing.push("出生地");
    warnings.push(
      `未提供出生地，真太陽時以預設經度 ${school.defaultLongitude}°E（臺北）校正；` +
        "若出生地經度差異較大且出生時刻接近時辰交界，時柱可能有偏差。"
    );
  }

  const civilTime = makeSolarTime(y, m, d, hour, minute, 0);
  const { totalMinutes, corrections } = trueSolarOffset({
    year: y,
    month: m,
    day: d,
    longitude: longitude ?? school.defaultLongitude,
    mode: school.trueSolarTime
  });

  const solarTime =
    totalMinutes === 0 ? civilTime : civilTime.next(Math.round(totalMinutes * 60));

  const effective = school.trueSolarTime === "off" ? civilTime : solarTime;

  const resolved: ResolvedTime = {
    inputCalendar: input.calendar,
    isLeapMonth: input.isLeapMonth,
    civil: formatSolarTime(civilTime),
    trueSolar: school.trueSolarTime === "off" ? null : formatSolarTime(solarTime),
    longitude,
    latitude,
    placeLabel: place?.label ?? input.placeLabel ?? null,
    corrections,
    ziPeriod: ziPeriodOf(effective.getHour(), hourKnown)
  };

  return { resolved, solarTime: effective, hourKnown, warnings, missing };
}

function ziPeriodOf(hour: number, hourKnown: boolean): "早子" | "晚子" | null {
  if (!hourKnown) return null;
  if (hour === 23) return "晚子";
  if (hour === 0) return "早子";
  return null;
}

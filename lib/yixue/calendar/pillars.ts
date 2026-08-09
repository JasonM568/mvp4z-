// 巽風易學排盤引擎｜四柱組裝
//
// 年柱、月柱無流派爭議，直接用 tyme4ts（已正確處理立春界與節界）。
// 日柱、時柱是流派分歧點，在此依 SchoolConfig 決定。

import type { FourPillars, MonthOrder } from "../types";
import type { CalendarSchool } from "../school/types";
import {
  dayPillar,
  hourPillarFromDayStem,
  monthOrderAt,
  stemIndexOf,
  yearMonthPillars,
  type EngineTime
} from "./tyme";

export function buildPillars(
  t: EngineTime,
  school: CalendarSchool,
  hourKnown: boolean
): FourPillars {
  const { year, month } = yearMonthPillars(t);
  const day = dayPillar(t, school.lateZiDayPillar);

  if (!hourKnown) {
    return { year: { ganzhi: year }, month: { ganzhi: month }, day: { ganzhi: day }, hour: null };
  }

  // 時干以五鼠遁自「基準日」的日干起。晚子時要用哪一天的日干，
  // 由 earlyLateZiHourPillar 決定，與日柱本身的流派（lateZiDayPillar）各自獨立。
  const isLateZi = t.getHour() === 23;
  const basis =
    isLateZi && school.earlyLateZiHourPillar === "split"
      ? dayPillar(t, "next")
      : dayPillar(t, "same");

  const hour = hourPillarFromDayStem(stemIndexOf(basis), t.getHour());

  return {
    year: { ganzhi: year },
    month: { ganzhi: month },
    day: { ganzhi: day },
    hour: { ganzhi: hour }
  };
}

export function buildMonthOrder(t: EngineTime): MonthOrder {
  return monthOrderAt(t);
}

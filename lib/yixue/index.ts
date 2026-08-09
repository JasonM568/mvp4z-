// 巽風易學排盤引擎｜對外入口
//
// 目前實作範圍：Phase 0 曆法底座與四柱。
// 八字判讀、梅花、六爻、奇門依序在後續 Phase 加入。
//
// ★ 純函式：無 I/O、無 Date.now()、無 process.env。時間一律由參數傳入。
//   這是能被數百條 golden case 逐欄位比對的前提，不要為了方便破例。
//
// ★ 只在 server 使用。client 端一律 `import type`，否則 tyme4ts 會進瀏覽器 bundle。

import type { SchoolConfig } from "./school/types";
import type { Completeness, YixueChart } from "./types";
import { buildMonthOrder, buildPillars } from "./calendar/pillars";
import { resolveBirthTime, type BirthInput } from "./calendar/resolve";

export const ENGINE_VERSION = "0.1.0-phase0";

export type YixueModules = {
  bazi?: boolean;
  qimen?: boolean;
  liuyao?: boolean;
  meihua?: boolean;
};

export type YixueEngineInput = {
  birth: BirthInput;
  modules: YixueModules;
};

/** 各項缺漏對完整度的扣分。時辰缺漏影響最大——整根時柱不成立。 */
const COMPLETENESS_PENALTY: Record<string, number> = {
  出生時辰: 40,
  精確出生鐘點: 10,
  出生地: 10
};

function scoreCompleteness(missing: string[]): Completeness {
  const score = missing.reduce((acc, item) => acc - (COMPLETENESS_PENALTY[item] ?? 5), 100);
  return { score: Math.max(0, Math.min(100, score)), missing };
}

export function buildYixueChart(input: YixueEngineInput, school: SchoolConfig): YixueChart {
  const { resolved, solarTime, hourKnown, warnings, missing } = resolveBirthTime(
    input.birth,
    school.calendar
  );

  const bazi = input.modules.bazi
    ? {
        pillars: buildPillars(solarTime, school.calendar, hourKnown),
        monthOrder: buildMonthOrder(solarTime)
      }
    : null;

  return {
    schoolVersion: school.id,
    engineVersion: ENGINE_VERSION,
    resolvedTime: resolved,
    completeness: scoreCompleteness(missing),
    bazi,
    warnings
  };
}

export type { BirthInput };
export type { YixueChart } from "./types";
export { resolveSchool, ACTIVE_SCHOOL_ID, SCHOOL_PRESETS } from "./school/schools";

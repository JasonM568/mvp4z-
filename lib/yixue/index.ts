// 巽風易學排盤引擎｜對外入口
//
// 目前實作範圍：Phase 0 曆法底座與四柱、Phase 1 梅花易數。
// 八字判讀、六爻、奇門依序在後續 Phase 加入。
//
// ★ 純函式：無 I/O、無 Date.now()、無 process.env。時間一律由參數傳入。
//   這是能被數百條 golden case 逐欄位比對的前提，不要為了方便破例。
//
// ★ 只在 server 使用。client 端一律 `import type`，否則 tyme4ts 會進瀏覽器 bundle。

import type { SchoolConfig } from "./school/types";
import type { Completeness, MeihuaChart, MeihuaSource, YixueChart } from "./types";
import { buildMonthOrder, buildPillars } from "./calendar/pillars";
import { resolveBirthTime, type BirthInput } from "./calendar/resolve";
import { makeSolarTime } from "./calendar/tyme";
import { buildMeihuaChart } from "./meihua/meihua";

/** 改演算法就要進版，讓 golden set 對得上。 */
export const ENGINE_VERSION = "0.2.0-meihua";

export type YixueModules = {
  bazi?: boolean;
  qimen?: boolean;
  liuyao?: boolean;
  meihua?: boolean;
};

/**
 * 起卦／起局時刻。梅花、六爻、奇門用的是「問事的當下」，不是出生時間，
 * 所以與 birth 分開。缺這個時，需要它的術數會被跳過而不是拿生辰硬代。
 *
 * 一律視為 Asia/Taipei 當地標準時。不套真太陽時校正——起卦取的是
 * 「問事者所處的時辰」，與八字要精確定位出生瞬間的目的不同；
 * 若日後老師要求校正，這裡會多一個流派欄位而不是偷偷改行為。
 */
export type DivinationTimeInput = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type YixueEngineInput = {
  birth: BirthInput;
  modules: YixueModules;
  /** 起卦時刻。未提供時梅花／六爻／奇門不排盤。 */
  divinationTime?: DivinationTimeInput | null;
  /** 梅花起卦來源。未提供時視為時間起卦。 */
  meihua?: MeihuaSource | null;
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

  const allWarnings = [...warnings];

  // 梅花。起卦失敗只降級成 null 並留下 warning——排不出卦不該讓整份報告掛掉，
  // 但也絕不能靜默略過，否則又回到「模型自己編一個卦」的老問題。
  let meihua: MeihuaChart | null = null;
  if (input.modules.meihua) {
    const source: MeihuaSource = input.meihua || { mode: "時間起卦" };
    const needsTime = source.mode === "時間起卦";
    const divTime = input.divinationTime
      ? makeSolarTime(
          input.divinationTime.year,
          input.divinationTime.month,
          input.divinationTime.day,
          input.divinationTime.hour,
          input.divinationTime.minute
        )
      : null;

    if (needsTime && !divTime) {
      allWarnings.push("梅花易數：缺少起卦時刻，本次未排卦。");
    } else {
      try {
        meihua = buildMeihuaChart(source, school, divTime);
      } catch (error) {
        allWarnings.push(`梅花易數：起卦失敗（${error instanceof Error ? error.message : String(error)}），本次未排卦。`);
      }
    }
  }

  return {
    schoolVersion: school.id,
    engineVersion: ENGINE_VERSION,
    resolvedTime: resolved,
    completeness: scoreCompleteness(missing),
    bazi,
    meihua,
    warnings: allWarnings
  };
}

export type { BirthInput };
export type { YixueChart, MeihuaChart, MeihuaSource } from "./types";
export { resolveSchool, ACTIVE_SCHOOL_ID, SCHOOL_PRESETS } from "./school/schools";

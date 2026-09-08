// 巽風易學排盤引擎｜天干地支的純資料層
//
// 為什麼不從 calendar/tyme.ts 取這些表：那個檔會把 tyme4ts（約 296KB）拖進來，
// 而這裡全是閉集合的靜態對照——五行、沖合、旬空都不需要曆法運算。
// 分開之後 gua/ 整層維持零相依，六爻與奇門的納甲、定局都能單獨測試。
//
// 代價是名稱表有兩份。ganzhi.test.ts 有一條測試逐項比對 tyme.ts 的匯出，
// 兩邊漂移會立刻紅——這比讓整層背上曆法相依划算。

import type { Element } from "./trigram";

export const HEAVEN_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const EARTH_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export type HeavenStem = (typeof HEAVEN_STEMS)[number];
export type EarthBranch = (typeof EARTH_BRANCHES)[number];

/** 天干五行：甲乙木、丙丁火、戊己土、庚辛金、壬癸水。 */
export const STEM_ELEMENTS: readonly Element[] = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];

/** 地支五行，順序同 EARTH_BRANCHES。辰戌丑未皆土。 */
export const BRANCH_ELEMENTS: readonly Element[] = [
  "水", // 子
  "土", // 丑
  "木", // 寅
  "木", // 卯
  "土", // 辰
  "火", // 巳
  "火", // 午
  "土", // 未
  "金", // 申
  "金", // 酉
  "土", // 戌
  "水"  // 亥
];

export function branchIndexOf(branch: string): number {
  const i = EARTH_BRANCHES.indexOf(branch as EarthBranch);
  if (i < 0) throw new Error(`未知的地支：${branch}`);
  return i;
}

export function stemIndexOf(stem: string): number {
  const i = HEAVEN_STEMS.indexOf(stem as HeavenStem);
  if (i < 0) throw new Error(`未知的天干：${stem}`);
  return i;
}

export function branchElement(branch: string): Element {
  return BRANCH_ELEMENTS[branchIndexOf(branch)];
}

// ---------------------------------------------------------------- 沖、合

/** 六沖：相隔六位。子午、丑未、寅申、卯酉、辰戌、巳亥。 */
export function isClash(a: string, b: string): boolean {
  return (branchIndexOf(a) + 6) % 12 === branchIndexOf(b);
}

/** 六沖的對家。月破、日沖都以此判定。 */
export function clashOf(branch: string): EarthBranch {
  return EARTH_BRANCHES[(branchIndexOf(branch) + 6) % 12];
}

/**
 * 六合：子丑、寅亥、卯戌、辰酉、巳申、午未。
 * 規律是兩支序數相加為 1 或 13，用這個判比查表不易寫錯。
 */
export function isCombine(a: string, b: string): boolean {
  const sum = branchIndexOf(a) + branchIndexOf(b);
  return sum === 1 || sum === 13;
}

export function combineOf(branch: string): EarthBranch {
  const i = branchIndexOf(branch);
  const target = i <= 1 ? 1 - i : 13 - i;
  return EARTH_BRANCHES[((target % 12) + 12) % 12];
}

// ---------------------------------------------------------------- 旬空

/**
 * 旬空（空亡）。
 *
 * 六十甲子每十個為一旬，十干配十二支，每旬必有兩支配不到干，即為空亡。
 * 公式：日柱干支序 (z − g) 決定旬首，空亡即其後的兩支。
 * 例：甲子日 g=0 z=0 → 空戌、亥；甲戌日 g=0 z=10 → 空申、酉。
 *
 * 用查表也可以，但六個旬手打容易錯位，用公式並在測試裡逐旬驗證更穩。
 */
export function voidBranches(dayStem: string, dayBranch: string): [EarthBranch, EarthBranch] {
  const g = stemIndexOf(dayStem);
  const z = branchIndexOf(dayBranch);
  const first = (((z - g) % 12) + 12 + 10) % 12;
  return [EARTH_BRANCHES[first], EARTH_BRANCHES[(first + 1) % 12]];
}

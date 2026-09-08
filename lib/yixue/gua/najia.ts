// 巽風易學排盤引擎｜京房八宮與納甲裝卦
//
// 六爻的地基。所有內容都是決定性推導，沒有任何一步需要判斷。
//
// 設計選擇：八宮六十四卦「用翻爻規則生成」而不是手打一張 64 筆的表。
// 手打表要輸入 64 個卦名 × 卦宮 × 世爻位置共 192 個欄位，錯一格不會有人發現；
// 用規則生成只需要 8 個純卦加 8 條翻爻樣式，而且規則本身可以被卦名驗證
// （najia.test.ts 逐宮比對古籍卦序）。
//
// 納甲表則無法生成——那是京房的規定，只能是硬資料。它的驗證方式是
// 挑數個古籍常見卦（屯、遯、既濟…）逐爻比對。

import {
  TRIGRAMS,
  hexagramByLines,
  transformLines,
  type Element,
  type HexagramLines,
  type TrigramName
} from "./trigram";
import { BRANCH_ELEMENTS, branchIndexOf, type EarthBranch, type HeavenStem } from "./ganzhi";

// ---------------------------------------------------------------- 納甲

/**
 * 八卦納甲。每卦作內卦（初二三）與作外卦（四五上）時配的干支不同。
 *
 * 京房納甲規定：乾納甲壬、坤納乙癸、震納庚、巽納辛、坎納戊、離納己、艮納丙、兌納丁。
 * 乾坤各分內外兩干，其餘六卦內外同干。地支的順逆亦有定則（坤、巽、離、兌逆行）。
 *
 * ⚠️ 這是硬資料，改動任何一格都會讓所有六爻盤失真。修改必須連同
 * najia.test.ts 的古籍對照案例一起檢查。
 */
type NajiaEntry = {
  /** 內卦（初、二、三爻）的干支。 */
  inner: readonly [string, string, string];
  /** 外卦（四、五、上爻）的干支。 */
  outer: readonly [string, string, string];
};

const NAJIA: Readonly<Record<TrigramName, NajiaEntry>> = Object.freeze({
  乾: { inner: ["甲子", "甲寅", "甲辰"], outer: ["壬午", "壬申", "壬戌"] },
  坤: { inner: ["乙未", "乙巳", "乙卯"], outer: ["癸丑", "癸亥", "癸酉"] },
  震: { inner: ["庚子", "庚寅", "庚辰"], outer: ["庚午", "庚申", "庚戌"] },
  巽: { inner: ["辛丑", "辛亥", "辛酉"], outer: ["辛未", "辛巳", "辛卯"] },
  坎: { inner: ["戊寅", "戊辰", "戊午"], outer: ["戊申", "戊戌", "戊子"] },
  離: { inner: ["己卯", "己丑", "己亥"], outer: ["己酉", "己未", "己巳"] },
  艮: { inner: ["丙辰", "丙午", "丙申"], outer: ["丙戌", "丙子", "丙寅"] },
  兌: { inner: ["丁巳", "丁卯", "丁丑"], outer: ["丁亥", "丁酉", "丁未"] }
});

export type NajiaGanzhi = {
  stem: HeavenStem;
  branch: EarthBranch;
  label: string;
  element: Element;
};

function parseGanzhi(label: string): NajiaGanzhi {
  const stem = label[0] as HeavenStem;
  const branch = label[1] as EarthBranch;
  return { stem, branch, label, element: BRANCH_ELEMENTS[branchIndexOf(branch)] };
}

/** 一卦六爻的納甲干支，index 0 為初爻。 */
export function najiaOf(lines: HexagramLines): NajiaGanzhi[] {
  const h = hexagramByLines(lines);
  const inner = NAJIA[h.lower.name].inner;
  const outer = NAJIA[h.upper.name].outer;
  return [...inner, ...outer].map(parseGanzhi);
}

// ---------------------------------------------------------------- 京房八宮

/**
 * 八宮的八個位置。世爻位置是固定的，與宮無關。
 *
 * 翻爻樣式以「相對本宮純卦要翻哪幾爻」表示：
 * 一世翻初、二世翻初二…五世翻初到五；
 * 遊魂是五世卦的第四爻翻回（等於相對本宮翻 1235）；
 * 歸魂是遊魂的內卦三爻全部回復本宮（等於相對本宮只翻第五爻）。
 */
const PALACE_POSITIONS = [
  { label: "本宮卦", flips: [] as number[], shiYao: 6 },
  { label: "一世卦", flips: [1], shiYao: 1 },
  { label: "二世卦", flips: [1, 2], shiYao: 2 },
  { label: "三世卦", flips: [1, 2, 3], shiYao: 3 },
  { label: "四世卦", flips: [1, 2, 3, 4], shiYao: 4 },
  { label: "五世卦", flips: [1, 2, 3, 4, 5], shiYao: 5 },
  { label: "遊魂卦", flips: [1, 2, 3, 5], shiYao: 4 },
  { label: "歸魂卦", flips: [5], shiYao: 3 }
] as const;

export type PalaceInfo = {
  /** 所屬卦宮，例如「乾宮」。 */
  palace: string;
  /** 卦宮五行，即六親的「我」。 */
  palaceElement: Element;
  /** 在該宮的位置，例如「三世卦」。 */
  position: string;
  /** 世爻爻位 1–6。 */
  shiYao: number;
  /** 應爻爻位，恆為世爻隔三位。 */
  yingYao: number;
};

/** 應爻：世爻隔三位。世 1→應 4、世 4→應 1。 */
function yingOf(shi: number): number {
  return shi <= 3 ? shi + 3 : shi - 3;
}

/** 卦名 → 八宮資訊。以八個純卦為起點推出全部六十四卦，建表一次後快取。 */
const PALACE_TABLE: Readonly<Record<string, PalaceInfo>> = (() => {
  const table: Record<string, PalaceInfo> = {};
  for (const t of TRIGRAMS) {
    const pure = [...t.lines, ...t.lines] as unknown as HexagramLines;
    for (const pos of PALACE_POSITIONS) {
      const lines = transformLines(pure, pos.flips);
      const name = hexagramByLines(lines).name;
      table[name] = {
        palace: `${t.name}宮`,
        palaceElement: t.element,
        position: pos.label,
        shiYao: pos.shiYao,
        yingYao: yingOf(pos.shiYao)
      };
    }
  }
  return Object.freeze(table);
})();

export function palaceOf(hexagramName: string): PalaceInfo {
  const found = PALACE_TABLE[hexagramName];
  if (!found) throw new Error(`八宮表查不到卦：${hexagramName}`);
  return found;
}

/** 供測試列舉全部六十四卦用。 */
export function allPalaceEntries(): Array<[string, PalaceInfo]> {
  return Object.entries(PALACE_TABLE);
}

// ---------------------------------------------------------------- 六親

export type SixRelative = "兄弟" | "父母" | "子孫" | "官鬼" | "妻財";

const GENERATES: Record<Element, Element> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const OVERCOMES: Record<Element, Element> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

/**
 * 六親：以卦宮五行為「我」。
 * 同我兄弟、生我父母、我生子孫、剋我官鬼、我剋妻財。
 */
export function sixRelative(palaceElement: Element, yaoElement: Element): SixRelative {
  if (yaoElement === palaceElement) return "兄弟";
  if (GENERATES[yaoElement] === palaceElement) return "父母";
  if (GENERATES[palaceElement] === yaoElement) return "子孫";
  if (OVERCOMES[yaoElement] === palaceElement) return "官鬼";
  if (OVERCOMES[palaceElement] === yaoElement) return "妻財";
  throw new Error(`六親判定失敗：宮 ${palaceElement} 爻 ${yaoElement}`);
}

// ---------------------------------------------------------------- 六神

export type SixGod = "青龍" | "朱雀" | "勾陳" | "螣蛇" | "白虎" | "玄武";

const SIX_GODS: readonly SixGod[] = ["青龍", "朱雀", "勾陳", "螣蛇", "白虎", "玄武"];

/**
 * 六神依日干起於初爻，順序固定為青龍、朱雀、勾陳、螣蛇、白虎、玄武。
 * 甲乙起青龍、丙丁起朱雀、戊起勾陳、己起螣蛇、庚辛起白虎、壬癸起玄武。
 */
const SIX_GOD_START: Readonly<Record<string, number>> = Object.freeze({
  甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5
});

export function sixGods(dayStem: string): SixGod[] {
  const start = SIX_GOD_START[dayStem];
  if (start === undefined) throw new Error(`未知的日干：${dayStem}`);
  return [0, 1, 2, 3, 4, 5].map((i) => SIX_GODS[(start + i) % 6]);
}

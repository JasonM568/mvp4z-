// 巽風易學排盤引擎｜奇門遁甲的靜態對照表
//
// 全部是硬資料。每一張表下方都註明它對應的口訣或典據，
// 讓老師校對時知道該拿哪一段來比對，而不是逐格瞪數字。

/** 九宮。index 即宮數 1–9，0 不用。 */
export type Palace = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const PALACE_INFO: Readonly<Record<Palace, { gua: string; direction: string; element: string }>> =
  Object.freeze({
    1: { gua: "坎", direction: "北", element: "水" },
    2: { gua: "坤", direction: "西南", element: "土" },
    3: { gua: "震", direction: "東", element: "木" },
    4: { gua: "巽", direction: "東南", element: "木" },
    5: { gua: "中", direction: "中", element: "土" },
    6: { gua: "乾", direction: "西北", element: "金" },
    7: { gua: "兌", direction: "西", element: "金" },
    8: { gua: "艮", direction: "東北", element: "土" },
    9: { gua: "離", direction: "南", element: "火" }
  });

/**
 * 八宮順時針圓周（後天八卦方位）：坎北 → 艮東北 → 震東 → 巽東南 → 離南 →
 * 坤西南 → 兌西 → 乾西北 → 回坎。
 *
 * 轉盤法的九星、八門、八神都沿這個圓周轉動，不是沿宮數 1–9 走。
 * 中五宮不在圓周上——它寄坤二宮，見 SUBSTITUTE_PALACE。
 */
export const CIRCLE: readonly Palace[] = [1, 8, 3, 4, 9, 2, 7, 6];

/** 中五宮寄坤二。九星、八門、八神落中宮時一律以此代位。 */
export const SUBSTITUTE_PALACE: Palace = 2;

export function circleIndexOf(p: Palace): number {
  const target = p === 5 ? SUBSTITUTE_PALACE : p;
  const i = CIRCLE.indexOf(target);
  if (i < 0) throw new Error(`宮位不在八宮圓周上：${p}`);
  return i;
}

/** 洛書排列，供輸出時畫成三行三列（上南下北，奇門盤的慣例）。 */
export const LUOSHU_LAYOUT: readonly (readonly Palace[])[] = [
  [4, 9, 2],
  [3, 5, 7],
  [8, 1, 6]
];

/** 九星的本宮位置。天禽居中，寄坤二。 */
export const NINE_STARS: Readonly<Record<Palace, string>> = Object.freeze({
  1: "天蓬",
  2: "天芮",
  3: "天沖",
  4: "天輔",
  5: "天禽",
  6: "天心",
  7: "天柱",
  8: "天任",
  9: "天英"
});

/** 八門的本宮位置。中五宮無門。 */
export const EIGHT_DOORS: Readonly<Partial<Record<Palace, string>>> = Object.freeze({
  1: "休門",
  2: "死門",
  3: "傷門",
  4: "杜門",
  6: "開門",
  7: "驚門",
  8: "生門",
  9: "景門"
});

/**
 * 八神順序。陽遁自值符宮起順布，陰遁逆布。
 * 採通行的「值符、螣蛇、太陰、六合、白虎、玄武、九地、九天」。
 * 部分流派以勾陳、朱雀代白虎、玄武，屬命名差異，位置相同。
 */
export const EIGHT_GODS: readonly string[] = [
  "值符",
  "螣蛇",
  "太陰",
  "六合",
  "白虎",
  "玄武",
  "九地",
  "九天"
];

/**
 * 三奇六儀的布局順序：六儀順布戊己庚辛壬癸，三奇逆布丁丙乙。
 * 陽遁自局數宮起順飛九宮（宮數 1→9 循環），陰遁逆飛。
 */
export const YI_ORDER: readonly string[] = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];

/**
 * 六甲旬首所遁之儀。
 * 甲子戊、甲戌己、甲申庚、甲午辛、甲辰壬、甲寅癸。
 * key 為旬首的地支。
 */
export const XUNSHOU_YI: Readonly<Record<string, string>> = Object.freeze({
  子: "戊",
  戌: "己",
  申: "庚",
  午: "辛",
  辰: "壬",
  寅: "癸"
});

/**
 * 二十四節氣三元局數表。外層 index 與 SOLAR_TERMS 一致（0 為冬至），
 * 內層為 [上元, 中元, 下元]。
 *
 * 對應口訣：
 *   陽遁 冬至一七四、小寒二八五、大寒三九六、立春八五二、雨水九六三、驚蟄一七四、
 *        春分三九六、清明四一七、穀雨五二八、立夏四一七、小滿五二八、芒種六三九
 *   陰遁 夏至九三六、小暑八二五、大暑七一四、立秋二五八、處暑一四七、白露九三六、
 *        秋分七一四、寒露六九三、霜降五八二、立冬六九三、小雪五八二、大雪四七一
 *
 * 陽遁陰遁正好各佔一半：index 0–11 陽遁（冬至到芒種）、12–23 陰遁（夏至到大雪）。
 */
export const JU_TABLE: readonly (readonly [number, number, number])[] = [
  [1, 7, 4], // 0  冬至
  [2, 8, 5], // 1  小寒
  [3, 9, 6], // 2  大寒
  [8, 5, 2], // 3  立春
  [9, 6, 3], // 4  雨水
  [1, 7, 4], // 5  驚蟄
  [3, 9, 6], // 6  春分
  [4, 1, 7], // 7  清明
  [5, 2, 8], // 8  穀雨
  [4, 1, 7], // 9  立夏
  [5, 2, 8], // 10 小滿
  [6, 3, 9], // 11 芒種
  [9, 3, 6], // 12 夏至
  [8, 2, 5], // 13 小暑
  [7, 1, 4], // 14 大暑
  [2, 5, 8], // 15 立秋
  [1, 4, 7], // 16 處暑
  [9, 3, 6], // 17 白露
  [7, 1, 4], // 18 秋分
  [6, 9, 3], // 19 寒露
  [5, 8, 2], // 20 霜降
  [6, 9, 3], // 21 立冬
  [5, 8, 2], // 22 小雪
  [4, 7, 1]  // 23 大雪
];

/** 陽遁的節氣範圍：冬至（0）到芒種（11）。其餘為陰遁。 */
export function isYangDun(termIndex: number): boolean {
  return termIndex >= 0 && termIndex <= 11;
}

/**
 * 符頭地支 → 三元。
 * 子午卯酉為上元、寅申巳亥為中元、辰戌丑未為下元。
 */
export function yuanOfFutou(branch: string): 0 | 1 | 2 {
  if ("子午卯酉".includes(branch)) return 0;
  if ("寅申巳亥".includes(branch)) return 1;
  if ("辰戌丑未".includes(branch)) return 2;
  throw new Error(`未知的符頭地支：${branch}`);
}

export const YUAN_NAMES = ["上元", "中元", "下元"] as const;

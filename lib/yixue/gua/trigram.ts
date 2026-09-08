// 巽風易學排盤引擎｜八卦與六十四卦基礎
//
// 純常數與純函式，沒有任何相依（連 tyme4ts 都沒有）——梅花、六爻、奇門三術共用。
//
// 爻位一律以「初爻在 index 0」表示，由下往上數。這是易學的慣例，
// 但與人的閱讀順序相反（畫卦是由上往下畫），所以每個對外輸出都要標明爻位名稱，
// 不能只丟陣列讓下游自己猜方向。
//
// 名稱表全部繁體且自己擁有，理由同 calendar/tyme.ts：術數名稱是閉集合，
// 自己維護沒有漏字風險，也不必為了簡繁轉換引入套件。

/** 爻：陽爻 true，陰爻 false。 */
export type Yao = boolean;

/** 三爻一組，index 0 為初爻（最下）。 */
export type TrigramLines = readonly [Yao, Yao, Yao];

/** 六爻一組，index 0 為初爻（最下）。 */
export type HexagramLines = readonly [Yao, Yao, Yao, Yao, Yao, Yao];

export type TrigramName = "乾" | "兌" | "離" | "震" | "巽" | "坎" | "艮" | "坤";

export type Element = "金" | "木" | "水" | "火" | "土";

export type Trigram = {
  name: TrigramName;
  /** 先天八卦數（邵雍）。梅花起卦取餘數用的就是這個，不是後天數。 */
  xiantianNumber: number;
  symbol: string;
  /** 自然象。命名六十四卦時用這個字，例如「天澤履」的「天」「澤」。 */
  nature: string;
  element: Element;
  lines: TrigramLines;
};

const Y = true;
const N = false;

/**
 * 八卦定義。順序即先天數順序：乾一、兌二、離三、震四、巽五、坎六、艮七、坤八。
 *
 * lines 由下往上：例如兌「上缺」是初陽、二陽、三陰 → [Y, Y, N]。
 * 這個方向錯了會讓互卦與變卦整組翻掉，trigram.test.ts 有逐卦比對。
 */
export const TRIGRAMS: readonly Trigram[] = Object.freeze([
  { name: "乾", xiantianNumber: 1, symbol: "☰", nature: "天", element: "金", lines: [Y, Y, Y] },
  { name: "兌", xiantianNumber: 2, symbol: "☱", nature: "澤", element: "金", lines: [Y, Y, N] },
  { name: "離", xiantianNumber: 3, symbol: "☲", nature: "火", element: "火", lines: [Y, N, Y] },
  { name: "震", xiantianNumber: 4, symbol: "☳", nature: "雷", element: "木", lines: [Y, N, N] },
  { name: "巽", xiantianNumber: 5, symbol: "☴", nature: "風", element: "木", lines: [N, Y, Y] },
  { name: "坎", xiantianNumber: 6, symbol: "☵", nature: "水", element: "水", lines: [N, Y, N] },
  { name: "艮", xiantianNumber: 7, symbol: "☶", nature: "山", element: "土", lines: [N, N, Y] },
  { name: "坤", xiantianNumber: 8, symbol: "☷", nature: "地", element: "土", lines: [N, N, N] }
] as const);

/** 先天數 1–8 取卦。8 對應坤，餘數為 0 時呼叫端要先轉成 8。 */
export function trigramByNumber(n: number): Trigram {
  const found = TRIGRAMS.find((t) => t.xiantianNumber === n);
  if (!found) throw new Error(`先天八卦數必須是 1–8，收到 ${n}`);
  return found;
}

export function trigramByName(name: string): Trigram {
  const found = TRIGRAMS.find((t) => t.name === name);
  if (!found) throw new Error(`未知的八卦名：${name}`);
  return found;
}

export function trigramByLines(lines: TrigramLines): Trigram {
  const found = TRIGRAMS.find((t) => t.lines.every((v, i) => v === lines[i]));
  if (!found) throw new Error(`無法對應到八卦：${JSON.stringify(lines)}`);
  return found;
}

/**
 * 餘數轉先天數：整除時取 8（坤），不是 0。
 *
 * 這是梅花起卦最容易寫錯的一行——JS 的 % 給 0，但易學沒有「第 0 卦」。
 * 動爻同理用 mod6To6。
 */
export function mod8To8(n: number): number {
  const r = n % 8;
  return r === 0 ? 8 : r;
}

/** 餘數轉爻位 1–6：整除時取 6（上爻），不是 0。 */
export function mod6To6(n: number): number {
  const r = n % 6;
  return r === 0 ? 6 : r;
}

// ---------------------------------------------------------------- 五行生剋

/** 五行相生：木生火、火生土、土生金、金生水、水生木。 */
const GENERATES: Record<Element, Element> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木"
};

/** 五行相剋：木剋土、土剋水、水剋火、火剋金、金剋木。 */
const OVERCOMES: Record<Element, Element> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木"
};

export function generates(a: Element, b: Element): boolean {
  return GENERATES[a] === b;
}

export function overcomes(a: Element, b: Element): boolean {
  return OVERCOMES[a] === b;
}

// ---------------------------------------------------------------- 六十四卦

export type Hexagram = {
  /** 卦名，例如「天澤履」「乾為天」。 */
  name: string;
  /** 上卦（外卦）。 */
  upper: Trigram;
  /** 下卦（內卦）。 */
  lower: Trigram;
  /** 六爻，index 0 為初爻。前三爻屬下卦，後三爻屬上卦。 */
  lines: HexagramLines;
};

/**
 * 六十四卦名表。外層 index = 上卦先天數 − 1，內層 index = 下卦先天數 − 1。
 * 即 NAMES[上][下]，順序皆為乾兌離震巽坎艮坤。
 *
 * 這張表是硬資料不是演算法，逐格對照《周易》本經。
 * gua.test.ts 會驗：八個「純卦」落在對角線、卦名的兩個自然象與上下卦一致。
 */
const HEXAGRAM_NAMES: readonly (readonly string[])[] = Object.freeze([
  // 上乾 ☰ 天
  ["乾為天", "天澤履", "天火同人", "天雷无妄", "天風姤", "天水訟", "天山遯", "天地否"],
  // 上兌 ☱ 澤
  ["澤天夬", "兌為澤", "澤火革", "澤雷隨", "澤風大過", "澤水困", "澤山咸", "澤地萃"],
  // 上離 ☲ 火
  ["火天大有", "火澤睽", "離為火", "火雷噬嗑", "火風鼎", "火水未濟", "火山旅", "火地晉"],
  // 上震 ☳ 雷
  ["雷天大壯", "雷澤歸妹", "雷火豐", "震為雷", "雷風恆", "雷水解", "雷山小過", "雷地豫"],
  // 上巽 ☴ 風
  ["風天小畜", "風澤中孚", "風火家人", "風雷益", "巽為風", "風水渙", "風山漸", "風地觀"],
  // 上坎 ☵ 水
  ["水天需", "水澤節", "水火既濟", "水雷屯", "水風井", "坎為水", "水山蹇", "水地比"],
  // 上艮 ☶ 山
  ["山天大畜", "山澤損", "山火賁", "山雷頤", "山風蠱", "山水蒙", "艮為山", "山地剝"],
  // 上坤 ☷ 地
  ["地天泰", "地澤臨", "地火明夷", "地雷復", "地風升", "地水師", "地山謙", "坤為地"]
] as const);

export function hexagramOf(upper: Trigram, lower: Trigram): Hexagram {
  const name = HEXAGRAM_NAMES[upper.xiantianNumber - 1][lower.xiantianNumber - 1];
  return {
    name,
    upper,
    lower,
    lines: [lower.lines[0], lower.lines[1], lower.lines[2], upper.lines[0], upper.lines[1], upper.lines[2]]
  };
}

export function hexagramByLines(lines: HexagramLines): Hexagram {
  const lower = trigramByLines([lines[0], lines[1], lines[2]]);
  const upper = trigramByLines([lines[3], lines[4], lines[5]]);
  return hexagramOf(upper, lower);
}

/** 爻位名稱。初爻為 position 1。 */
export const YAO_POSITION_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"] as const;

/**
 * 變卦：把指定爻位（1–6）的陰陽翻轉。
 * 梅花只有一個動爻；六爻可能多爻同動，所以收陣列。
 */
export function transformLines(lines: HexagramLines, movingPositions: readonly number[]): HexagramLines {
  const next = [...lines] as Yao[];
  for (const pos of movingPositions) {
    if (pos < 1 || pos > 6) throw new Error(`爻位必須是 1–6，收到 ${pos}`);
    next[pos - 1] = !next[pos - 1];
  }
  return next as unknown as HexagramLines;
}

/**
 * 互卦：取本卦二三四爻為下互，三四五爻為上互。
 *
 * 初爻與上爻不入互——「互卦不用初上」是梅花與六爻共通的規矩。
 */
export function mutualHexagram(lines: HexagramLines): Hexagram {
  const lower = trigramByLines([lines[1], lines[2], lines[3]]);
  const upper = trigramByLines([lines[2], lines[3], lines[4]]);
  return hexagramOf(upper, lower);
}

export function renderLines(lines: HexagramLines): string {
  // 由上往下畫，符合看盤習慣；每行標爻位避免下游誤讀方向。
  return [5, 4, 3, 2, 1, 0]
    .map((i) => `${YAO_POSITION_NAMES[i]} ${lines[i] ? "▅▅▅▅▅ 陽" : "▅▅　▅▅ 陰"}`)
    .join("\n");
}

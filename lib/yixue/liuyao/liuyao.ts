// 巽風易學排盤引擎｜六爻（納甲筮法）
//
// 這裡只做「裝盤」，不做「斷卦」。
//
// 裝盤是決定性的：納甲、六親、六神、世應、旬空、月破、與月建日辰的生剋沖合，
// 每一項都有唯一答案，交給 LLM 心算等於放棄正確性。
//
// 斷卦（取用神、定旺衰輕重、下吉凶）是流派與經驗，仍由老師的判讀規則與模型負責——
// 但它現在拿到的是一張真盤，不是自己編的。
//
// 刻意不做的事：不算旺相休囚死的分數。那需要先定義權重模型，屬流派決策，
// 未經老師拍板就給一個數字，等於把「共振度 87」的錯誤換個地方再犯一次。

import {
  hexagramByLines,
  hexagramOf,
  mod6To6,
  mod8To8,
  transformLines,
  trigramByNumber,
  type Element,
  type HexagramLines
} from "../gua/trigram";
import {
  clashOf,
  combineOf,
  isClash,
  isCombine,
  branchElement,
  voidBranches,
  EARTH_BRANCHES
} from "../gua/ganzhi";
import { najiaOf, palaceOf, sixGods, sixRelative, type PalaceInfo } from "../gua/najia";
import type { SchoolConfig } from "../school/types";
import type {
  ElementRelation,
  HexagramSummary,
  LiuyaoChart,
  LiuyaoLine,
  LiuyaoSource,
  TrigramSummary
} from "../types";
import {
  dayPillar,
  hourBranchIndex,
  lunarDateOf,
  solarDateOf,
  yearMonthPillars,
  type EngineTime
} from "../calendar/tyme";

const POSITION_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"] as const;

const GENERATES: Record<Element, Element> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const OVERCOMES: Record<Element, Element> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

/**
 * 兩個五行的關係，方向由 subject 看向 other。
 * 「生」＝ subject 生 other；「被生」＝ other 生 subject。斷卦要靠方向，不能只說「有生剋」。
 */
function elementRelation(subject: Element, other: Element): ElementRelation {
  if (subject === other) return "比和";
  if (GENERATES[subject] === other) return "生";
  if (GENERATES[other] === subject) return "被生";
  if (OVERCOMES[subject] === other) return "剋";
  if (OVERCOMES[other] === subject) return "被剋";
  throw new Error(`五行關係判定失敗：${subject} / ${other}`);
}

// ---------------------------------------------------------------- 起卦

type Step = { label: string; value: number; note?: string };

/**
 * 時間起卦。沿用梅花的年月日時取數法與同一組流派設定——
 * 兩術在同一份報告裡對同一個時刻不該給出不同的卦。
 * 差別只在六爻取得的是「一個動爻」，其餘五爻靜。
 */
function timeQua(t: EngineTime, school: SchoolConfig): { steps: Step[]; lines: HexagramLines; moving: number[] } {
  const m = school.meihua;
  const lateZi = school.calendar.lateZiDayPillar;
  const steps: Step[] = [];

  let y: number;
  let mo: number;
  let d: number;
  if (m.timeQuaDateBasis === "農曆") {
    const lunar = lunarDateOf(t, lateZi);
    y = m.timeQuaYearNumber === "地支序" ? lunar.yearBranchIndex + 1 : lunar.year;
    mo = lunar.month;
    d = lunar.day;
    steps.push(
      { label: "年數", value: y, note: `農曆 ${lunar.year} 年，${EARTH_BRANCHES[lunar.yearBranchIndex]}年` },
      { label: "月數", value: mo, note: `農曆${lunar.isLeapMonth ? "閏" : ""}${lunar.month}月` },
      { label: "日數", value: d, note: `農曆${lunar.day}日` }
    );
  } else {
    const solar = solarDateOf(t);
    y = m.timeQuaYearNumber === "地支序" ? lunarDateOf(t, lateZi).yearBranchIndex + 1 : solar.year;
    mo = solar.month;
    d = solar.day;
    steps.push(
      { label: "年數", value: y },
      { label: "月數", value: mo, note: `國曆 ${solar.month} 月` },
      { label: "日數", value: d, note: `國曆 ${solar.day} 日` }
    );
  }

  const hourIndex = hourBranchIndex(t.getHour());
  const h = hourIndex + 1;
  steps.push({ label: "時數", value: h, note: `${EARTH_BRANCHES[hourIndex]}時` });

  const sum3 = y + mo + d;
  const sum4 = sum3 + h;
  const upper = mod8To8(sum3);
  const lower = mod8To8(sum4);
  const moving = mod6To6(sum4);
  steps.push(
    { label: "年月日合計", value: sum3, note: `÷8 餘 ${upper} → 上卦 ${trigramByNumber(upper).name}` },
    { label: "年月日時合計", value: sum4, note: `÷8 餘 ${lower} → 下卦 ${trigramByNumber(lower).name}；÷6 餘 ${moving} → 動爻第 ${moving} 爻` }
  );

  return {
    steps,
    lines: hexagramOf(trigramByNumber(upper), trigramByNumber(lower)).lines,
    moving: [moving]
  };
}

/**
 * 手動輸入六爻。表單直接收少陽／少陰／老陽／老陰，不收銅錢正反面，
 * 所以「三枚銅錢正反怎麼對應」這個流派問題在本系統不存在——使用者報的已經是爻象。
 */
const YAO_KIND = {
  少陽: { yang: true, moving: false },
  少陰: { yang: false, moving: false },
  老陽: { yang: true, moving: true },
  老陰: { yang: false, moving: true }
} as const;

export type YaoKind = keyof typeof YAO_KIND;

export function isYaoKind(value: string): value is YaoKind {
  return value in YAO_KIND;
}

function manualQua(yao: readonly string[]): { steps: Step[]; lines: HexagramLines; moving: number[] } {
  if (yao.length !== 6) throw new Error(`六爻需要六個爻象，收到 ${yao.length} 個`);
  const parsed = yao.map((v, i) => {
    if (!isYaoKind(v)) throw new Error(`第 ${i + 1} 爻不是有效爻象：${v}`);
    return YAO_KIND[v];
  });
  return {
    steps: yao.map((v, i) => ({ label: POSITION_NAMES[i], value: i + 1, note: v })),
    lines: parsed.map((p) => p.yang) as unknown as HexagramLines,
    moving: parsed.map((p, i) => (p.moving ? i + 1 : 0)).filter((n) => n > 0)
  };
}

// ---------------------------------------------------------------- 月建與日辰

/**
 * 月建。
 * - 節月：月柱地支，以節分界（與八字月柱同一套）
 * - 農曆月：正月建寅、二月建卯…以農曆月份直接對地支
 *
 * 兩派在「交節到農曆換月之間」的日子會給出不同的月建，見 SCHOOL-DECISIONS.md 決策 7。
 */
function monthBranchOf(t: EngineTime, school: SchoolConfig): { branch: string; note: string } {
  if (school.liuyao.monthRule === "節月") {
    const { month } = yearMonthPillars(t);
    return { branch: month.branch, note: `節月（月柱 ${month.label}）` };
  }
  const lunar = lunarDateOf(t, school.calendar.lateZiDayPillar);
  // 正月建寅：農曆 1 月 → 寅（index 2）。
  const branch = EARTH_BRANCHES[(lunar.month + 1) % 12];
  return { branch, note: `農曆${lunar.month}月建${branch}` };
}

// ---------------------------------------------------------------- 組裝

function toTrigramSummary(name: string, nature: string, element: string, symbol: string): TrigramSummary {
  return { name, nature, element, symbol };
}

function toHexagramSummary(lines: HexagramLines): HexagramSummary {
  const h = hexagramByLines(lines);
  return {
    name: h.name,
    upper: toTrigramSummary(h.upper.name, h.upper.nature, h.upper.element, h.upper.symbol),
    lower: toTrigramSummary(h.lower.name, h.lower.nature, h.lower.element, h.lower.symbol),
    lines: [...h.lines]
  };
}

function palaceSummary(info: PalaceInfo) {
  return { ...info };
}

export function buildLiuyaoChart(
  source: LiuyaoSource,
  school: SchoolConfig,
  divinationTime: EngineTime | null
): LiuyaoChart {
  let steps: Step[];
  let benLines: HexagramLines;
  let moving: number[];

  if (source.mode === "時間起卦") {
    if (!divinationTime) throw new Error("時間起卦需要起卦時刻");
    ({ steps, lines: benLines, moving } = timeQua(divinationTime, school));
  } else {
    ({ steps, lines: benLines, moving } = manualQua(source.yao));
  }

  if (!divinationTime) throw new Error("六爻需要起卦時刻才能定月建與日辰");

  const ben = hexagramByLines(benLines);
  const benPalace = palaceOf(ben.name);
  const najia = najiaOf(benLines);

  const day = dayPillar(divinationTime, school.calendar.lateZiDayPillar);
  const month = monthBranchOf(divinationTime, school);
  const monthElement = branchElement(month.branch);
  const dayElement = branchElement(day.branch);
  const [void1, void2] = voidBranches(day.stem, day.branch);
  const gods = sixGods(day.stem);
  const monthClash = clashOf(month.branch);

  // 變卦：所有動爻一起變。無動爻則無變卦（六沖靜卦等情形）。
  const bianLines = moving.length ? transformLines(benLines, moving) : null;
  const bianNajia = bianLines ? najiaOf(bianLines) : null;
  const bianPalace = bianLines ? palaceOf(hexagramByLines(bianLines).name) : null;

  const lines: LiuyaoLine[] = najia.map((g, i) => {
    const pos = i + 1;
    const isMoving = moving.includes(pos);
    return {
      position: pos,
      positionName: POSITION_NAMES[i],
      yang: benLines[i],
      moving: isMoving,
      ganzhi: { stem: g.stem, branch: g.branch, label: g.label, element: g.element },
      relative: sixRelative(benPalace.palaceElement, g.element),
      god: gods[i],
      isShi: benPalace.shiYao === pos,
      isYing: benPalace.yingYao === pos,
      // 旬空以日柱所在旬判定；空亡的爻在斷卦上視為暫時不受力。
      isVoid: g.branch === void1 || g.branch === void2,
      // 月破：被月建所沖。
      isMonthBroken: g.branch === monthClash,
      month: {
        relation: elementRelation(g.element, monthElement),
        clash: isClash(g.branch, month.branch),
        combine: isCombine(g.branch, month.branch)
      },
      day: {
        relation: elementRelation(g.element, dayElement),
        clash: isClash(g.branch, day.branch),
        combine: isCombine(g.branch, day.branch),
        same: g.branch === day.branch
      },
      changed:
        isMoving && bianNajia
          ? {
              ganzhi: {
                stem: bianNajia[i].stem,
                branch: bianNajia[i].branch,
                label: bianNajia[i].label,
                element: bianNajia[i].element
              },
              // 變爻的六親仍以「本卦的卦宮」取，不改用變卦的宮——這是納甲筮法的通則。
              relative: sixRelative(benPalace.palaceElement, bianNajia[i].element),
              // 回頭生剋：變出來的爻對動爻本身的作用。
              relationToOriginal: elementRelation(bianNajia[i].element, g.element)
            }
          : null
    };
  });

  return {
    mode: source.mode,
    derivation: steps,
    ben: { hexagram: toHexagramSummary(benLines), palace: palaceSummary(benPalace) },
    bian:
      bianLines && bianPalace
        ? { hexagram: toHexagramSummary(bianLines), palace: palaceSummary(bianPalace) }
        : null,
    movingPositions: moving,
    monthBranch: month.branch,
    monthNote: month.note,
    dayGanzhi: { stem: day.stem, branch: day.branch, label: day.label },
    voidBranches: [void1, void2],
    lines
  };
}

/** 對外提供給表單驗證用，避免前後端各維護一份爻象清單。 */
export const YAO_KIND_NAMES = Object.keys(YAO_KIND) as YaoKind[];

/** 六合／六沖的判定在 gua/ganzhi，這裡重新匯出供上層 render 使用。 */
export { combineOf };

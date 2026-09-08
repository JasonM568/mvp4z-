// 巽風易學排盤引擎｜梅花易數
//
// 梅花的整條推導鏈都是決定性的：時間（或數字）→ 上下卦與動爻 → 本卦 → 互卦、變卦
// → 體用定位 → 體用生剋。沒有一步需要「靈感」，所以沒有一步該交給 LLM 猜。
//
// 這個檔取代原本 personas.ts 裡那句「請依此時間推算上下卦與動爻」——
// 那句話等於叫模型自己心算，而它算錯不會有任何人發現。
//
// 流派分歧見 SCHOOL-DECISIONS.md 決策 5、6（時間起卦的曆法與年數取法）。

import {
  generates,
  hexagramByLines,
  hexagramOf,
  mod6To6,
  mod8To8,
  mutualHexagram,
  overcomes,
  transformLines,
  trigramByName,
  trigramByNumber,
  type Element,
  type Hexagram,
  type Trigram
} from "../gua/trigram";
import type { SchoolConfig } from "../school/types";
import type {
  HexagramSummary,
  MeihuaChart,
  MeihuaSource,
  TiYongRelation,
  TrigramSummary
} from "../types";
import { EARTH_BRANCH_NAMES, hourBranchIndex, lunarDateOf, solarDateOf, type EngineTime } from "../calendar/tyme";

// ---------------------------------------------------------------- 起卦

/** 推導過程的每一步都留下來，老師才驗算得動。省掉這個就變成另一個黑盒。 */
type Step = { label: string; value: number; note?: string };

function timeQuaNumbers(t: EngineTime, school: SchoolConfig): { steps: Step[]; sum3: number; sum4: number } {
  const steps: Step[] = [];
  const meihua = school.meihua;
  // 晚子時的日期進位與八字共用同一個流派決定，見 lunarDateOf 的說明。
  const lateZi = school.calendar.lateZiDayPillar;

  if (meihua.timeQuaDateBasis === "農曆") {
    const lunar = lunarDateOf(t, lateZi);
    const yearNumber =
      meihua.timeQuaYearNumber === "地支序" ? lunar.yearBranchIndex + 1 : lunar.year;
    steps.push({
      label: "年數",
      value: yearNumber,
      note:
        meihua.timeQuaYearNumber === "地支序"
          ? `農曆 ${lunar.year} 年為${EARTH_BRANCH_NAMES[lunar.yearBranchIndex]}年，地支序第 ${yearNumber}`
          : `農曆年數 ${lunar.year}`
    });
    steps.push({
      label: "月數",
      value: lunar.month,
      note: `農曆${lunar.isLeapMonth ? "閏" : ""}${lunar.month}月`
    });
    steps.push({ label: "日數", value: lunar.day, note: `農曆${lunar.day}日` });
  } else {
    const solar = solarDateOf(t);
    const yearNumber =
      meihua.timeQuaYearNumber === "地支序" ? lunarDateOf(t, lateZi).yearBranchIndex + 1 : solar.year;
    steps.push({
      label: "年數",
      value: yearNumber,
      note: meihua.timeQuaYearNumber === "地支序" ? "年支序" : `國曆年數 ${solar.year}`
    });
    steps.push({ label: "月數", value: solar.month, note: `國曆 ${solar.month} 月` });
    steps.push({ label: "日數", value: solar.day, note: `國曆 ${solar.day} 日` });
  }

  const branchIndex = hourBranchIndex(t.getHour());
  steps.push({
    label: "時數",
    value: branchIndex + 1,
    note: `${EARTH_BRANCH_NAMES[branchIndex]}時，地支序第 ${branchIndex + 1}`
  });

  const sum3 = steps[0].value + steps[1].value + steps[2].value;
  const sum4 = sum3 + steps[3].value;
  return { steps, sum3, sum4 };
}

/**
 * 數字起卦。依輸入的數字個數分派，這是梅花的通例：
 * - 1 個數：拆成十位與個位分取上下卦（單一數字無法同時定上下卦與動爻，故取總數為動爻）
 * - 2 個數：第一數為上卦、第二數為下卦、兩數和為動爻
 * - 3 個以上：前兩數定上下卦，全部總和為動爻
 */
function numberQua(numbers: number[]): { steps: Step[]; upperSeed: number; lowerSeed: number; moveSeed: number } {
  const clean = numbers.map((n) => Math.abs(Math.trunc(Number(n) || 0)));
  if (!clean.length) throw new Error("數字起卦至少要一個數字");

  if (clean.length === 1) {
    const n = clean[0];
    const upper = Math.floor(n / 10);
    const lower = n % 10;
    // 個位數輸入（如「7」）無十位可拆，上下卦同取該數，動爻取其倍數。
    const upperSeed = upper > 0 ? upper : n;
    const lowerSeed = lower > 0 ? lower : n;
    return {
      steps: [
        { label: "輸入數字", value: n },
        { label: "上卦取數", value: upperSeed, note: upper > 0 ? "十位數" : "個位數（無十位可拆）" },
        { label: "下卦取數", value: lowerSeed, note: lower > 0 ? "個位數" : "個位數（無十位可拆）" }
      ],
      upperSeed,
      lowerSeed,
      moveSeed: upperSeed + lowerSeed
    };
  }

  const [first, second] = clean;
  const total = clean.reduce((a, b) => a + b, 0);
  return {
    steps: [
      { label: "上卦取數", value: first },
      { label: "下卦取數", value: second },
      { label: "數字總和", value: total, note: clean.join(" ＋ ") }
    ],
    upperSeed: first,
    lowerSeed: second,
    moveSeed: total
  };
}

// ---------------------------------------------------------------- 體用

/**
 * 體用生剋。體為己方／本體，用為所問之事／對方。
 *
 * 五種關係的吉凶是梅花的核心判準，屬學理不屬推測，因此由程式判定並附上依據，
 * 不讓模型自由發揮。措辭保持中性描述，不下「必成」「必敗」這種斷語。
 */
function tiYongRelation(tiElement: Element, yongElement: Element): { relation: TiYongRelation; note: string } {
  if (tiElement === yongElement) {
    return { relation: "比和", note: "體用同五行，彼此無生剋，事態順遂、阻力小。" };
  }
  if (generates(yongElement, tiElement)) {
    return { relation: "用生體", note: `用卦${yongElement}生體卦${tiElement}，外力來助，於己方有利。` };
  }
  if (generates(tiElement, yongElement)) {
    return { relation: "體生用", note: `體卦${tiElement}生用卦${yongElement}，己方付出而外洩，耗力。` };
  }
  if (overcomes(yongElement, tiElement)) {
    return { relation: "用剋體", note: `用卦${yongElement}剋體卦${tiElement}，外來壓力大，於己方不利。` };
  }
  if (overcomes(tiElement, yongElement)) {
    return { relation: "體剋用", note: `體卦${tiElement}剋用卦${yongElement}，己方能主導，惟須費力。` };
  }
  // 五行兩兩之間必為同／生／被生／剋／被剋其一，走到這裡代表五行表被改壞了。
  throw new Error(`五行關係表不完整：體 ${tiElement} 用 ${yongElement}`);
}

// ---------------------------------------------------------------- 組裝

function toTrigramSummary(t: Trigram): TrigramSummary {
  return { name: t.name, nature: t.nature, element: t.element, symbol: t.symbol };
}

function toHexagramSummary(h: Hexagram): HexagramSummary {
  return {
    name: h.name,
    upper: toTrigramSummary(h.upper),
    lower: toTrigramSummary(h.lower),
    lines: [...h.lines]
  };
}

export function buildMeihuaChart(
  source: MeihuaSource,
  school: SchoolConfig,
  divinationTime: EngineTime | null
): MeihuaChart {
  let steps: Step[];
  let upper: Trigram;
  let lower: Trigram;
  let movingLine: number;
  let upperNumber: number;
  let lowerNumber: number;

  if (source.mode === "時間起卦") {
    if (!divinationTime) throw new Error("時間起卦需要起卦時刻");
    const { steps: s, sum3, sum4 } = timeQuaNumbers(divinationTime, school);
    upperNumber = mod8To8(sum3);
    lowerNumber = mod8To8(sum4);
    movingLine = mod6To6(sum4);
    upper = trigramByNumber(upperNumber);
    lower = trigramByNumber(lowerNumber);
    steps = [
      ...s,
      { label: "年月日合計", value: sum3, note: `${sum3} ÷ 8 餘 ${upperNumber}　→ 上卦 ${upper.name}` },
      { label: "年月日時合計", value: sum4, note: `${sum4} ÷ 8 餘 ${lowerNumber}　→ 下卦 ${lower.name}；${sum4} ÷ 6 餘 ${movingLine} → 動爻第 ${movingLine} 爻` }
    ];
  } else if (source.mode === "數字起卦") {
    const { steps: s, upperSeed, lowerSeed, moveSeed } = numberQua(source.numbers);
    upperNumber = mod8To8(upperSeed);
    lowerNumber = mod8To8(lowerSeed);
    movingLine = mod6To6(moveSeed);
    upper = trigramByNumber(upperNumber);
    lower = trigramByNumber(lowerNumber);
    steps = [
      ...s,
      { label: "上卦", value: upperNumber, note: `${upperSeed} ÷ 8 餘 ${upperNumber} → ${upper.name}` },
      { label: "下卦", value: lowerNumber, note: `${lowerSeed} ÷ 8 餘 ${lowerNumber} → ${lower.name}` },
      { label: "動爻", value: movingLine, note: `${moveSeed} ÷ 6 餘 ${movingLine} → 第 ${movingLine} 爻` }
    ];
  } else {
    upper = trigramByName(source.upper);
    lower = trigramByName(source.lower);
    upperNumber = upper.xiantianNumber;
    lowerNumber = lower.xiantianNumber;
    movingLine = source.movingLine;
    if (!Number.isInteger(movingLine) || movingLine < 1 || movingLine > 6) {
      throw new Error(`動爻必須是 1–6 的整數，收到 ${source.movingLine}`);
    }
    steps = [
      { label: "上卦", value: upperNumber, note: `直接指定 ${upper.name}` },
      { label: "下卦", value: lowerNumber, note: `直接指定 ${lower.name}` },
      { label: "動爻", value: movingLine, note: `直接指定第 ${movingLine} 爻` }
    ];
  }

  const ben = hexagramOf(upper, lower);
  const hu = mutualHexagram(ben.lines);
  const bian = hexagramByLines(transformLines(ben.lines, [movingLine]));

  // 動爻所在之卦為用，另一卦為體。初二三爻屬下卦，四五上爻屬上卦。
  const movingInLower = movingLine <= 3;
  const ti = movingInLower ? upper : lower;
  const yong = movingInLower ? lower : upper;
  const tiPosition = movingInLower ? "上卦" : "下卦";
  const yongPosition = movingInLower ? "下卦" : "上卦";

  // 變卦中與「用位」同一位置的卦，代表事情變化後的結果方；與體卦的生剋即結果吉凶。
  const bianYong = movingInLower ? bian.lower : bian.upper;

  return {
    mode: source.mode,
    derivation: steps,
    upperNumber,
    lowerNumber,
    movingLine,
    ben: toHexagramSummary(ben),
    hu: toHexagramSummary(hu),
    bian: toHexagramSummary(bian),
    ti: { position: tiPosition, trigram: toTrigramSummary(ti) },
    yong: { position: yongPosition, trigram: toTrigramSummary(yong) },
    tiYong: tiYongRelation(ti.element, yong.element),
    // 互卦主事情發展的中間過程，上下互各與體卦論生剋；變卦主結果。
    huToTi: {
      upper: tiYongRelation(ti.element, hu.upper.element),
      lower: tiYongRelation(ti.element, hu.lower.element)
    },
    bianToTi: tiYongRelation(ti.element, bianYong.element)
  };
}

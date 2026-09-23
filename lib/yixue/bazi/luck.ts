// 巽風易學排盤引擎｜大運
//
// 2026-09-22 的判斷是「起運法待老師簽核，所以整個不做」，並在 prompt 加了一句
// 「本系統尚未提供程式排的大運」。那句話讓模型不再跟會員要大運，但會員打開報告
// 仍然看不到大運——2026-09-23 使用者就是這樣發現的。
//
// 重新拆解後，這一術其實只有一個地方有流派分歧：
//
//   順逆排方向   陽男陰女順、陰男陽女逆      → 通則，無分歧
//   大運干支     自月柱順推或逆推六十甲子     → 通則，無分歧
//   起運歲數     三日折一年，餘數怎麼處理     → **有分歧**
//
// 也就是說「大運排什麼」是確定的，只有「幾歲起運」要老師拍板。
// 照梅花／六爻／奇門同一套做法：開關 ＋ 主流預設 ＋ 能區分選項的 golden case，
// 老師改一個選項就重排。整個不做，只會讓會員什麼都看不到。
//
// ★ 純函式。時刻與性別由參數傳入。

import type { LuckCycle, LuckCycles } from "../types";
import type { SchoolConfig } from "../school/types";
import { jieAroundAt, shiftSexagenary, type EngineTime } from "../calendar/tyme";
import type { StemBranch } from "../types";

/** 大運排幾步。8 步涵蓋 80 年，足夠任何在世者的判讀範圍。 */
export const LUCK_CYCLE_COUNT = 8;

/** 天干陰陽：甲丙戊庚壬為陽（偶數位），乙丁己辛癸為陰。 */
const YANG_STEMS = ["甲", "丙", "戊", "庚", "壬"];

export function isYangStem(stem: string): boolean {
  return YANG_STEMS.includes(stem);
}

/**
 * 順排還是逆排。
 *
 * 陽年男、陰年女 → 順排；陰年男、陽年女 → 逆排。
 * 這是通則，沒有流派分歧，所以不做成設定。
 *
 * 性別不明時回 null：大運的方向完全由性別決定，猜一個等於有一半的人拿到錯的盤。
 * 表單的「不指定」就會走到這裡。
 */
export function luckDirection(yearStem: string, gender: string | null | undefined): "forward" | "backward" | null {
  const male = gender === "男";
  const female = gender === "女";
  if (!male && !female) return null;
  const yang = isYangStem(yearStem);
  return (yang && male) || (!yang && female) ? "forward" : "backward";
}

/**
 * 起運歲數。
 *
 * 三日折一年是通行算法：順排數到下一個節、逆排數回上一個節，天數除以三即年數。
 * 分歧在餘數——見 SCHOOL-DECISIONS.md 決策 9。
 */
function startAge(days: number, rule: SchoolConfig["bazi"]["luckStartRule"]) {
  const exact = days / 3;
  if (rule === "整年進位") {
    // 四捨五入到年，最少一歲。這派認為起運本來就是概數，給到月是假精確。
    return { years: Math.max(1, Math.round(exact)), months: 0, exact };
  }
  // 精算到月：三日一年 → 一日四個月。餘數換算成月，滿十二進位。
  let years = Math.floor(exact);
  let months = Math.round((exact - years) * 12);
  if (months >= 12) {
    years += 1;
    months = 0;
  }
  return { years, months, exact };
}

export function buildLuckCycles(input: {
  birthTime: EngineTime;
  yearPillar: StemBranch;
  monthPillar: StemBranch;
  gender: string | null | undefined;
  school: SchoolConfig;
  /** 事件時刻，用來標出「現在走在第幾步大運」。沒有就不標。 */
  referenceYear?: number | null;
  birthYear: number;
}): LuckCycles | null {
  const direction = luckDirection(input.yearPillar.stem, input.gender);
  if (!direction) return null;

  const jie = jieAroundAt(input.birthTime);
  const days = direction === "forward" ? jie.next.daysUntil : jie.prev.daysSince;
  const { years, months, exact } = startAge(days, input.school.bazi.luckStartRule);

  const cycles: LuckCycle[] = [];
  for (let i = 1; i <= LUCK_CYCLE_COUNT; i++) {
    const ganzhi = shiftSexagenary(input.monthPillar, direction === "forward" ? i : -i);
    const fromAge = years + (i - 1) * 10;
    // 起運歲數是「出生後經過幾年」，不是虛歲，所以西元年直接加上去。
    //
    // 原本寫 birthYear + fromAge - 1（照虛歲換算），結果 2004-02 出生、
    // 起運 0 歲 9 個月的案例第一步印成 2003 年——比出生還早一年。
    // 起運不足一年是合法結果（數到下一個節只有兩天多），錯的是換算不是資料。
    const fromYear = input.birthYear + fromAge;
    cycles.push({
      index: i,
      ganzhi,
      fromAge,
      toAge: fromAge + 9,
      fromYear,
      toYear: fromYear + 9,
      current: false
    });
  }

  // 標出事件時刻落在哪一步。沒有參考年就都不標，不要猜。
  if (typeof input.referenceYear === "number") {
    const hit = cycles.find((c) => input.referenceYear! >= c.fromYear && input.referenceYear! <= c.toYear);
    if (hit) hit.current = true;
  }

  return {
    direction,
    directionLabel: direction === "forward" ? "順排" : "逆排",
    // 把判定依據一起帶出去，讓老師與會員驗算得動，而不是只看到一個結論。
    basis:
      `${isYangStem(input.yearPillar.stem) ? "陽" : "陰"}年` +
      `${input.gender === "男" ? "男" : "女"}` +
      `，故${direction === "forward" ? "順" : "逆"}排`,
    countedTerm: direction === "forward" ? jie.next.name : jie.prev.name,
    countedTermAt: direction === "forward" ? jie.next.at : jie.prev.at,
    countedDays: Number(days.toFixed(3)),
    startAgeYears: years,
    startAgeMonths: months,
    startAgeExact: Number(exact.toFixed(3)),
    startRule: input.school.bazi.luckStartRule,
    cycles
  };
}

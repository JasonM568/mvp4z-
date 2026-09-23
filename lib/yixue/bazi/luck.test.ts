// 大運 golden case。
//
// 每個數字都手算過（算式寫在註解），不是把程式輸出貼回來。
//
// 2026-09-23 抓到的錯：原本西元年用虛歲換算（birthYear + fromAge - 1），
// 2004-02 出生、起運 0 歲 9 個月的案例第一步印成 2003 年——比出生還早一年。
// 起運不足一年是合法結果（數到下一個節只有兩天多），錯的是換算。

import { describe, expect, it } from "vitest";
import { buildLuckCycles, isYangStem, luckDirection } from "./luck";
import { makeSolarTime, yearMonthPillars } from "../calendar/tyme";
import { resolveSchool } from "../school/schools";
import type { SchoolConfig } from "../school/types";

const S = resolveSchool("fengyi-v1");

function build(y: number, m: number, d: number, h: number, mi: number, gender: string | null, school = S) {
  const t = makeSolarTime(y, m, d, h, mi);
  const p = yearMonthPillars(t);
  return buildLuckCycles({
    birthTime: t,
    yearPillar: p.year,
    monthPillar: p.month,
    gender,
    school,
    referenceYear: 2026,
    birthYear: y
  });
}

describe("順逆排", () => {
  it("天干陰陽：甲丙戊庚壬為陽", () => {
    expect(["甲", "丙", "戊", "庚", "壬"].every(isYangStem)).toBe(true);
    expect(["乙", "丁", "己", "辛", "癸"].some(isYangStem)).toBe(false);
  });

  it("陽男順、陰男逆、陽女逆、陰女順", () => {
    expect(luckDirection("庚", "男")).toBe("forward");
    expect(luckDirection("癸", "男")).toBe("backward");
    expect(luckDirection("庚", "女")).toBe("backward");
    expect(luckDirection("癸", "女")).toBe("forward");
  });

  it("性別未填時回 null——順逆完全由性別決定，猜會讓一半的人拿到相反的盤", () => {
    expect(luckDirection("庚", "不指定")).toBeNull();
    expect(luckDirection("庚", null)).toBeNull();
    expect(luckDirection("庚", "")).toBeNull();
  });
});

describe("1990-05-20 14:30 男（年庚午、月辛巳）", () => {
  // 庚為陽、男 → 順排。順排數到下一個節芒種，相距 16.678 天。
  // 16.678 ÷ 3 = 5.559 年 → 5 歲，0.559 × 12 ≈ 7 個月。
  const L = build(1990, 5, 20, 14, 30, "男")!;

  it("順排，數到芒種", () => {
    expect(L.direction).toBe("forward");
    expect(L.basis).toBe("陽年男，故順排");
    expect(L.countedTerm).toBe("芒種");
    expect(L.countedDays).toBeCloseTo(16.678, 2);
  });

  it("起運 5 歲 7 個月", () => {
    expect(L.startAgeYears).toBe(5);
    expect(L.startAgeMonths).toBe(7);
  });

  it("大運自月柱辛巳順推", () => {
    expect(L.cycles.map((c) => c.ganzhi.label)).toEqual([
      "壬午", "癸未", "甲申", "乙酉", "丙戌", "丁亥", "戊子", "己丑"
    ]);
  });

  it("西元年自出生年加起運歲數，不用虛歲換算", () => {
    expect(L.cycles[0]).toMatchObject({ fromAge: 5, toAge: 14, fromYear: 1995, toYear: 2004 });
    expect(L.cycles[3]).toMatchObject({ fromAge: 35, fromYear: 2025, toYear: 2034 });
  });

  it("2026 年落在第四步乙酉", () => {
    expect(L.cycles.filter((c) => c.current).map((c) => c.ganzhi.label)).toEqual(["乙酉"]);
  });
});

describe("2004-02-02 16:00 女（年癸未、月乙丑）— 起運不足一年", () => {
  // 癸為陰、女 → 順排。數到立春只有 2.164 天，2.164 ÷ 3 = 0.721 年 → 0 歲 9 個月。
  const L = build(2004, 2, 2, 16, 0, "女")!;

  it("陰年女仍是順排", () => {
    expect(L.direction).toBe("forward");
    expect(L.countedTerm).toBe("立春");
  });

  it("起運 0 歲 9 個月是合法結果，不強制墊到 1 歲", () => {
    expect(L.startAgeYears).toBe(0);
    expect(L.startAgeMonths).toBe(9);
  });

  it("第一步不得早於出生年", () => {
    // 這正是 2026-09-23 修掉的那個 off-by-one：原本會印成 2003。
    expect(L.cycles[0].fromYear).toBe(2004);
    expect(L.cycles[0].fromYear).toBeGreaterThanOrEqual(2004);
  });
});

describe("1969-03-07 13:14 女（年己酉、月丁卯）", () => {
  // 己為陰、女 → 順排。數到清明 28.751 天 ÷ 3 = 9.584 → 9 歲 7 個月。
  const L = build(1969, 3, 7, 13, 14, "女")!;

  it("起運與序列", () => {
    expect(L.startAgeYears).toBe(9);
    expect(L.startAgeMonths).toBe(7);
    expect(L.cycles[0].ganzhi.label).toBe("戊辰");
    expect(L.cycles[0].fromYear).toBe(1978);
  });

  it("2026 落在第五步壬申（2018–2027）", () => {
    const cur = L.cycles.find((c) => c.current)!;
    expect(cur.ganzhi.label).toBe("壬申");
    expect(cur.fromYear).toBe(2018);
    expect(cur.toYear).toBe(2027);
  });
});

describe("逆排案例", () => {
  // 1990 庚午年、女 → 陽年女，逆排。逆排數回上一個節立夏，相距 14.496 天。
  // 14.496 ÷ 3 = 4.832 → 4 歲 10 個月。月柱辛巳逆推：庚辰、己卯、戊寅…
  const L = build(1990, 5, 20, 14, 30, "女")!;

  it("陽年女逆排，改數上一個節", () => {
    expect(L.direction).toBe("backward");
    expect(L.basis).toBe("陽年女，故逆排");
    expect(L.countedTerm).toBe("立夏");
    expect(L.countedDays).toBeCloseTo(14.496, 2);
  });

  it("起運 4 歲 10 個月，干支自月柱逆推", () => {
    expect(L.startAgeYears).toBe(4);
    expect(L.startAgeMonths).toBe(10);
    expect(L.cycles.slice(0, 3).map((c) => c.ganzhi.label)).toEqual(["庚辰", "己卯", "戊寅"]);
  });

  it("同一組生辰，男女排出完全不同的大運", () => {
    const male = build(1990, 5, 20, 14, 30, "男")!;
    expect(male.cycles[0].ganzhi.label).not.toBe(L.cycles[0].ganzhi.label);
    expect(male.direction).not.toBe(L.direction);
  });
});

describe("流派分歧（決策 9：起運法）", () => {
  const rounded: SchoolConfig = { ...S, bazi: { luckStartRule: "整年進位" } };

  it("精算到月 vs 整年進位，起運歲數不同", () => {
    // 16.678 天 ÷ 3 = 5.559：精算給 5 歲 7 個月，四捨五入給 6 歲。
    const exact = build(1990, 5, 20, 14, 30, "男")!;
    const round = build(1990, 5, 20, 14, 30, "男", rounded)!;
    expect(exact.startAgeYears).toBe(5);
    expect(exact.startAgeMonths).toBe(7);
    expect(round.startAgeYears).toBe(6);
    expect(round.startAgeMonths).toBe(0);
  });

  it("整年進位最少一歲，不會出現 0 歲起運", () => {
    const round = build(2004, 2, 2, 16, 0, "女", rounded)!;
    expect(round.startAgeYears).toBe(1);
  });

  it("兩派的大運干支序列完全相同——分歧只在起運歲數", () => {
    const exact = build(1969, 3, 7, 13, 14, "女")!;
    const round = build(1969, 3, 7, 13, 14, "女", rounded)!;
    expect(round.cycles.map((c) => c.ganzhi.label)).toEqual(exact.cycles.map((c) => c.ganzhi.label));
  });
});

describe("性別未填", () => {
  it("回 null 而不是猜一個方向", () => {
    expect(build(1990, 5, 20, 14, 30, "不指定")).toBeNull();
    expect(build(1990, 5, 20, 14, 30, null)).toBeNull();
  });
});

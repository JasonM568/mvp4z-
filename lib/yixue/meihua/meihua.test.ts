// 梅花易數 golden case。
//
// 主案例的每一個數字都經手工驗算（見各條註解的算式），不是把程式輸出貼回來當期望值——
// 那樣的測試只能防迴歸，不能證明第一次就算對了。
//
// 另有四條「流派分歧」測試，對應 SCHOOL-DECISIONS.md 決策 1、5、6 的要求：
// 每個可切換的選項都必須有一個案例能證明它真的會排出不同的卦。

import { describe, expect, it } from "vitest";
import { buildMeihuaChart } from "./meihua";
import { makeSolarTime } from "../calendar/tyme";
import { resolveSchool } from "../school/schools";
import type { SchoolConfig } from "../school/types";

const BASE = resolveSchool("fengyi-v1");

function withSchool(patch: Partial<SchoolConfig["meihua"]>, calendarPatch: Partial<SchoolConfig["calendar"]> = {}): SchoolConfig {
  return {
    ...BASE,
    calendar: { ...BASE.calendar, ...calendarPatch },
    meihua: { ...BASE.meihua, ...patch }
  };
}

describe("梅花｜時間起卦（農曆＋地支序，預設流派）", () => {
  // 2026-09-08 10:33 → 農曆 2026 年七月廿七，丙午年，巳時。
  //   年 午=7、月 7、日 27、時 巳=6
  //   上卦 (7+7+27)=41，41÷8 餘 1 → 乾
  //   下卦 41+6=47，47÷8 餘 7 → 艮
  //   動爻 47÷6 餘 5 → 第五爻
  const chart = buildMeihuaChart({ mode: "時間起卦" }, BASE, makeSolarTime(2026, 9, 8, 10, 33));

  it("四個起卦數字與手算一致", () => {
    expect(chart.derivation.slice(0, 4).map((s) => s.value)).toEqual([7, 7, 27, 6]);
  });

  it("上下卦與動爻", () => {
    expect(chart.upperNumber).toBe(1); // 乾
    expect(chart.lowerNumber).toBe(7); // 艮
    expect(chart.movingLine).toBe(5);
  });

  it("本卦、互卦、變卦", () => {
    expect(chart.ben.name).toBe("天山遯"); // 上乾下艮
    // 遯六爻（初起）陰陰陽陽陽陽 → 二三四＝陰陽陽＝巽，三四五＝陽陽陽＝乾
    expect(chart.hu.name).toBe("天風姤");
    // 五爻由陽變陰 → 上卦乾變離
    expect(chart.bian.name).toBe("火山旅");
  });

  it("動爻在上卦，故上卦為用、下卦為體", () => {
    expect(chart.yong).toMatchObject({ position: "上卦", trigram: { name: "乾", element: "金" } });
    expect(chart.ti).toMatchObject({ position: "下卦", trigram: { name: "艮", element: "土" } });
  });

  it("體艮土生用乾金，判為體生用（耗力）", () => {
    expect(chart.tiYong.relation).toBe("體生用");
  });
});

describe("梅花｜體用定位", () => {
  it("動爻在下卦時，體用與上例相反", () => {
    // 直接指定上乾下艮、動爻第二爻：動爻落在下卦，故下卦為用、上卦為體。
    const chart = buildMeihuaChart(
      { mode: "上下卦起卦", upper: "乾", lower: "艮", movingLine: 2 },
      BASE,
      null
    );
    expect(chart.ti).toMatchObject({ position: "上卦", trigram: { name: "乾" } });
    expect(chart.yong).toMatchObject({ position: "下卦", trigram: { name: "艮" } });
    // 體乾金、用艮土：土生金 → 用生體
    expect(chart.tiYong.relation).toBe("用生體");
  });

  it("體用同五行判為比和", () => {
    // 乾金、兌金
    const chart = buildMeihuaChart({ mode: "上下卦起卦", upper: "乾", lower: "兌", movingLine: 1 }, BASE, null);
    expect(chart.tiYong.relation).toBe("比和");
  });

  it("用剋體：體巽木、用兌金", () => {
    const chart = buildMeihuaChart({ mode: "上下卦起卦", upper: "巽", lower: "兌", movingLine: 1 }, BASE, null);
    expect(chart.ti.trigram.name).toBe("巽");
    expect(chart.yong.trigram.name).toBe("兌");
    expect(chart.tiYong.relation).toBe("用剋體");
  });

  it("動爻超出 1–6 直接報錯，不默默取模", () => {
    expect(() => buildMeihuaChart({ mode: "上下卦起卦", upper: "乾", lower: "坤", movingLine: 7 }, BASE, null)).toThrow();
  });
});

describe("梅花｜數字起卦", () => {
  it("兩個數：第一數上卦、第二數下卦、和為動爻", () => {
    // 15÷8 餘 7 → 艮；22÷8 餘 6 → 坎；(15+22)=37，37÷6 餘 1 → 初爻
    const chart = buildMeihuaChart({ mode: "數字起卦", numbers: [15, 22] }, BASE, null);
    expect(chart.upperNumber).toBe(7);
    expect(chart.lowerNumber).toBe(6);
    expect(chart.movingLine).toBe(1);
    expect(chart.ben.name).toBe("山水蒙");
  });

  it("單一兩位數：拆十位與個位", () => {
    // 47 → 上卦取 4（震）、下卦取 7（艮）、動爻 (4+7)=11，11÷6 餘 5
    const chart = buildMeihuaChart({ mode: "數字起卦", numbers: [47] }, BASE, null);
    expect(chart.ben.name).toBe("雷山小過");
    expect(chart.movingLine).toBe(5);
  });

  it("沒有數字要報錯", () => {
    expect(() => buildMeihuaChart({ mode: "數字起卦", numbers: [] }, BASE, null)).toThrow();
  });
});

describe("梅花｜流派分歧（每個選項都要能排出不同的卦）", () => {
  const t = makeSolarTime(2026, 9, 8, 10, 33);

  it("決策 5：農曆 vs 國曆，同一時刻排出不同本卦", () => {
    const lunar = buildMeihuaChart({ mode: "時間起卦" }, withSchool({ timeQuaDateBasis: "農曆" }), t);
    const solar = buildMeihuaChart({ mode: "時間起卦" }, withSchool({ timeQuaDateBasis: "國曆" }), t);
    // 農曆七月廿七 vs 國曆九月八日 → 日數 27 vs 8
    expect(lunar.derivation[2].value).toBe(27);
    expect(solar.derivation[2].value).toBe(8);
    expect(solar.ben.name).not.toBe(lunar.ben.name);
  });

  it("決策 6：地支序 vs 農曆年數，同一時刻排出不同本卦", () => {
    const branch = buildMeihuaChart({ mode: "時間起卦" }, withSchool({ timeQuaYearNumber: "地支序" }), t);
    const year = buildMeihuaChart({ mode: "時間起卦" }, withSchool({ timeQuaYearNumber: "農曆年數" }), t);
    expect(branch.derivation[0].value).toBe(7);
    expect(year.derivation[0].value).toBe(2026);
    expect(year.ben.name).not.toBe(branch.ben.name);
  });

  it("決策 1 連動：晚子時的農曆日跟著日柱流派進位", () => {
    // 2024-01-01 23:30 是晚子。農曆為 2023 年十一月二十；進位派算廿一。
    const lateZiTime = makeSolarTime(2024, 1, 1, 23, 30);
    const same = buildMeihuaChart({ mode: "時間起卦" }, withSchool({}, { lateZiDayPillar: "same" }), lateZiTime);
    const next = buildMeihuaChart({ mode: "時間起卦" }, withSchool({}, { lateZiDayPillar: "next" }), lateZiTime);
    expect(same.derivation[2].value).toBe(20);
    expect(next.derivation[2].value).toBe(21);
    expect(next.ben.name).not.toBe(same.ben.name);
  });

  it("非晚子時不受日柱流派影響", () => {
    const evening = makeSolarTime(2024, 1, 1, 22, 30);
    const same = buildMeihuaChart({ mode: "時間起卦" }, withSchool({}, { lateZiDayPillar: "same" }), evening);
    const next = buildMeihuaChart({ mode: "時間起卦" }, withSchool({}, { lateZiDayPillar: "next" }), evening);
    expect(next.ben.name).toBe(same.ben.name);
  });
});

describe("梅花｜互卦與變卦對體卦的生剋也一併算出", () => {
  const chart = buildMeihuaChart({ mode: "時間起卦" }, BASE, makeSolarTime(2026, 9, 8, 10, 33));

  it("三組關係都有值，且都是五種關係之一", () => {
    const valid = ["用生體", "體生用", "用剋體", "體剋用", "比和"];
    expect(valid).toContain(chart.tiYong.relation);
    expect(valid).toContain(chart.huToTi.upper.relation);
    expect(valid).toContain(chart.huToTi.lower.relation);
    expect(valid).toContain(chart.bianToTi.relation);
  });

  it("變卦對體：體艮土、變卦用位為離火，火生土 → 用生體", () => {
    // 本卦動爻在上卦，變卦的上卦（離）即結果方。離火生艮土。
    expect(chart.bianToTi.relation).toBe("用生體");
  });
});

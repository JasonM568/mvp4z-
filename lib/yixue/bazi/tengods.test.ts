// 十神、藏干、五行分佈。
//
// 藏干表是硬資料。這裡的期望值來自 2026-09-23 由 Codex 獨立產出的對照表
// （不看本專案程式，只依典籍常用排法），兩邊逐格相同才寫進來——
// 不是把程式輸出貼回來當答案。
//
// Codex 同時指出：**藏干的中氣與餘氣排序有流派差異**，爭議在丑辰巳未戌，
// 巳另有「戊中氣、庚餘氣」的排法。本氣無爭議。本引擎採通行排法，
// 且刻意不給權重（權重是老師要拍板的事），所以排序差異不影響任何計算結果，
// 只影響 role 標籤。已記入 SCHOOL-DECISIONS.md 的八字待決項。

import { describe, expect, it } from "vitest";
import { HIDDEN_STEM_TABLE, buildBaziDerived, hiddenStemsOf, tenGodOf } from "./tengods";
import { makeSolarTime, yearMonthPillars, dayPillar, hourPillarFromDayStem, stemIndexOf } from "../calendar/tyme";

describe("地支藏干", () => {
  /** 與 Codex 獨立產出的表逐格比對。 */
  const REFERENCE: Record<string, string[]> = {
    子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"],
    辰: ["戊", "乙", "癸"], 巳: ["丙", "庚", "戊"], 午: ["丁", "己"], 未: ["己", "丁", "乙"],
    申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"]
  };

  it("十二支逐格與獨立對照表相同", () => {
    for (const [branch, expected] of Object.entries(REFERENCE)) {
      expect(HIDDEN_STEM_TABLE[branch], branch).toEqual(expected);
    }
    expect(Object.keys(HIDDEN_STEM_TABLE)).toHaveLength(12);
  });

  it("四正只藏本氣（午多一個己）", () => {
    expect(hiddenStemsOf("子")).toHaveLength(1);
    expect(hiddenStemsOf("卯")).toHaveLength(1);
    expect(hiddenStemsOf("酉")).toHaveLength(1);
    expect(hiddenStemsOf("午")).toHaveLength(2);
  });

  it("四生（寅申巳亥）與四庫（辰戌丑未）藏得比四正多", () => {
    for (const b of ["寅", "申", "巳"]) expect(hiddenStemsOf(b).length, b).toBe(3);
    for (const b of ["辰", "戌", "丑", "未"]) expect(hiddenStemsOf(b).length, b).toBe(3);
    expect(hiddenStemsOf("亥")).toHaveLength(2);
  });

  it("本氣的五行必與該地支本身的五行相同", () => {
    // 這條把藏干表與 ganzhi.ts 的地支五行綁在一起，抄錯本氣會被抓到。
    const BRANCH_ELEMENT: Record<string, string> = {
      子:"水", 丑:"土", 寅:"木", 卯:"木", 辰:"土", 巳:"火",
      午:"火", 未:"土", 申:"金", 酉:"金", 戌:"土", 亥:"水"
    };
    for (const [b, el] of Object.entries(BRANCH_ELEMENT)) {
      expect(hiddenStemsOf(b)[0].element, b).toBe(el);
    }
  });

  it("角色依序為本氣、中氣、餘氣", () => {
    expect(hiddenStemsOf("丑").map((h) => h.role)).toEqual(["本氣", "中氣", "餘氣"]);
    expect(hiddenStemsOf("子").map((h) => h.role)).toEqual(["本氣"]);
  });
});

describe("十神", () => {
  it("甲日主對十天干（逐一手算）", () => {
    // 甲＝陽木。同木同陽比肩、同木異陽劫財；木生火故丙食神丁傷官；
    // 木剋土故戊偏財己正財；金剋木故庚七殺辛正官；水生木故壬偏印癸正印。
    const got = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"].map((s) => tenGodOf("甲", s));
    expect(got).toEqual(["比肩","劫財","食神","傷官","偏財","正財","七殺","正官","偏印","正印"]);
  });

  it("陰日主：乙木對十天干，正偏互換", () => {
    const got = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"].map((s) => tenGodOf("乙", s));
    expect(got).toEqual(["劫財","比肩","傷官","食神","正財","偏財","正官","七殺","正印","偏印"]);
  });

  it("每個日主對十天干恰好給出十個不同的十神", () => {
    for (const day of ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"]) {
      const gods = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"].map((s) => tenGodOf(day, s));
      expect(new Set(gods).size, day).toBe(10);
    }
  });
});

describe("組裝", () => {
  // 1985-07-12 10:30 → 四柱 乙丑 癸未 壬子 乙巳（稽核時實測值）
  function pillarsFor() {
    const t = makeSolarTime(1985, 7, 12, 10, 30);
    const ym = yearMonthPillars(t);
    const d = dayPillar(t, "next");
    return {
      year: { ganzhi: ym.year },
      month: { ganzhi: ym.month },
      day: { ganzhi: d },
      hour: { ganzhi: hourPillarFromDayStem(stemIndexOf(d), 10) }
    };
  }

  it("日主標「日主」而不是「比肩」", () => {
    // 標比肩會讓模型以為命局裡多了一顆比劫。
    const d = buildBaziDerived(pillarsFor() as never);
    expect(d.tenGods.find((p) => p.position === "日")!.stemGod).toBe("日主");
  });

  it("四柱都有十神與藏干", () => {
    const d = buildBaziDerived(pillarsFor() as never);
    expect(d.tenGods).toHaveLength(4);
    for (const p of d.tenGods) {
      expect(p.stemGod, p.position).toBeTruthy();
      expect(p.hidden.length, p.position).toBeGreaterThan(0);
      for (const h of p.hidden) expect(h.god, `${p.position}/${h.stem}`).toBeTruthy();
    }
  });

  it("三種五行數法都給，總數各自合理", () => {
    const d = buildBaziDerived(pillarsFor() as never);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    // 四個天干、四個地支本氣各四個；全藏干必定 ≥ 四個。
    expect(sum(d.distribution.stems)).toBe(4);
    expect(sum(d.distribution.branchMain)).toBe(4);
    expect(sum(d.distribution.allHidden)).toBeGreaterThanOrEqual(4);
    // 五行五個 key 都要在，缺的補 0 而不是不存在——下游做除法會變 NaN。
    for (const k of ["木","火","土","金","水"]) {
      expect(d.distribution.stems).toHaveProperty(k);
    }
  });

  it("沒有旺衰分數——權重是流派分歧，未簽核前不給結論", () => {
    const d = buildBaziDerived(pillarsFor() as never) as unknown as Record<string, unknown>;
    expect("strength" in d).toBe(false);
    expect("score" in d).toBe(false);
  });
});

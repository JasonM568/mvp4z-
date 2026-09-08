import { describe, expect, it } from "vitest";
import {
  EARTH_BRANCHES,
  HEAVEN_STEMS,
  clashOf,
  combineOf,
  isClash,
  isCombine,
  branchElement,
  voidBranches
} from "./ganzhi";
import { EARTH_BRANCH_NAMES } from "../calendar/tyme";

describe("干支基礎", () => {
  it("地支表與曆法層完全一致（防兩份名稱表漂移）", () => {
    expect([...EARTH_BRANCHES]).toEqual([...EARTH_BRANCH_NAMES]);
  });

  it("天干十個、地支十二個", () => {
    expect(HEAVEN_STEMS).toHaveLength(10);
    expect(EARTH_BRANCHES).toHaveLength(12);
  });

  it("地支五行：四庫皆土，其餘依序", () => {
    expect(["辰", "戌", "丑", "未"].map(branchElement)).toEqual(["土", "土", "土", "土"]);
    expect(branchElement("子")).toBe("水");
    expect(branchElement("午")).toBe("火");
    expect(branchElement("寅")).toBe("木");
    expect(branchElement("申")).toBe("金");
  });
});

describe("沖與合", () => {
  it("六沖六組全數對上", () => {
    for (const [a, b] of [["子", "午"], ["丑", "未"], ["寅", "申"], ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]]) {
      expect(isClash(a, b), `${a}${b}`).toBe(true);
      expect(isClash(b, a), `${b}${a}`).toBe(true);
      expect(clashOf(a)).toBe(b);
      expect(clashOf(b)).toBe(a);
    }
  });

  it("六合六組全數對上", () => {
    for (const [a, b] of [["子", "丑"], ["寅", "亥"], ["卯", "戌"], ["辰", "酉"], ["巳", "申"], ["午", "未"]]) {
      expect(isCombine(a, b), `${a}${b}`).toBe(true);
      expect(combineOf(a)).toBe(b);
      expect(combineOf(b)).toBe(a);
    }
  });

  it("沖與合互斥，且每支各只有一個沖、一個合", () => {
    for (const b of EARTH_BRANCHES) {
      expect(clashOf(b)).not.toBe(combineOf(b));
      expect(EARTH_BRANCHES.filter((x) => isClash(b, x))).toHaveLength(1);
      expect(EARTH_BRANCHES.filter((x) => isCombine(b, x))).toHaveLength(1);
    }
  });
});

describe("旬空", () => {
  it("六旬的旬首各自對到正確的空亡", () => {
    expect(voidBranches("甲", "子")).toEqual(["戌", "亥"]);
    expect(voidBranches("甲", "戌")).toEqual(["申", "酉"]);
    expect(voidBranches("甲", "申")).toEqual(["午", "未"]);
    expect(voidBranches("甲", "午")).toEqual(["辰", "巳"]);
    expect(voidBranches("甲", "辰")).toEqual(["寅", "卯"]);
    expect(voidBranches("甲", "寅")).toEqual(["子", "丑"]);
  });

  it("同一旬內十日的空亡相同", () => {
    // 甲子旬：甲子、乙丑、丙寅…癸酉，全部空戌亥。
    const decade = [["甲","子"],["乙","丑"],["丙","寅"],["丁","卯"],["戊","辰"],["己","巳"],["庚","午"],["辛","未"],["壬","申"],["癸","酉"]];
    for (const [g, z] of decade) {
      expect(voidBranches(g, z), `${g}${z}`).toEqual(["戌", "亥"]);
    }
  });

  it("空亡的兩支必相鄰，且不在該旬出現過", () => {
    const decade = [["甲","戌"],["乙","亥"],["丙","子"],["丁","丑"],["戊","寅"],["己","卯"],["庚","辰"],["辛","巳"],["壬","午"],["癸","未"]];
    const used = new Set(decade.map(([, z]) => z));
    const [a, b] = voidBranches("甲", "戌");
    expect(used.has(a)).toBe(false);
    expect(used.has(b)).toBe(false);
  });
});

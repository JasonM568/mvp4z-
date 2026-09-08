// 六十四卦表與八卦爻象的自我驗證。
//
// 這張表是手工輸入的硬資料，錯一格不會有任何人發現——除非有人剛好卜到那一卦。
// 所以這裡不逐格比對（那只是把同一份資料抄兩遍），改用結構性質交叉驗證：
// 卦名本身就編碼了上下卦（「天澤履」＝上天下澤），可以拿來反推表格對不對。

import { describe, expect, it } from "vitest";
import {
  TRIGRAMS,
  hexagramByLines,
  hexagramOf,
  mod6To6,
  mod8To8,
  mutualHexagram,
  transformLines,
  trigramByLines,
  trigramByNumber,
  type HexagramLines
} from "./trigram";

describe("八卦基礎", () => {
  it("先天數 1–8 依序為乾兌離震巽坎艮坤", () => {
    expect(TRIGRAMS.map((t) => t.name)).toEqual(["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]);
    expect(TRIGRAMS.map((t) => t.xiantianNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("八卦爻象兩兩相異，且陰陽組合恰好覆蓋 8 種", () => {
    const keys = TRIGRAMS.map((t) => t.lines.map((v) => (v ? 1 : 0)).join(""));
    expect(new Set(keys).size).toBe(8);
  });

  it("卦象口訣：乾三連、坤六斷、離中虛、坎中滿、震仰盂、艮覆碗、兌上缺、巽下斷", () => {
    const l = (name: string) => TRIGRAMS.find((t) => t.name === name)!.lines;
    // lines index 0 = 初爻（最下）
    expect(l("乾")).toEqual([true, true, true]);
    expect(l("坤")).toEqual([false, false, false]);
    expect(l("離")[1]).toBe(false); // 中虛：二爻陰
    expect(l("坎")[1]).toBe(true); // 中滿：二爻陽
    expect(l("震")).toEqual([true, false, false]); // 仰盂：僅初爻陽
    expect(l("艮")).toEqual([false, false, true]); // 覆碗：僅上爻陽
    expect(l("兌")[2]).toBe(false); // 上缺：三爻陰
    expect(l("巽")[0]).toBe(false); // 下斷：初爻陰
  });

  it("整除時取 8 與 6，不取 0", () => {
    expect(mod8To8(8)).toBe(8);
    expect(mod8To8(16)).toBe(8);
    expect(mod8To8(9)).toBe(1);
    expect(mod6To6(12)).toBe(6);
    expect(mod6To6(7)).toBe(1);
  });
});

describe("六十四卦表", () => {
  const all = TRIGRAMS.flatMap((u) => TRIGRAMS.map((l) => hexagramOf(u, l)));

  it("共 64 卦且卦名互不重複", () => {
    expect(all).toHaveLength(64);
    expect(new Set(all.map((h) => h.name)).size).toBe(64);
  });

  it("上下卦相同者為八純卦，命名為「Ｘ為Ｙ」", () => {
    for (const t of TRIGRAMS) {
      expect(hexagramOf(t, t).name).toBe(`${t.name}為${t.nature}`);
    }
  });

  it("非純卦的卦名前兩字＝上卦自然象＋下卦自然象", () => {
    // 「天澤履」＝上天下澤。這條把 56 格的表格與 8 個自然象綁在一起，
    // 任何一格抄錯位置都會在這裡爆掉。
    for (const h of all) {
      if (h.upper.name === h.lower.name) continue;
      expect(h.name.slice(0, 2), h.name).toBe(`${h.upper.nature}${h.lower.nature}`);
    }
  });

  it("六爻組裝：前三爻屬下卦、後三爻屬上卦，且能無損還原", () => {
    for (const h of all) {
      expect(h.lines.slice(0, 3)).toEqual([...h.lower.lines]);
      expect(h.lines.slice(3, 6)).toEqual([...h.upper.lines]);
      expect(hexagramByLines(h.lines).name).toBe(h.name);
    }
  });
});

describe("變卦與互卦", () => {
  it("變爻只翻指定爻位，其餘不動", () => {
    const qian = hexagramOf(trigramByNumber(1), trigramByNumber(1)); // 乾為天
    const changed = transformLines(qian.lines, [1]); // 初爻動
    expect(hexagramByLines(changed).name).toBe("天風姤"); // 乾初爻變陰 → 下卦成巽
  });

  it("乾為天的互卦仍是乾為天", () => {
    const qian = hexagramOf(trigramByNumber(1), trigramByNumber(1));
    expect(mutualHexagram(qian.lines).name).toBe("乾為天");
  });

  it("互卦取二三四為下互、三四五為上互，不用初上", () => {
    // 水雷屯：下震上坎。二三四＝陰陰陽…以爻象直接驗算，避免抄書錯。
    const zhun = hexagramOf(trigramByNumber(6), trigramByNumber(4)); // 上坎下震
    expect(zhun.name).toBe("水雷屯");
    const l = zhun.lines;
    const expectedLower = trigramByLines([l[1], l[2], l[3]]);
    const expectedUpper = trigramByLines([l[2], l[3], l[4]]);
    const mutual = mutualHexagram(l);
    expect(mutual.lower.name).toBe(expectedLower.name);
    expect(mutual.upper.name).toBe(expectedUpper.name);
    expect(mutual.name).toBe("山地剝"); // 屯之互為剝，古籍通例
  });

  it("初爻與上爻不影響互卦", () => {
    const base = hexagramOf(trigramByNumber(6), trigramByNumber(4)).lines;
    const flippedEnds = transformLines(transformLines(base, [1]), [6]) as HexagramLines;
    expect(mutualHexagram(flippedEnds).name).toBe(mutualHexagram(base).name);
  });
});

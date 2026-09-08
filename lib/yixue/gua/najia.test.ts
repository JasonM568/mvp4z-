// 八宮與納甲的驗證。
//
// 八宮是規則生成的，所以逐宮比對古籍卦序——只要規則錯一條，整宮的卦名就會跑掉。
// 納甲是硬資料，所以挑古籍常見卦逐爻比對。兩者都不是把程式輸出貼回來當期望值。

import { describe, expect, it } from "vitest";
import { hexagramByLines, hexagramOf, trigramByName, type HexagramLines } from "./trigram";
import { allPalaceEntries, najiaOf, palaceOf, sixGods, sixRelative } from "./najia";

function linesOf(upper: string, lower: string): HexagramLines {
  return hexagramOf(trigramByName(upper), trigramByName(lower)).lines;
}

describe("京房八宮", () => {
  it("六十四卦全部有宮，且不重不漏", () => {
    const entries = allPalaceEntries();
    expect(entries).toHaveLength(64);
    expect(new Set(entries.map(([n]) => n)).size).toBe(64);
  });

  it("每宮恰好八卦", () => {
    const byPalace = new Map<string, number>();
    for (const [, info] of allPalaceEntries()) {
      byPalace.set(info.palace, (byPalace.get(info.palace) || 0) + 1);
    }
    expect([...byPalace.values()]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
  });

  it("乾宮八卦卦序與古籍一致", () => {
    const expected = ["乾為天", "天風姤", "天山遯", "天地否", "風地觀", "山地剝", "火地晉", "火天大有"];
    const positions = ["本宮卦", "一世卦", "二世卦", "三世卦", "四世卦", "五世卦", "遊魂卦", "歸魂卦"];
    expected.forEach((name, i) => {
      const info = palaceOf(name);
      expect(info.palace, name).toBe("乾宮");
      expect(info.position, name).toBe(positions[i]);
    });
  });

  it("坎宮八卦卦序與古籍一致", () => {
    const expected = ["坎為水", "水澤節", "水雷屯", "水火既濟", "澤火革", "雷火豐", "地火明夷", "地水師"];
    expected.forEach((name) => expect(palaceOf(name).palace, name).toBe("坎宮"));
    expect(palaceOf("地火明夷").position).toBe("遊魂卦");
    expect(palaceOf("地水師").position).toBe("歸魂卦");
  });

  it("坤宮與艮宮的歸魂卦", () => {
    // 坤宮歸魂為水地比，艮宮歸魂為風山漸。
    expect(palaceOf("水地比")).toMatchObject({ palace: "坤宮", position: "歸魂卦" });
    expect(palaceOf("風山漸")).toMatchObject({ palace: "艮宮", position: "歸魂卦" });
  });

  it("八個純卦各為自宮本宮卦，世在上爻", () => {
    for (const name of ["乾為天", "兌為澤", "離為火", "震為雷", "巽為風", "坎為水", "艮為山", "坤為地"]) {
      const info = palaceOf(name);
      expect(info.position, name).toBe("本宮卦");
      expect(info.shiYao, name).toBe(6);
      expect(info.yingYao, name).toBe(3);
    }
  });

  it("世應恆隔三位", () => {
    for (const [name, info] of allPalaceEntries()) {
      expect(Math.abs(info.shiYao - info.yingYao), name).toBe(3);
      expect(info.shiYao).toBeGreaterThanOrEqual(1);
      expect(info.shiYao).toBeLessThanOrEqual(6);
    }
  });

  it("卦宮五行取自該宮純卦", () => {
    expect(palaceOf("天山遯").palaceElement).toBe("金"); // 乾宮金
    expect(palaceOf("水雷屯").palaceElement).toBe("水"); // 坎宮水
    expect(palaceOf("地火明夷").palaceElement).toBe("水"); // 坎宮遊魂，仍屬水
  });
});

describe("納甲裝卦", () => {
  it("乾為天：內甲子寅辰、外壬午申戌", () => {
    expect(najiaOf(linesOf("乾", "乾")).map((g) => g.label)).toEqual([
      "甲子", "甲寅", "甲辰", "壬午", "壬申", "壬戌"
    ]);
  });

  it("坤為地：內乙未巳卯、外癸丑亥酉（地支逆行）", () => {
    expect(najiaOf(linesOf("坤", "坤")).map((g) => g.label)).toEqual([
      "乙未", "乙巳", "乙卯", "癸丑", "癸亥", "癸酉"
    ]);
  });

  it("水雷屯：下震庚子寅辰、上坎戊申戌子", () => {
    expect(najiaOf(linesOf("坎", "震")).map((g) => g.label)).toEqual([
      "庚子", "庚寅", "庚辰", "戊申", "戊戌", "戊子"
    ]);
  });

  it("天山遯：下艮丙辰午申、上乾壬午申戌", () => {
    expect(najiaOf(linesOf("乾", "艮")).map((g) => g.label)).toEqual([
      "丙辰", "丙午", "丙申", "壬午", "壬申", "壬戌"
    ]);
  });

  it("水火既濟：下離己卯丑亥、上坎戊申戌子", () => {
    expect(najiaOf(linesOf("坎", "離")).map((g) => g.label)).toEqual([
      "己卯", "己丑", "己亥", "戊申", "戊戌", "戊子"
    ]);
  });

  it("澤風大過：下巽辛丑亥酉、上兌丁亥酉未", () => {
    expect(najiaOf(linesOf("兌", "巽")).map((g) => g.label)).toEqual([
      "辛丑", "辛亥", "辛酉", "丁亥", "丁酉", "丁未"
    ]);
  });

  it("六十四卦（8×8 組合）都裝得出六爻干支，五行皆有效", () => {
    const names = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
    for (const u of names) {
      for (const l of names) {
        const g = najiaOf(linesOf(u, l));
        expect(g, `${u}/${l}`).toHaveLength(6);
        g.forEach((x) => expect(["金", "木", "水", "火", "土"]).toContain(x.element));
      }
    }
  });

  it("同一個三畫卦作內卦與作外卦的干支不同（乾坤換干、其餘換支）", () => {
    const qian = najiaOf(linesOf("乾", "乾"));
    expect(qian[0].stem).toBe("甲"); // 內卦
    expect(qian[3].stem).toBe("壬"); // 外卦
    const zhen = najiaOf(linesOf("震", "震"));
    expect(zhen[0].stem).toBe("庚");
    expect(zhen[3].stem).toBe("庚"); // 震內外同干
    expect(zhen[0].branch).not.toBe(zhen[3].branch);
  });
});

describe("六親", () => {
  it("以卦宮五行為我，五種關係各自對上", () => {
    expect(sixRelative("金", "金")).toBe("兄弟");
    expect(sixRelative("金", "土")).toBe("父母"); // 土生金
    expect(sixRelative("金", "水")).toBe("子孫"); // 金生水
    expect(sixRelative("金", "火")).toBe("官鬼"); // 火剋金
    expect(sixRelative("金", "木")).toBe("妻財"); // 金剋木
  });

  it("乾為天六爻六親：子孫、妻財、父母、官鬼、兄弟、父母", () => {
    // 乾宮金。子水＝子孫、寅木＝妻財、辰土＝父母、午火＝官鬼、申金＝兄弟、戌土＝父母。
    const info = palaceOf("乾為天");
    const got = najiaOf(linesOf("乾", "乾")).map((g) => sixRelative(info.palaceElement, g.element));
    expect(got).toEqual(["子孫", "妻財", "父母", "官鬼", "兄弟", "父母"]);
  });
});

describe("六神", () => {
  it("甲乙日起青龍，順排至玄武", () => {
    expect(sixGods("甲")).toEqual(["青龍", "朱雀", "勾陳", "螣蛇", "白虎", "玄武"]);
    expect(sixGods("乙")).toEqual(sixGods("甲"));
  });

  it("戊日起勾陳、己日起螣蛇（戊己不同起點）", () => {
    expect(sixGods("戊")[0]).toBe("勾陳");
    expect(sixGods("己")[0]).toBe("螣蛇");
  });

  it("壬癸日起玄武，循環回青龍", () => {
    expect(sixGods("壬")).toEqual(["玄武", "青龍", "朱雀", "勾陳", "螣蛇", "白虎"]);
  });

  it("任何日干都是六神各一、不重複", () => {
    for (const s of ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]) {
      expect(new Set(sixGods(s)).size, s).toBe(6);
    }
  });
});

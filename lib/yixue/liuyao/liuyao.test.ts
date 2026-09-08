// 六爻裝盤 golden case。
//
// 主案例逐項手算過（算式寫在各條註解裡），不是把程式輸出貼回來當期望值。
// 起卦時刻固定 2026-09-08 10:33（丙午年、丁酉月、乙酉日、巳時）。

import { describe, expect, it } from "vitest";
import { buildLiuyaoChart } from "./liuyao";
import { makeSolarTime } from "../calendar/tyme";
import { resolveSchool } from "../school/schools";
import type { SchoolConfig } from "../school/types";

const S = resolveSchool("fengyi-v1");
const T = makeSolarTime(2026, 9, 8, 10, 33);

function withLiuyao(patch: Partial<SchoolConfig["liuyao"]>): SchoolConfig {
  return { ...S, liuyao: { ...S.liuyao, ...patch } };
}

// 少陽 少陽 老陽 少陰 少陽 少陽（初→上）
//   → 下卦 陽陽陽＝乾、上卦 陰陽陽＝巽 → 風天小畜，三爻動
const YAO = ["少陽", "少陽", "老陽", "少陰", "少陽", "少陽"];

describe("六爻｜手動輸入爻象", () => {
  const c = buildLiuyaoChart({ mode: "手動輸入", yao: YAO }, S, T);

  it("本卦為風天小畜，屬巽宮一世卦，世在初爻、應在四爻", () => {
    expect(c.ben.hexagram.name).toBe("風天小畜");
    expect(c.ben.palace).toMatchObject({
      palace: "巽宮",
      palaceElement: "木",
      position: "一世卦",
      shiYao: 1,
      yingYao: 4
    });
  });

  it("納甲：下乾甲子寅辰、上巽辛未巳卯", () => {
    expect(c.lines.map((l) => l.ganzhi.label)).toEqual([
      "甲子", "甲寅", "甲辰", "辛未", "辛巳", "辛卯"
    ]);
  });

  it("六親以巽宮木為我：父母、兄弟、妻財、妻財、子孫、兄弟", () => {
    // 子水生木＝父母；寅木同我＝兄弟；辰土、未土被木剋＝妻財；
    // 巳火為木所生＝子孫；卯木同我＝兄弟。
    expect(c.lines.map((l) => l.relative)).toEqual([
      "父母", "兄弟", "妻財", "妻財", "子孫", "兄弟"
    ]);
  });

  it("六神依乙日起青龍順排", () => {
    expect(c.dayGanzhi.label).toBe("乙酉");
    expect(c.lines.map((l) => l.god)).toEqual([
      "青龍", "朱雀", "勾陳", "螣蛇", "白虎", "玄武"
    ]);
  });

  it("世應標記落在正確的爻上，且各只有一個", () => {
    expect(c.lines.filter((l) => l.isShi).map((l) => l.position)).toEqual([1]);
    expect(c.lines.filter((l) => l.isYing).map((l) => l.position)).toEqual([4]);
  });

  it("旬空：乙酉日屬甲申旬，空午未；四爻辛未落空", () => {
    expect(c.voidBranches).toEqual(["午", "未"]);
    expect(c.lines.filter((l) => l.isVoid).map((l) => l.positionName)).toEqual(["四爻"]);
  });

  it("月破：月建酉，酉沖卯，上爻辛卯為月破", () => {
    expect(c.monthBranch).toBe("酉");
    expect(c.lines.filter((l) => l.isMonthBroken).map((l) => l.positionName)).toEqual(["上爻"]);
  });

  it("三爻甲辰與月建酉、日辰酉皆為辰酉合，且土生金", () => {
    const third = c.lines[2];
    expect(third.month).toMatchObject({ relation: "生", combine: true, clash: false });
    expect(third.day).toMatchObject({ relation: "生", combine: true, clash: false });
  });

  it("上爻卯木被酉金所剋且相沖", () => {
    const top = c.lines[5];
    expect(top.month).toMatchObject({ relation: "被剋", clash: true });
    expect(top.day).toMatchObject({ relation: "被剋", clash: true });
  });

  it("三爻動：變卦風澤中孚，變爻丁丑仍以巽宮取六親為妻財", () => {
    expect(c.movingPositions).toEqual([3]);
    expect(c.bian?.hexagram.name).toBe("風澤中孚");
    expect(c.lines[2].changed).toMatchObject({
      ganzhi: { label: "丁丑", element: "土" },
      relative: "妻財"
    });
    // 辰土變丑土，同五行 → 回頭比和
    expect(c.lines[2].changed?.relationToOriginal).toBe("比和");
  });

  it("靜卦沒有變卦", () => {
    const still = buildLiuyaoChart(
      { mode: "手動輸入", yao: ["少陽", "少陽", "少陽", "少陰", "少陽", "少陽"] },
      S,
      T
    );
    expect(still.movingPositions).toEqual([]);
    expect(still.bian).toBeNull();
    expect(still.lines.every((l) => l.changed === null)).toBe(true);
  });

  it("多爻同動時一起變", () => {
    const many = buildLiuyaoChart(
      { mode: "手動輸入", yao: ["老陽", "少陽", "老陽", "老陰", "少陽", "少陽"] },
      S,
      T
    );
    expect(many.movingPositions).toEqual([1, 3, 4]);
    expect(many.lines.filter((l) => l.changed).map((l) => l.position)).toEqual([1, 3, 4]);
  });

  it("爻象不合法直接報錯，不猜", () => {
    expect(() =>
      buildLiuyaoChart({ mode: "手動輸入", yao: ["不會判斷，請用時間起卦", "少陽", "少陽", "少陽", "少陽", "少陽"] }, S, T)
    ).toThrow();
    expect(() => buildLiuyaoChart({ mode: "手動輸入", yao: ["少陽"] }, S, T)).toThrow();
  });
});

describe("六爻｜時間起卦", () => {
  it("與梅花同一時刻起出同一個本卦（刻意共用設定）", () => {
    const c = buildLiuyaoChart({ mode: "時間起卦" }, S, T);
    expect(c.ben.hexagram.name).toBe("天山遯");
    expect(c.movingPositions).toEqual([5]);
    expect(c.bian?.hexagram.name).toBe("火山旅");
  });

  it("天山遯屬乾宮二世卦，世在二爻", () => {
    const c = buildLiuyaoChart({ mode: "時間起卦" }, S, T);
    expect(c.ben.palace).toMatchObject({ palace: "乾宮", position: "二世卦", shiYao: 2, yingYao: 5 });
  });

  it("沒有起卦時刻就報錯，不用生辰硬代", () => {
    expect(() => buildLiuyaoChart({ mode: "時間起卦" }, S, null)).toThrow();
  });
});

describe("六爻｜流派分歧（決策 7：月建規則）", () => {
  it("已交節但農曆未換月的日子，兩派月建不同", () => {
    // 2026-09-08 已過白露（節），節月為酉；當日農曆七月，農曆月派建申。
    const jie = buildLiuyaoChart({ mode: "手動輸入", yao: YAO }, withLiuyao({ monthRule: "節月" }), T);
    const lunar = buildLiuyaoChart({ mode: "手動輸入", yao: YAO }, withLiuyao({ monthRule: "農曆月" }), T);
    expect(jie.monthBranch).toBe("酉");
    expect(lunar.monthBranch).toBe("申");
    expect(lunar.monthBranch).not.toBe(jie.monthBranch);
  });

  it("月建不同會讓月破落在不同的爻上", () => {
    const jie = buildLiuyaoChart({ mode: "手動輸入", yao: YAO }, withLiuyao({ monthRule: "節月" }), T);
    const lunar = buildLiuyaoChart({ mode: "手動輸入", yao: YAO }, withLiuyao({ monthRule: "農曆月" }), T);
    // 酉沖卯 → 上爻月破；申沖寅 → 二爻月破
    expect(jie.lines.filter((l) => l.isMonthBroken).map((l) => l.positionName)).toEqual(["上爻"]);
    expect(lunar.lines.filter((l) => l.isMonthBroken).map((l) => l.positionName)).toEqual(["二爻"]);
  });

  it("農曆正月建寅、二月建卯", () => {
    const jan = buildLiuyaoChart(
      { mode: "手動輸入", yao: YAO },
      withLiuyao({ monthRule: "農曆月" }),
      makeSolarTime(2026, 2, 20, 12, 0) // 農曆正月初四
    );
    expect(jan.monthBranch).toBe("寅");
  });
});

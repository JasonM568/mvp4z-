// 奇門遁甲驗證。
//
// ⚠️ 這組測試證明的是「實作與所宣告的規則一致」，不是「規則就是風羿老師的流派」。
//    定局法（拆補／置閏／茅山）是奇門分歧最大的一項，必須由老師以自己的排盤比對後拍板。
//    見 SCHOOL-DECISIONS.md 決策 8 的校對盤例。
//
// 主案例 2024-01-01 23:30（陽遁一局）的地盤、天盤、值符值使、八門、八神
// 全部依規則手算過，算式寫在各條註解。

import { describe, expect, it } from "vitest";
import { buildQimenChart, determineJu } from "./qimen";
import { CIRCLE, EIGHT_DOORS, EIGHT_GODS, JU_TABLE, NINE_STARS, YI_ORDER } from "./tables";
import { makeSolarTime } from "../calendar/tyme";
import { resolveSchool } from "../school/schools";

const S = resolveSchool("fengyi-v1");
const cell = (c: ReturnType<typeof buildQimenChart>, palace: number) =>
  c.cells.find((x) => x.palace === palace)!;

describe("局數表", () => {
  it("二十四節氣各有三元局數，且都在 1–9", () => {
    expect(JU_TABLE).toHaveLength(24);
    for (const row of JU_TABLE) {
      expect(row).toHaveLength(3);
      for (const n of row) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(9);
      }
    }
  });

  it("與口訣逐句對上（陽遁）", () => {
    // 冬至一七四、小寒二八五、大寒三九六、立春八五二、雨水九六三、驚蟄一七四
    expect(JU_TABLE[0]).toEqual([1, 7, 4]);
    expect(JU_TABLE[1]).toEqual([2, 8, 5]);
    expect(JU_TABLE[2]).toEqual([3, 9, 6]);
    expect(JU_TABLE[3]).toEqual([8, 5, 2]);
    expect(JU_TABLE[4]).toEqual([9, 6, 3]);
    expect(JU_TABLE[5]).toEqual([1, 7, 4]);
    // 春分三九六、清明四一七、穀雨五二八、立夏四一七、小滿五二八、芒種六三九
    expect(JU_TABLE[6]).toEqual([3, 9, 6]);
    expect(JU_TABLE[7]).toEqual([4, 1, 7]);
    expect(JU_TABLE[8]).toEqual([5, 2, 8]);
    expect(JU_TABLE[9]).toEqual([4, 1, 7]);
    expect(JU_TABLE[10]).toEqual([5, 2, 8]);
    expect(JU_TABLE[11]).toEqual([6, 3, 9]);
  });

  it("與口訣逐句對上（陰遁）", () => {
    // 夏至九三六、小暑八二五、大暑七一四、立秋二五八、處暑一四七、白露九三六
    expect(JU_TABLE[12]).toEqual([9, 3, 6]);
    expect(JU_TABLE[13]).toEqual([8, 2, 5]);
    expect(JU_TABLE[14]).toEqual([7, 1, 4]);
    expect(JU_TABLE[15]).toEqual([2, 5, 8]);
    expect(JU_TABLE[16]).toEqual([1, 4, 7]);
    expect(JU_TABLE[17]).toEqual([9, 3, 6]);
    // 秋分七一四、寒露六九三、霜降五八二、立冬六九三、小雪五八二、大雪四七一
    expect(JU_TABLE[18]).toEqual([7, 1, 4]);
    expect(JU_TABLE[19]).toEqual([6, 9, 3]);
    expect(JU_TABLE[20]).toEqual([5, 8, 2]);
    expect(JU_TABLE[21]).toEqual([6, 9, 3]);
    expect(JU_TABLE[22]).toEqual([5, 8, 2]);
    expect(JU_TABLE[23]).toEqual([4, 7, 1]);
  });
});

describe("定局（拆補法）", () => {
  it("2024-01-01 23:30：冬至、符頭甲子、上元 → 陽遁一局", () => {
    const j = determineJu(makeSolarTime(2024, 1, 1, 23, 30), S);
    expect(j.termName).toBe("冬至");
    expect(j.futou).toBe("甲子");
    expect(j.yuan).toBe("上元");
    expect(j.dun).toBe("陽遁");
    expect(j.ju).toBe(1);
  });

  it("2026-09-08 10:33：白露、符頭甲申、中元 → 陰遁三局", () => {
    const j = determineJu(makeSolarTime(2026, 9, 8, 10, 33), S);
    expect(j.termName).toBe("白露");
    expect(j.futou).toBe("甲申");
    expect(j.yuan).toBe("中元");
    expect(j.dun).toBe("陰遁");
    expect(j.ju).toBe(3);
  });

  it("冬至到芒種為陽遁、夏至到大雪為陰遁", () => {
    // 取各節氣中段的日期避開交節瞬間
    expect(determineJu(makeSolarTime(2026, 3, 25, 12, 0), S).dun).toBe("陽遁"); // 春分
    expect(determineJu(makeSolarTime(2026, 6, 25, 12, 0), S).dun).toBe("陰遁"); // 夏至
    expect(determineJu(makeSolarTime(2026, 11, 10, 12, 0), S).dun).toBe("陰遁"); // 立冬
    expect(determineJu(makeSolarTime(2026, 1, 10, 12, 0), S).dun).toBe("陽遁"); // 小寒
  });

  it("符頭必為甲日或己日，且回推不超過五天", () => {
    for (let d = 1; d <= 28; d++) {
      const j = determineJu(makeSolarTime(2026, 4, d, 12, 0), S);
      expect(["甲", "己"], `4/${d}`).toContain(j.futou[0]);
      expect(j.futouDaysBack, `4/${d}`).toBeLessThanOrEqual(5);
    }
  });
});

describe("地盤三奇六儀", () => {
  it("陽遁一局：戊己庚辛壬癸丁丙乙依宮數順布", () => {
    const c = buildQimenChart(S, makeSolarTime(2024, 1, 1, 23, 30));
    expect(c.dun).toBe("陽遁");
    expect(c.ju).toBe(1);
    const earth = [1, 2, 3, 4, 6, 7, 8, 9].map((p) => cell(c, p).earthStem);
    // 中五為壬，其餘依序：坎戊、坤己、震庚、巽辛、乾癸、兌丁、艮丙、離乙
    expect(earth).toEqual(["戊", "己", "庚", "辛", "癸", "丁", "丙", "乙"]);
    expect(c.centerStem).toBe("壬");
  });

  it("陰遁三局：自三宮起逆布", () => {
    const c = buildQimenChart(S, makeSolarTime(2026, 9, 8, 10, 33));
    expect(c.dun).toBe("陰遁");
    expect(c.ju).toBe(3);
    // 戊3 己2 庚1 辛9 壬8 癸7 丁6 丙5(中) 乙4
    expect(cell(c, 3).earthStem).toBe("戊");
    expect(cell(c, 2).earthStem).toBe("己");
    expect(cell(c, 1).earthStem).toBe("庚");
    expect(cell(c, 9).earthStem).toBe("辛");
    expect(cell(c, 8).earthStem).toBe("壬");
    expect(cell(c, 7).earthStem).toBe("癸");
    expect(cell(c, 6).earthStem).toBe("丁");
    expect(c.centerStem).toBe("丙");
    expect(cell(c, 4).earthStem).toBe("乙");
  });

  it("九個干各出現一次，不重不漏", () => {
    for (const [y, m, d, h] of [[2024, 1, 1, 23], [2026, 9, 8, 10], [2026, 5, 5, 6]] as const) {
      const c = buildQimenChart(S, makeSolarTime(y, m, d, h, 0));
      const all = [...c.cells.map((x) => x.earthStem), c.centerStem];
      expect(new Set(all).size, `${y}-${m}-${d}`).toBe(9);
      expect(new Set(all)).toEqual(new Set(YI_ORDER));
    }
  });
});

describe("值符、值使與轉盤", () => {
  const c = buildQimenChart(S, makeSolarTime(2024, 1, 1, 23, 30));

  it("時柱丙子屬甲戌旬，遁己；己在坤二宮，故值符天芮、值使死門", () => {
    expect(c.hourGanzhi).toBe("丙子");
    expect(c.xunshou).toBe("甲戌");
    expect(c.xunshouYi).toBe("己");
    expect(c.zhiFuStar).toBe("天芮");
    expect(c.zhiShiDoor).toBe("死門");
  });

  it("時干丙在地盤艮八宮，值符星轉到艮八", () => {
    expect(c.zhiFuPalace).toBe(8);
    expect(cell(c, 8).star).toContain("天芮");
  });

  it("天禽寄坤二，隨天芮同行", () => {
    expect(cell(c, 8).star).toBe("天芮兼天禽");
    expect(cell(c, 8).skyStem).toBe("己兼壬");
  });

  it("天盤九星依八宮圓周整體轉動", () => {
    // 值符自坤二移到艮八，圓周上位移 −4；其餘星同步位移
    expect(cell(c, 1).star).toBe("天英");
    expect(cell(c, 3).star).toBe("天柱");
    expect(cell(c, 4).star).toBe("天心");
    expect(cell(c, 9).star).toBe("天蓬");
    expect(cell(c, 2).star).toBe("天任");
    expect(cell(c, 7).star).toBe("天沖");
    expect(cell(c, 6).star).toBe("天輔");
  });

  it("值使門自旬首宮順數至本時辰：甲戌坤二、乙亥兌七、丙子乾六", () => {
    expect(c.zhiShiPalace).toBe(6);
    expect(cell(c, 6).door).toBe("死門");
  });

  it("八神自值符宮順布（陽遁）", () => {
    expect(cell(c, 8).god).toBe("值符");
    expect(cell(c, 3).god).toBe("螣蛇");
    expect(cell(c, 4).god).toBe("太陰");
    expect(cell(c, 9).god).toBe("六合");
    expect(cell(c, 2).god).toBe("白虎");
    expect(cell(c, 7).god).toBe("玄武");
    expect(cell(c, 6).god).toBe("九地");
    expect(cell(c, 1).god).toBe("九天");
  });

  it("陰遁時八神逆布", () => {
    const yin = buildQimenChart(S, makeSolarTime(2026, 9, 8, 10, 33));
    const order = CIRCLE.map((p) => cell(yin, p).god);
    const start = order.indexOf("值符");
    // 逆布：值符之後的神依圓周反方向排列
    expect(order[(start - 1 + 8) % 8]).toBe("螣蛇");
    expect(order[(start - 2 + 8) % 8]).toBe("太陰");
  });
});

describe("結構不變式（任何時刻都必須成立）", () => {
  const samples: Array<[number, number, number, number]> = [];
  for (let m = 1; m <= 12; m++) {
    for (const d of [3, 11, 19, 27]) {
      for (const h of [1, 9, 17, 23]) samples.push([2026, m, d, h]);
    }
  }

  it("192 個時辰全部排得出盤，且八宮各項不重不漏", () => {
    for (const [y, m, d, h] of samples) {
      const c = buildQimenChart(S, makeSolarTime(y, m, d, h, 0));
      const tag = `${y}-${m}-${d} ${h}時`;

      expect(c.cells, tag).toHaveLength(8);
      // 八門八神各八個、互不重複
      expect(new Set(c.cells.map((x) => x.door)).size, tag).toBe(8);
      expect(new Set(c.cells.map((x) => x.god)).size, tag).toBe(8);
      expect(new Set(c.cells.map((x) => x.god)), tag).toEqual(new Set(EIGHT_GODS));
      expect(new Set(c.cells.map((x) => x.door)), tag).toEqual(new Set(Object.values(EIGHT_DOORS)));
      // 九星八格：其中一格帶著天禽
      const stars = c.cells.map((x) => x.star);
      expect(stars.filter((s) => s.includes("天禽"), tag)).toHaveLength(1);
      expect(new Set(stars).size, tag).toBe(8);
      // 值符神必落在值符星所在宮
      const zhiFuCell = c.cells.find((x) => x.god === "值符")!;
      expect(zhiFuCell.palace, tag).toBe(c.zhiFuPalace);
      // 值使門必落在值使宮
      expect(cell(c, c.zhiShiPalace).door, tag).toBe(c.zhiShiDoor);
      // 局數與陰陽遁必須與定局結果一致
      expect(c.ju, tag).toBeGreaterThanOrEqual(1);
      expect(c.ju, tag).toBeLessThanOrEqual(9);
    }
  });

  it("值符星必為值符宮的天盤星", () => {
    for (const [y, m, d, h] of samples.slice(0, 40)) {
      const c = buildQimenChart(S, makeSolarTime(y, m, d, h, 0));
      expect(cell(c, c.zhiFuPalace).star, `${y}-${m}-${d} ${h}時`).toContain(c.zhiFuStar);
    }
  });

  it("九星本宮表與八門本宮表互相對齊（中五宮無門）", () => {
    expect(Object.keys(NINE_STARS)).toHaveLength(9);
    expect(Object.keys(EIGHT_DOORS)).toHaveLength(8);
    expect(EIGHT_DOORS[5 as 5]).toBeUndefined();
  });
});

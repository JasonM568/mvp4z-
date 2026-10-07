// 後台校對頁顯示的盤面，必須與 SCHOOL-DECISIONS.md 給老師的盤例逐字相同。
// 老師會拿文件與後台、再拿自己的排盤軟體三方比對；兩邊不一致比盤面錯更糟。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildQimenChart, QIMEN_RULE_VERSION } from "./qimen";
import { QIMEN_REVIEW_CASES, qimenGrid, qimenHeadlines } from "./review";
import { makeSolarTime } from "../calendar/tyme";
import { resolveSchool } from "../school/schools";

const S = resolveSchool("fengyi-v1");
const DOC = readFileSync(join(import.meta.dirname, "../../../docs/specs/yixue-engine/SCHOOL-DECISIONS.md"), "utf8");

const EXPECTED = {
  case1: {
    head: ["冬至．符頭甲子．上元．陽遁一局　日柱乙丑　時柱丙子　旬首甲戌遁己", "值符天芮落 8 宮　值使死門落 6 宮　中五宮地盤干壬"],
    grid: [
      ["巽4 太陰 天心 生門 天癸 地辛", "離9 六合 天蓬 傷門 天戊 地乙", "坤2 白虎 天任 杜門 天丙 地己"],
      ["震3 螣蛇 天柱 休門 天丁 地庚", "中5 地壬", "兌7 玄武 天沖 景門 天庚 地丁"],
      ["艮8 值符 天芮兼天禽 開門 天己兼壬 地丙", "坎1 九天 天英 驚門 天乙 地戊", "乾6 九地 天輔 死門 天辛 地癸"]
    ]
  },
  case2: {
    head: ["白露．符頭甲申．中元．陰遁三局　日柱乙酉　時柱辛巳　旬首甲戌遁己", "值符天芮落 9 宮　值使死門落 7 宮　中五宮地盤干丙"],
    grid: [
      ["巽4 螣蛇 天英 傷門 天辛 地乙", "離9 值符 天芮兼天禽 杜門 天己兼丙 地辛", "坤2 九天 天柱 景門 天癸 地己"],
      ["震3 太陰 天輔 生門 天乙 地戊", "中5 地丙", "兌7 九地 天心 死門 天丁 地癸"],
      ["艮8 六合 天沖 休門 天戊 地壬", "坎1 白虎 天任 開門 天壬 地庚", "乾6 玄武 天蓬 驚門 天庚 地丁"]
    ]
  },
  case3: {
    head: ["夏至．符頭己巳．中元．陰遁三局　日柱庚午　時柱癸未　旬首甲戌遁己", "值符天芮落 7 宮　值使死門落 9 宮　中五宮地盤干丙"],
    grid: [
      ["巽4 六合 天沖 景門 天戊 地乙", "離9 太陰 天輔 死門 天乙 地辛", "坤2 螣蛇 天英 驚門 天辛 地己"],
      ["震3 白虎 天任 杜門 天壬 地戊", "中5 地丙", "兌7 值符 天芮兼天禽 開門 天己兼丙 地癸"],
      ["艮8 玄武 天蓬 傷門 天庚 地壬", "坎1 九地 天心 生門 天丁 地庚", "乾6 九天 天柱 休門 天癸 地丁"]
    ]
  }
} as const;

describe("奇門校對盤例", () => {
  it("規則版本有值（簽核綁在它上面）", () => expect(QIMEN_RULE_VERSION).toBeTruthy());

  for (const c of QIMEN_REVIEW_CASES) {
    const chart = buildQimenChart(S, makeSolarTime(c.year, c.month, c.day, c.hour, c.minute));
    it(`${c.id} 盤頭與九宮與預期相同`, () => {
      expect(qimenHeadlines(chart)).toEqual(EXPECTED[c.id].head);
      expect(qimenGrid(chart)).toEqual(EXPECTED[c.id].grid);
    });
    it(`${c.id} 預期值確實出現在給老師的文件裡（防止兩邊各改各的）`, () => {
      expect(DOC).toContain(c.label.split("：")[1]);
      for (const cell of EXPECTED[c.id].grid.flat()) expect(DOC, cell).toContain(cell);
    });
  }
});

describe("提示詞中的奇門校對狀態", async () => {
  const { renderChartForPrompt } = await import("../format/prompt");
  const { buildYixueChart } = await import("../index");
  const chart = buildYixueChart(
    {
      birth: { calendar: "國曆", isLeapMonth: false, year: 1985, month: 7, day: 12, hourBranch: "午", hour: null, minute: null, placeLabel: null, longitude: null, latitude: null },
      modules: { qimen: true },
      qimenTime: { year: 2026, month: 9, day: 8, hour: 10, minute: 33 }
    },
    S
  );
  it("未簽核：要求 AI 明說定局法待校對", () => {
    const text = renderChartForPrompt(chart, "測試流派", "風羿老師　2026-09-08", "");
    expect(text).toContain("奇門定局法校對：尚未經風羿老師比對確認");
    expect(text).toContain("奇門定局法尚待老師校對");
  });
  it("流派已簽核不代表奇門已校對（兩者獨立）", () => {
    const text = renderChartForPrompt(chart, "測試流派", "風羿老師　2026-09-08", "");
    expect(text).toContain("流派簽核：風羿老師　2026-09-08");
    expect(text).not.toContain("奇門定局法校對：已由");
  });
  it("奇門已簽核：印出拍板人與日期，不再要求聲明限制", () => {
    const text = renderChartForPrompt(chart, "測試流派", "", "風羿老師　2026-10-08");
    expect(text).toContain("奇門定局法校對：已由 風羿老師　2026-10-08 比對確認");
    expect(text).not.toContain("尚待老師校對");
  });
});

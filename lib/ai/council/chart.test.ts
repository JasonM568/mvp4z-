// 巽風 council｜表單接排盤引擎的橋接驗證
//
// 重點不是排盤對不對（那由 lib/yixue 的測試把關），而是：
// 1. 會員填的字串能不能正確轉成引擎輸入
// 2. 缺資料時會不會硬撐——該回 null 就要回 null，不可用假值排出一張看似有效的盤
// 3. 盤面進 prompt 後，「這是既定事實」的指令有沒有一起送出去

import { describe, expect, it } from "vitest";
import { resolveSchool } from "@/lib/yixue";
import { renderChartDigest, renderChartForPrompt } from "@/lib/yixue/format/prompt";
import { buildChartForCouncil, toBirthInput } from "./chart";
import { yixueDataBlock, type CouncilInput } from "./personas";

const SCHOOL = resolveSchool("fengyi-v1");

function input(birth: Record<string, unknown> | null = {}): CouncilInput {
  return {
    question: "是否要在第三季擴店",
    topic: "事業／工作",
    yixue: {
      clientName: "王先生",
      modules: { bazi: true },
      ...(birth === null
        ? {}
        : {
            birth: {
              calendar: "國曆",
              isLeapMonth: "否",
              year: 1985,
              month: 7,
              day: 12,
              hourBranch: "午",
              timeKnown: "是",
              ...birth
            }
          })
    }
  } as CouncilInput;
}

describe("表單轉排盤輸入", () => {
  it("正常資料完整轉換", () => {
    const b = toBirthInput(input({ hour: "10", minute: "30", place: "臺中市" }));
    expect(b).toMatchObject({
      calendar: "國曆",
      isLeapMonth: false,
      year: 1985,
      month: 7,
      day: 12,
      hourBranch: "午",
      hour: 10,
      minute: 30,
      placeLabel: "臺中市"
    });
  });

  it("「不確定」與「海外／其他」不當成縣市，讓完整度如實反映缺出生地", () => {
    expect(toBirthInput(input({ place: "不確定" }))?.placeLabel).toBeNull();
    expect(toBirthInput(input({ place: "海外／其他" }))?.placeLabel).toBeNull();
  });

  it("時辰選「不確定」時 hourBranch 為 null，不會被當成有效地支", () => {
    expect(toBirthInput(input({ hourBranch: "不確定" }))?.hourBranch).toBeNull();
  });

  it("選填鐘點留空時為 null，不會變成 0 時 0 分", () => {
    const b = toBirthInput(input({ hour: "", minute: "" }));
    expect(b?.hour).toBeNull();
    expect(b?.minute).toBeNull();
  });

  it("農曆閏月正確傳遞", () => {
    expect(toBirthInput(input({ calendar: "農曆", isLeapMonth: "是" }))).toMatchObject({
      calendar: "農曆",
      isLeapMonth: true
    });
  });

  it("完全沒有出生資料時回 null，不硬排", () => {
    expect(toBirthInput(input(null))).toBeNull();
  });
});

describe("排盤失敗不得中斷報告", () => {
  it("缺出生年月日時回 chart=null 並帶原因，不 throw", () => {
    const r = buildChartForCouncil(input(null), SCHOOL);
    expect(r.chart).toBeNull();
    expect(r.error).toContain("無法排盤");
  });

  it("非法日期（2 月 31 日）不會讓整個請求爆掉", () => {
    const r = buildChartForCouncil(input({ month: 2, day: 31 }), SCHOOL);
    // 排得出來或排不出來都可以，唯一不可接受的是 throw
    expect(r.error === null || typeof r.error === "string").toBe(true);
  });
});

describe("盤面進 prompt", () => {
  const chart = buildChartForCouncil(input({ hour: "10", minute: "30", place: "臺北市" }), SCHOOL).chart!;

  it("排得出四柱", () => {
    expect(chart.bazi?.pillars.year.ganzhi.label).toMatch(/^[甲乙丙丁戊己庚辛壬癸]/);
    expect(chart.bazi?.pillars.hour).not.toBeNull();
  });

  it("prompt 區塊明確宣告盤面為既定事實", () => {
    const block = renderChartForPrompt(chart, SCHOOL.label);
    expect(block).toContain("既定事實");
    expect(block).toContain("不得自行改算");
    expect(block).toContain("四柱：");
    expect(block).toContain("月令：");
  });

  it("摘要版比完整版短很多（第二輪用，控制 token）", () => {
    const full = renderChartForPrompt(chart, SCHOOL.label);
    const digest = renderChartDigest(chart);
    expect(digest.length).toBeLessThan(full.length / 2);
    expect(digest).toContain("四柱");
  });

  it("有盤面時資料區塊改印盤面，不再送原始生日叫 LLM 自己推", () => {
    const block = renderChartForPrompt(chart, SCHOOL.label);
    const withChart = yixueDataBlock(input(), block);
    expect(withChart).toContain("【系統排盤結果】");
    expect(withChart).not.toContain("【出生資料】");
  });

  it("沒有盤面時完全維持原本行為", () => {
    const withoutChart = yixueDataBlock(input());
    expect(withoutChart).toContain("【出生資料】");
    expect(withoutChart).not.toContain("【系統排盤結果】");
  });

  it("時辰不確定時盤面明說不排時柱，不留空白讓 LLM 自由發揮", () => {
    const c = buildChartForCouncil(input({ hourBranch: "不確定" }), SCHOOL).chart!;
    const block = renderChartForPrompt(c, SCHOOL.label);
    expect(block).toContain("時辰不確定");
    expect(block).toContain("缺少：");
  });
});

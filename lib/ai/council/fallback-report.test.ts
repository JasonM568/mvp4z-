import { describe, expect, it } from "vitest";
import { resolveSchool } from "@/lib/yixue";
import { buildChartForCouncil } from "./chart";
import { buildSafeFallbackReport } from "./quality";
import type { CouncilInput } from "./personas";

function request(modules: Record<string, boolean>, gender = "男"): CouncilInput {
  return {
    question: "是否轉職？",
    topic: "事業／工作",
    yixue: {
      clientName: "王先生",
      gender,
      modules,
      birth: { calendar: "國曆", year: 1990, month: 5, day: 20, hourBranch: "午", timeKnown: "是" },
      eventTime: { year: 2026, month: 9, day: 23, hour: 10, minute: 15 }
    }
  } as CouncilInput;
}

describe("#8 兜底稿只說本次真實盤面", () => {
  it("只啟用八字時只列八字，且已排出的大運不再稱未納入", () => {
    const input = request({ bazi: true, qimen: false, liuyao: false, meihua: false });
    const chart = buildChartForCouncil(input, resolveSchool("fengyi-v1")).chart!;
    expect(chart.bazi?.luck).not.toBeNull();
    const report = buildSafeFallbackReport(input, undefined, chart);
    expect(report).toContain(`大運${chart.bazi!.luck!.directionLabel}、${chart.bazi!.luck!.startAgeYears}歲起`);
    expect(report).not.toMatch(/大運未納入|大運尚未納入/);
    expect(report).not.toContain("奇門遁甲獨立判讀");
    expect(report).not.toContain("卜卦／六爻獨立判讀");
    expect(report).not.toContain("梅花易數獨立判讀");
    expect(report).not.toContain("四術共同指向");
  });

  it("性別未填就明說大運未排，不會宣稱已排", () => {
    const input = request({ bazi: true }, "");
    const chart = buildChartForCouncil(input, resolveSchool("fengyi-v1")).chart!;
    const report = buildSafeFallbackReport(input, undefined, chart);
    expect(report).toContain("大運未排");
    expect(report).toContain("排大運所需性別");
  });

  it("無啟用術數的舊請求仍輸出完整四術，不產空報告", () => {
    const report = buildSafeFallbackReport(request({}));
    for (const name of ["八字命理", "奇門遁甲", "卜卦／六爻", "梅花易數"]) {
      expect(report).toContain(`${name}獨立判讀`);
    }
  });
});

describe("#8 兜底稿的排版不得因為少了段落而破掉", () => {
  // 只啟用一術時「四象合參」整段會被拿掉（一術無從合參）。
  // 原本那段是用空字串參與 join 的，會在報告中間留下連續空行；
  // 段落編號也必須自己接上，不能因為少一段就跳號。
  const oneTerm = request({ bazi: true, qimen: false, liuyao: false, meihua: false });

  it("不留連續空行", () => {
    const chart = buildChartForCouncil(oneTerm, resolveSchool("fengyi-v1")).chart;
    expect(buildSafeFallbackReport(oneTerm, undefined, chart)).not.toMatch(/\n\n\n/);
  });

  it("段落編號連續，不因為少了合參那段而跳號", () => {
    const chart = buildChartForCouncil(oneTerm, resolveSchool("fengyi-v1")).chart;
    const text = buildSafeFallbackReport(oneTerm, undefined, chart);
    const nums = [...text.matchAll(/^([一二三四五六七八九十]+)、/gm)].map((m) => m[1]);
    expect(nums).toEqual(["一", "二", "三", "四", "五", "六"]);
  });

  it("一術的稿子不出現「四象合參」", () => {
    const chart = buildChartForCouncil(oneTerm, resolveSchool("fengyi-v1")).chart;
    expect(buildSafeFallbackReport(oneTerm, undefined, chart)).not.toContain("四象合參");
  });

  it("多術仍保留合參段", () => {
    const many = request({ bazi: true, liuyao: true });
    const chart = buildChartForCouncil(many, resolveSchool("fengyi-v1")).chart;
    expect(buildSafeFallbackReport(many, undefined, chart)).toContain("四象合參");
  });

  it("沒有盤面時不把「未取得盤面」講兩次", () => {
    const text = buildSafeFallbackReport(oneTerm, undefined, null);
    expect(text).toContain("本次未排出盤面");
    expect(text).not.toContain("本次未取得系統盤面。本術本次沒有系統盤面");
  });
});

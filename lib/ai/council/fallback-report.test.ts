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

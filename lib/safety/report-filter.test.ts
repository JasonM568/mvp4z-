import { describe, expect, it } from "vitest";
import { filterDeep, filterReportText, summarizeHits } from "./report-filter";

describe("名號：就地替換成「巽風面相」", () => {
  it("沈老師／沈師／沈全榮（含老師二字）都換掉，句子保留", () => {
    for (const name of ["沈老師", "沈師", "沈全榮", "沈全榮老師", "沈師父"]) {
      const r = filterReportText(`依${name}的教材，印堂開闊主運勢順。`);
      expect(r.text).toBe("依巽風面相的教材，印堂開闊主運勢順。");
      expect(r.hits[0]).toMatchObject({ rule: "name", action: "replaced" });
    }
  });

  it("「沈」作為一般字詞不受影響", () => {
    const r = filterReportText("他沈思許久，神情沈穩。");
    expect(r.text).toBe("他沈思許久，神情沈穩。");
    expect(r.hits).toEqual([]);
  });
});

describe("醫療：具體病名與器官病變一律剔除", () => {
  it("指令書列的三個例句不得進報告", () => {
    for (const bad of ["鼻樑蟹爪紋代表肝膽結石。", "人中歪表示子宮後屈。", "山根低顯示心臟弱。"]) {
      const r = filterReportText(`印堂明亮，氣色佳。${bad}眉形整齊。`);
      expect(r.text).toBe("印堂明亮，氣色佳。眉形整齊。");
      expect(r.hits.some((h) => h.action === "removed")).toBe(true);
    }
  });

  it("即使有否定語氣，具體病名仍剔除", () => {
    expect(filterReportText("本報告不談糖尿病。").text).toBe("");
  });

  it("器官單獨出現不算：只有「器官＋狀態」才剔除", () => {
    expect(filterReportText("鼻為財帛宮，看財運起伏。").text).toBe("鼻為財帛宮，看財運起伏。");
    expect(filterReportText("肝氣旺、脾氣急，五行屬木。").text).toBe("肝氣旺、脾氣急，五行屬木。");
    // 「心」單字不當器官：日常用語不能被誤殺
    expect(filterReportText("內心不足，常覺做賊心虛。").text).toBe("內心不足，常覺做賊心虛。");
  });
});

describe("醫療：診斷、治療、療效宣稱", () => {
  it("療效與保證改善的宣稱剔除", () => {
    const r = filterReportText("按摩此處可根治失眠。多喝水。保證改善運勢。");
    expect(r.text).toBe("多喝水。");
    expect(r.hits.map((h) => h.rule)).toEqual(["claim", "claim"]);
  });

  it("診斷、治療、用藥的敘述剔除", () => {
    expect(filterReportText("建議用藥調理後再觀察。").text).toBe("");
    expect(filterReportText("此相可診斷體質。").text).toBe("");
  });

  it("免責聲明（否定語氣）放行", () => {
    const text = "本報告僅供參考，不構成診斷或治療建議。";
    expect(filterReportText(text).text).toBe(text);
    const t2 = "面相不保證有療效。";
    expect(filterReportText(t2).text).toBe(t2);
  });

  it("生活層次的提醒不受影響", () => {
    const text = "近期氣色偏暗，建議留意作息與壓力，適度休息；若有不適請就醫諮詢專業醫師。";
    expect(filterReportText(text).text).toBe(text);
  });
});

describe("版面", () => {
  it("整句被剔除後，只剩項目符號的行一併去掉", () => {
    const r = filterReportText("- 氣色穩定\n- 肝膽不好\n- 作息規律");
    expect(r.text).toBe("- 氣色穩定\n- 作息規律");
  });

  it("沒有命中時原文逐字不動", () => {
    const text = "第一段。\n\n第二段，含：標點！\n";
    expect(filterReportText(text).text).toBe(text);
  });

  it("空字串安全", () => {
    expect(filterReportText("")).toEqual({ text: "", hits: [] });
  });
});

describe("filterDeep 與稽核摘要", () => {
  it("巢狀物件的字串值都過濾，鍵與數字不動", () => {
    const r = filterDeep({ score: 81, items: [{ note: "依沈老師的說法。" }, { note: "可治癒心臟病。" }] });
    expect(r.value).toEqual({ score: 81, items: [{ note: "依巽風面相的說法。" }, { note: "" }] });
    expect(r.hits).toHaveLength(2);
  });

  it("摘要合併同規則同詞並計次", () => {
    const r = filterReportText("沈老師說甲。沈老師說乙。");
    const s = summarizeHits(r.hits);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ rule: "name", term: "沈老師" });
  });
});

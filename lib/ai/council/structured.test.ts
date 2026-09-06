// 決策型態：七種收斂型態與舊詞相容。
//
// 2026-09-05 從五種擴成七種（依風羿老師《綜合判讀與回應規則》第十一節）。
// 資料庫裡已有 40 份舊報告存著舊詞，正規化必須把它們對到新的型態，
// 否則儀表板徽章會查不到顏色。

import { describe, expect, it } from "vitest";
import { DECISION_TYPES, normalizeDecision, parseStructured, STRUCT_OPEN, STRUCT_CLOSE } from "./structured";

describe("決策型態", () => {
  it("七種型態就是老師文件第十一節那七種", () => {
    expect(DECISION_TYPES).toEqual([
      "可直接推進",
      "有條件可成",
      "宜借力推進",
      "宜等待時機",
      "宜調整策略後再進",
      "宜暫時停止",
      "補資料後再判"
    ]);
  });

  it("新詞原樣通過", () => {
    for (const d of DECISION_TYPES) expect(normalizeDecision(d)).toBe(d);
  });

  it("擴版前的舊詞對得回新型態", () => {
    expect(normalizeDecision("可進")).toBe("可直接推進");
    expect(normalizeDecision("可試行")).toBe("有條件可成");
    expect(normalizeDecision("暫緩")).toBe("宜等待時機");
    expect(normalizeDecision("不建議")).toBe("宜暫時停止");
    expect(normalizeDecision("不可進")).toBe("宜暫時停止");
    expect(normalizeDecision("補資料後再判")).toBe("補資料後再判");
  });

  it("文件裡帶逗號的寫法也對得回來", () => {
    expect(normalizeDecision("資料不足，補資料後再判")).toBe("補資料後再判");
  });

  it("前後空白不影響", () => {
    expect(normalizeDecision("  宜借力推進 ")).toBe("宜借力推進");
  });

  it("對不上就回 null，不亂猜", () => {
    expect(normalizeDecision("大吉")).toBeNull();
    expect(normalizeDecision("")).toBeNull();
    expect(normalizeDecision(null)).toBeNull();
    expect(normalizeDecision(undefined)).toBeNull();
  });
});

describe("機讀區塊解析", () => {
  const wrap = (decision: string) =>
    `${STRUCT_OPEN}{"headline":"先補齊授權文件再談價","decision":"${decision}","resonance":72,"aspects":[{"key":"bazi","summary":"承載力尚可但節奏偏緊","confidence":70,"signal":"yellow"}],"steps":["三日內取得授權書"]}${STRUCT_CLOSE}`;

  it("新的七種型態解析得出來", () => {
    const parsed = parseStructured(wrap("宜借力推進"), { bazi: true });
    expect(parsed?.decision).toBe("宜借力推進");
  });

  it("模型沿用舊詞時正規化，不是丟掉", () => {
    const parsed = parseStructured(wrap("可試行"), { bazi: true });
    expect(parsed?.decision).toBe("有條件可成");
  });

  it("不認得的決策詞只讓 decision 消失，其餘欄位照常交付", () => {
    const parsed = parseStructured(wrap("大吉大利"), { bazi: true });
    expect(parsed).not.toBeNull();
    expect(parsed?.decision).toBeUndefined();
    expect(parsed?.headline).toBe("先補齊授權文件再談價");
  });
});

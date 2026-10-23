import { describe, expect, it } from "vitest";
import { enforceReportConsistency } from "./consistency";
import type { FaceReport } from "./report-schema";

function area(overrides: Record<string, unknown> = {}) {
  return {
    conclusion: "可見形態相符程度為中，最強的一組是眉眼。",
    alignment: "medium",
    visibleBasis: "眉毛與眼睛可判讀。",
    teacherInterpretation: "依老師說法。",
    watchout: "留意左右差異。",
    action: "七天內記錄一次。",
    confidence: "medium",
    citedTeachings: [],
    sources: ["x"],
    ...overrides
  };
}

function report(overrides: Record<string, unknown> = {}): FaceReport {
  const palaces = Array.from({ length: 12 }, (_, i) => ({
    name: ["命宮", "官祿宮", "父母宮", "福德宮", "遷移宮", "兄弟宮", "夫妻宮", "子女宮", "疾厄宮", "財帛宮", "奴僕宮", "田宅宮"][i],
    status: "balanced",
    evidence: "e",
    interpretation: "i",
    advice: "a"
  }));
  return {
    schemaVersion: "1.0",
    mode: "self",
    summary: "s".repeat(120),
    photoQuality: "q",
    currentTrend: "目前整體均衡，無明顯不對稱。",
    photoFingerprint: [],
    coreHighlights: ["重點一。", "重點二。", "重點三。"],
    priorityAdvice: [],
    palaces,
    flowYear: null,
    actions: [],
    lifeAreas: { relationship: area(), career: area(), health: area(), finance: area(), family: area() },
    surfaceAnalysis: { detectedFeatures: [], complexionObservation: "c", filterWarning: null, summary: "本次未辨識到可信度足夠的斑、痣、疤或痕。" },
    collaborationFramework: null,
    disclaimer: "d",
    ...overrides
  } as unknown as FaceReport;
}

describe("可判斷程度不得高於文字承認的限制", () => {
  it("說「淚堂無法完全評估」卻標高 → 降為中", () => {
    const r = report({ lifeAreas: { ...report().lifeAreas, family: area({ confidence: "high", visibleBasis: "淚堂無法完全評估，其餘可見。" }) } });
    const out = enforceReportConsistency(r);
    expect(out.report.lifeAreas.family.confidence).toBe("medium");
    expect(out.fixes[0].rule).toBe("confidence-vs-limitation");
  });

  it("主部位無法判讀卻標高 → 降為低", () => {
    const r = report({ lifeAreas: { ...report().lifeAreas, health: area({ confidence: "high", visibleBasis: "山根主部位無法判讀。" }) } });
    expect(enforceReportConsistency(r).report.lifeAreas.health.confidence).toBe("low");
  });

  it("沒有承認限制的高可判斷程度不動", () => {
    const r = report({ lifeAreas: { ...report().lifeAreas, career: area({ confidence: "high" }) } });
    const out = enforceReportConsistency(r);
    expect(out.report.lifeAreas.career.confidence).toBe("high");
    expect(out.fixes).toEqual([]);
  });
});

describe("斑痣疤痕摘要與清單一致", () => {
  const spot = { type: "spot", location: "左眉", observation: "o", palaces: ["兄弟宮"], themes: ["六親"], traditionalReference: "t", flowYearNote: "f", confidence: "high" };
  const mole = { ...spot, type: "mole", location: "鼻翼" };

  it("清單有 3 筆、摘要卻說未辨識到 → 摘要依清單重寫", () => {
    const r = report({ surfaceAnalysis: { detectedFeatures: [spot, spot, mole], complexionObservation: "c", filterWarning: null, summary: "本次未辨識到斑、痣、疤、痕以外的特徵。" } });
    const out = enforceReportConsistency(r);
    expect(out.report.surfaceAnalysis.summary).toBe("本次辨識到 斑 2 處、痣 1 處，逐項整理如下。");
  });

  it("清單為空、摘要沒說未辨識到 → 補標準說法", () => {
    const r = report({ surfaceAnalysis: { detectedFeatures: [], complexionObservation: "c", filterWarning: null, summary: "有一些特徵。" } });
    expect(enforceReportConsistency(r).report.surfaceAnalysis.summary).toContain("未辨識到可信度足夠");
  });
});

describe("「整體均衡」與不對稱的矛盾", () => {
  it("其他段落提到眉毛不對稱時，剔除「整體均衡、無明顯不對稱」", () => {
    const r = report({
      currentTrend: "整體均衡，無明顯不對稱。近期適合整理人際。",
      lifeAreas: { ...report().lifeAreas, family: area({ watchout: "眉毛左右不對稱，需留意手足關係。" }) }
    });
    const out = enforceReportConsistency(r);
    expect(out.report.currentTrend).toBe("近期適合整理人際。");
    expect(out.fixes.some((f) => f.rule === "balanced-vs-asymmetric")).toBe(true);
  });

  it("沒有矛盾時不動", () => {
    const out = enforceReportConsistency(report());
    expect(out.report.currentTrend).toBe("目前整體均衡，無明顯不對稱。");
    expect(out.fixes).toEqual([]);
  });

  it("剔除後整段空掉，保留不下結論的說明", () => {
    const r = report({
      currentTrend: "整體均衡，無明顯不對稱。",
      palaces: report().palaces.map((p, i) => (i === 0 ? { ...p, status: "watch" } : p))
    });
    expect(enforceReportConsistency(r).report.currentTrend).toContain("請以下方十二宮");
  });
});

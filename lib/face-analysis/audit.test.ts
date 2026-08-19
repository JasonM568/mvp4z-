import { describe, expect, it } from "vitest";
import { buildFaceAudit } from "@/lib/face-analysis/audit";
import { enforceTeachingCitations } from "@/lib/face-analysis/report";
import { applyFaceRules } from "@/lib/face-analysis/rules";
import { matchTeachings } from "@/lib/face-analysis/teachings";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";
import { clearRegion, e2eVision } from "@/lib/face-analysis/__fixtures__/vision";
import type { FaceReport } from "@/lib/face-analysis/report-schema";

const vision = faceVisionResultSchema.parse(e2eVision);
const rules = applyFaceRules({ vision, mode: "self", subjectAge: 41 });

/** 只組出稽核與引用驗證需要的最小報告形狀。 */
function reportWithCitations(citations: Record<string, string[]>) {
  const area = (citedTeachings: string[]) => ({
    conclusion: "測試結論",
    alignment: "medium" as const,
    visibleBasis: "測試依據",
    teacherInterpretation: "測試判讀",
    watchout: "測試留意",
    action: "測試行動",
    confidence: "medium" as const,
    citedTeachings,
    sources: ["測試出處"]
  });
  return {
    lifeAreas: {
      relationship: area(citations.relationship || []),
      career: area(citations.career || []),
      health: area(citations.health || []),
      finance: area(citations.finance || []),
      family: area(citations.family || [])
    }
  } as unknown as FaceReport;
}

describe("教材引用強制驗證", () => {
  it("剔除規則層沒命中的假引用", () => {
    const realId = rules.teachings[0].id;
    const result = enforceTeachingCitations(
      reportWithCitations({ career: [realId, "T_完全不存在的條文"] }),
      rules
    );
    expect(result.report.lifeAreas.career.citedTeachings).toEqual([realId]);
    expect(result.violations.some((item) => item.area === "career" && item.unknownIds.includes("T_完全不存在的條文"))).toBe(true);
  });

  it("有命中條文卻一條都沒引用時記為違規", () => {
    const result = enforceTeachingCitations(reportWithCitations({}), rules);
    expect(result.violations.some((item) => item.missingCitation)).toBe(true);
  });

  it("引用全部正確時沒有違規", () => {
    const byTheme = matchTeachings(vision);
    const career = byTheme.filter((item) => item.themes.includes("事業")).map((item) => item.id).slice(0, 1);
    const relationship = byTheme.filter((item) => item.themes.includes("感情")).map((item) => item.id).slice(0, 1);
    const health = byTheme.filter((item) => item.themes.includes("健康")).map((item) => item.id).slice(0, 1);
    const finance = byTheme.filter((item) => item.themes.includes("財運")).map((item) => item.id).slice(0, 1);
    const family = byTheme.filter((item) => item.themes.includes("家庭")).map((item) => item.id).slice(0, 1);
    const result = enforceTeachingCitations(
      reportWithCitations({ career, relationship, health, finance, family }),
      rules
    );
    expect(result.violations).toEqual([]);
  });

  it("沒有任何命中條文時，空引用不算違規", () => {
    const blank = faceVisionResultSchema.parse({
      ...e2eVision,
      regions: Object.fromEntries(
        Object.entries(e2eVision.regions).map(([name]) => [name, { ...clearRegion, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" }])
      ),
      details: Object.fromEntries(
        Object.entries(e2eVision.details).map(([name]) => [name, { ...clearRegion, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" }])
      )
    });
    const blankRules = applyFaceRules({ vision: blank, mode: "self", subjectAge: 41 });
    expect(blankRules.teachings).toHaveLength(0);
    expect(enforceTeachingCitations(reportWithCitations({}), blankRules).violations).toEqual([]);
  });
});

describe("教材依據稽核鏈", () => {
  const modelTrace = { teacherAudit: { teachings: matchTeachings(vision, "teacher"), flowYear: rules.flowYear, surfaceImpacts: [] } };

  it("把觀測、條文、出處與引用狀態串成一條鏈", () => {
    const citedId = rules.teachings[0].id;
    const audit = buildFaceAudit({
      visionResult: vision,
      reportStructured: reportWithCitations({ career: [citedId] }),
      modelTrace
    });

    expect(audit.available).toBe(true);
    expect(audit.matchedCount).toBeGreaterThan(0);
    const row = audit.chain.find((item) => item.id === citedId);
    expect(row?.observed).toBeTruthy();
    expect(row?.source).toBeTruthy();
    expect(row?.citedInReport).toBe(true);
    expect(row?.citedBy).toContain("事業");
  });

  it("標出命中但報告沒引用的條文", () => {
    const audit = buildFaceAudit({ visionResult: vision, reportStructured: reportWithCitations({}), modelTrace });
    expect(audit.citedCount).toBe(0);
    expect(audit.chain.every((row) => row.citedInReport === false)).toBe(true);
  });

  it("標出假引用", () => {
    const audit = buildFaceAudit({
      visionResult: vision,
      reportStructured: reportWithCitations({ career: ["T_捏造的條文"] }),
      modelTrace
    });
    expect(audit.unknownCitations).toEqual(["T_捏造的條文"]);
  });

  it("列出未參與判讀的部位與原因", () => {
    const partial = faceVisionResultSchema.parse({
      ...e2eVision,
      regions: { ...e2eVision.regions, ears: { ...clearRegion, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" } }
    });
    const audit = buildFaceAudit({ visionResult: partial, reportStructured: reportWithCitations({}), modelTrace });
    expect(audit.skippedFeatures.some((item) => item.featureLabel === "耳")).toBe(true);
  });

  it("稽核鏈上線前的舊報告會明確說明無法回溯，而不是假裝乾淨", () => {
    const audit = buildFaceAudit({ visionResult: vision, reportStructured: reportWithCitations({}), modelTrace: { report: {} } });
    expect(audit.available).toBe(false);
    expect(audit.reason).toContain("無法回溯");
    expect(audit.chain).toEqual([]);
  });
});

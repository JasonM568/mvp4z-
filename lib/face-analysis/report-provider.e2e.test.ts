import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FACE_PALACE_NAMES, type FaceRuleResult } from "@/lib/face-analysis/rules";
import { generateFaceReport } from "@/lib/face-analysis/report";

const enabled = process.env.FACE_REPORT_PROVIDER_E2E === "true";

describe("approved report provider E2E", () => {
  (enabled ? it : it.skip)("generates a structured self report", async () => {
    loadOpenAIEnvironment();
    process.env.FACE_REPORT_PROVIDER = "openai";
    const rules: FaceRuleResult = {
      version: "2.0",
      mode: "self",
      overallTrend: { ruleId: "OVERALL_TEST", text: "可見區域整體均衡。", evidence: [] },
      palaces: FACE_PALACE_NAMES.map((name) => ({
        name,
        parts: `${name}可見部位`,
        status: "balanced" as const,
        ruleId: `PALACE_${name}_TEST`,
        evidence: [
          { region: "glabella" as const, field: "contour", observed: "straight", confidence: 0.9 },
          { region: "glabella" as const, field: "symmetry", observed: "balanced", confidence: 0.9 }
        ]
      })),
      flowYear: null,
      observations: [],
      cautions: [],
      actionPlan: []
    };

    const result = await generateFaceReport({
      mode: "self",
      subjectAge: 35,
      quality: {
        passed: true,
        faceCount: 1,
        faceCoverage: 0.5,
        blurScore: 0.5,
        brightnessScore: 0.5,
        pose: { yaw: 0, pitch: 0, roll: 0 },
        occlusion: { eyes: false, nose: false, mouth: false },
        reasons: []
      },
      rules
    });

    expect(result.report.mode).toBe("self");
    expect(result.report.palaces).toHaveLength(12);
    expect(result.report.coreHighlights).toHaveLength(3);
    expect(result.report.priorityAdvice).toHaveLength(3);
    expect(JSON.stringify(result.report.priorityAdvice)).not.toMatch(/過度依賴面相|實際行動驗證|理性反思/);
    expect(JSON.stringify(result.report.priorityAdvice)).not.toMatch(/過度自信|注意力分散|溝通不夠細膩|容易誤解/);
    expect(JSON.stringify({ coreHighlights: result.report.coreHighlights, priorityAdvice: result.report.priorityAdvice })).not.toMatch(/亮度|模糊|覆蓋率|疲勞|生命力|健康狀況|收入穩定|感情穩定|家庭和諧/);
    expect(result.report.priorityAdvice.every((item) => item.problem.startsWith("建議核對："))).toBe(true);
    expect(new Set(result.report.actions.map((item) => item.action)).size).toBe(3);
    expect(Object.keys(result.report.lifeAreas)).toEqual(["relationship", "career", "health", "finance", "family"]);
    expect(Object.values(result.report.lifeAreas).every((area) => area.visibleBasis.length > 10 && area.teacherInterpretation.length > 10)).toBe(true);
    expect(result.report.lifeAreas.finance.sources).toContain("沈師筆記 p.84–86");
    if (process.env.FACE_REPORT_E2E_PRINT === "true") {
      console.log(JSON.stringify({ coreHighlights: result.report.coreHighlights, priorityAdvice: result.report.priorityAdvice, lifeAreas: result.report.lifeAreas, collaborationFramework: result.report.collaborationFramework, actions: result.report.actions }, null, 2));
    }
  }, 90_000);
});

function loadOpenAIEnvironment() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const matched = line.match(/^\s*(OPENAI_API_KEY|OPENAI_MODEL|FACE_REPORT_OPENAI_MODEL)=(.*)\s*$/);
    if (!matched) continue;
    const value = matched[2].replace(/^['\"]|['\"]$/g, "");
    if (value) process.env[matched[1]] = value;
  }
}

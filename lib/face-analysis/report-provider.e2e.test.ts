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
        evidence: []
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

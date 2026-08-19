import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFaceRules, type FaceRuleResult } from "@/lib/face-analysis/rules";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";
import { e2eVision } from "@/lib/face-analysis/__fixtures__/vision";
import { generateFaceReport } from "@/lib/face-analysis/report";

const enabled = process.env.FACE_REPORT_PROVIDER_E2E === "true";

describe("approved report provider E2E", () => {
  (enabled ? it : it.skip)("generates a structured self report", async () => {
    loadOpenAIEnvironment();
    process.env.FACE_REPORT_PROVIDER = "openai";
    // 走真實規則管線，讓 E2E 實際覆蓋流年、教材條文與斑痣宮位對應三段新契約。
    const rules: FaceRuleResult = applyFaceRules({
      vision: faceVisionResultSchema.parse(e2eVision),
      mode: "self",
      subjectAge: 41
    });
    expect(rules.flowYear).not.toBeNull();
    expect(rules.teachings.length).toBeGreaterThan(0);
    expect(rules.surfaceImpacts.length).toBeGreaterThan(0);

    const result = await generateFaceReport({
      mode: "self",
      subjectAge: 41,
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
      ,collaborationAssessment: true
      ,collaborationProject: "合作開發為期三個月的網站專案，對方負責執行，我負責預算與驗收。"
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
    expect(result.report.lifeAreas.finance.sources).toContain("老師面相筆記 p.84–86");
    expect(result.report.collaborationFramework?.verdict).toMatch(/recommended|conditional|not_recommended/);
    expect(result.report.collaborationFramework?.verdictReason.length).toBeGreaterThan(10);
    expect(result.report.collaborationFramework?.suitableRole.length).toBeGreaterThan(10);

    // 流年：41 歲在教材是四隘之一（山根），兩法部位與併看法都必須輸出。
    expect(result.report.flowYear).not.toBeNull();
    expect(result.report.flowYear?.age).toBe(41);
    expect(result.report.flowYear?.positions.map((item) => item.method)).toEqual(["seventy_five_regions", "nine_value"]);
    expect(result.report.flowYear?.positions[0].position).toBe("山根");
    expect(result.report.flowYear?.gates.length).toBeGreaterThan(0);
    expect(result.report.flowYear?.focus.length).toBeGreaterThan(10);

    // 斑痣疤痕：兩筆都要有宮位、主題與流年對照，且健康主題不得出現病名。
    expect(result.report.surfaceAnalysis.detectedFeatures).toHaveLength(2);
    for (const feature of result.report.surfaceAnalysis.detectedFeatures) {
      expect(feature.palaces.length).toBeGreaterThan(0);
      expect(feature.themes.length).toBeGreaterThan(0);
      expect(feature.flowYearNote.length).toBeGreaterThan(4);
    }
    expect(JSON.stringify(result.report.surfaceAnalysis)).not.toMatch(/腎|肝|脾|肺|心臟|糖尿病|洗腎|癌|腫瘤|壽命/);

    // 教材條文必須真的被引用，而不是退回模板敘述。
    const citedTeachings = Object.values(result.report.lifeAreas).flatMap((area) => area.citedTeachings);
    expect(citedTeachings.length).toBeGreaterThan(0);
    expect(citedTeachings.every((id) => rules.teachings.some((teaching) => teaching.id === id))).toBe(true);
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

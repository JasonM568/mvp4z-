import { describe, expect, it } from "vitest";
import { applyFaceRules, FACE_PALACE_NAMES, type FaceRuleProfileSettings } from "@/lib/face-analysis/rules";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";

const region = {
  visibility: "clear" as const,
  symmetry: "balanced" as const,
  relativeWidth: "medium" as const,
  relativeHeight: "medium" as const,
  contour: "rounded" as const,
  illumination: "even" as const,
  confidence: 0.9
};

const validVision = {
  schemaVersion: "2.0" as const,
  faceCount: 1 as const,
  orientation: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
  landmarks: { detected: true, coverage: 0.9, confidence: 0.95 },
  regions: {
    forehead: region,
    eyebrows: region,
    eyes: region,
    nose: region,
    cheeks: region,
    mouth: region,
    jaw: region,
    ears: region
  },
  details: {
    glabella: region,
    nasalRoot: region,
    outerEyeCorners: region,
    tearTroughs: region,
    philtrum: region,
    chin: region
  },
  overallConfidence: 0.92,
  limitations: []
};

describe("face vision and deterministic rules", () => {
  it("rejects extra sensitive provider fields", () => {
    expect(() => faceVisionResultSchema.parse({ ...validVision, ethnicity: "forbidden" })).toThrow();
  });

  it("always returns a complete, unique twelve-palace result", () => {
    const vision = faceVisionResultSchema.parse(validVision);
    const first = applyFaceRules({ vision, mode: "self", subjectAge: 35 });
    const second = applyFaceRules({ vision, mode: "self", subjectAge: 35 });
    expect(first).toEqual(second);
    expect(first.palaces).toHaveLength(12);
    expect(new Set(first.palaces.map((item) => item.name))).toEqual(new Set(FACE_PALACE_NAMES));
    expect(first.actionPlan.map((item) => item.ruleId)).toEqual([
      "ACTION_30_DAY_REVIEW_V1",
      "ACTION_60_DAY_REVIEW_V1",
      "ACTION_90_DAY_REVIEW_V1"
    ]);
  });

  it("marks a broad-region palace as watch when its mapped geometry is clearly asymmetric", () => {
    const vision = faceVisionResultSchema.parse({
      ...validVision,
      regions: {
        ...validVision.regions,
        forehead: { ...region, symmetry: "asymmetric" }
      }
    });

    const result = applyFaceRules({ vision, mode: "self", subjectAge: 35 });
    expect(result.palaces.find((item) => item.name === "命宮")?.status).toBe("balanced");
    expect(result.palaces.find((item) => item.name === "官祿宮")?.status).toBe("watch");
  });

  it("uses approved Shen detail points as the palace primary evidence", () => {
    const vision = faceVisionResultSchema.parse({
      ...validVision,
      details: {
        ...validVision.details,
        glabella: { ...region, symmetry: "asymmetric" },
        outerEyeCorners: { ...region, visibility: "partial" },
        nasalRoot: { ...region, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" }
      }
    });

    const result = applyFaceRules({ vision, mode: "self", subjectAge: 35 });
    const destiny = result.palaces.find((item) => item.name === "命宮");
    const marriage = result.palaces.find((item) => item.name === "夫妻宮");
    const health = result.palaces.find((item) => item.name === "疾厄宮");

    expect(destiny?.status).toBe("watch");
    expect(destiny?.evidence.some((item) => item.region === "glabella")).toBe(true);
    expect(marriage?.status).toBe("limited");
    expect(marriage?.evidence.some((item) => item.region === "outerEyeCorners")).toBe(true);
    expect(health?.status).toBe("limited");
    expect(health?.evidence.some((item) => item.region === "nasalRoot")).toBe(true);
  });

  it("applies a published palace profile to new analysis", () => {
    const vision = faceVisionResultSchema.parse({
      ...validVision,
      regions: { ...validVision.regions, eyes: { ...region, visibility: "partial" } }
    });
    const profile = {
      schemaVersion: "1.0",
      palaces: [{ name: "夫妻宮", primary: ["eyes"], auxiliary: [] }]
    } as FaceRuleProfileSettings;

    const result = applyFaceRules({ vision, mode: "self", subjectAge: 35, profileSettings: profile });
    const marriage = result.palaces.find((item) => item.name === "夫妻宮");
    expect(marriage?.status).toBe("limited");
    expect(marriage?.evidence.some((item) => item.region === "eyes")).toBe(true);
  });

  it("uses the Shen three-treasury mapping for the subject age", () => {
    const vision = faceVisionResultSchema.parse(validVision);

    const youth = applyFaceRules({ vision, mode: "self", subjectAge: 30 }).palaces.find((item) => item.name === "財帛宮");
    const middle = applyFaceRules({ vision, mode: "self", subjectAge: 31 }).palaces.find((item) => item.name === "財帛宮");
    const later = applyFaceRules({ vision, mode: "self", subjectAge: 51 }).palaces.find((item) => item.name === "財帛宮");

    expect(youth).toMatchObject({ ruleId: "PALACE_財帛宮_天倉_V2", parts: expect.stringContaining("天倉") });
    expect(middle).toMatchObject({ ruleId: "PALACE_財帛宮_人倉_V2", parts: expect.stringContaining("人倉") });
    expect(later).toMatchObject({ ruleId: "PALACE_財帛宮_地倉_V2", parts: expect.stringContaining("地倉") });
    expect(later?.evidence.some((item) => item.region === "chin")).toBe(true);
  });

  it("keeps palace status morphology-led when illumination changes", () => {
    const evenlyLit = faceVisionResultSchema.parse(validVision);
    const shadowed = faceVisionResultSchema.parse({
      ...validVision,
      regions: Object.fromEntries(
        Object.entries(validVision.regions).map(([name, value]) => [name, { ...value, illumination: "shadowed" }])
      )
    });

    const baseline = applyFaceRules({ vision: evenlyLit, mode: "self", subjectAge: 35 });
    const result = applyFaceRules({ vision: shadowed, mode: "self", subjectAge: 35 });
    expect(result.palaces.map((item) => item.status)).toEqual(baseline.palaces.map((item) => item.status));
    expect(result.cautions.some((item) => item.ruleId === "CAUTION_UNEVEN_ILLUMINATION_V2")).toBe(true);
  });
});

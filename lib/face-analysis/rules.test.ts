import { describe, expect, it } from "vitest";
import { applyFaceRules, FACE_PALACE_NAMES } from "@/lib/face-analysis/rules";
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
  schemaVersion: "1.0" as const,
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

  it("marks a palace as watch when its mapped geometry is clearly asymmetric", () => {
    const vision = faceVisionResultSchema.parse({
      ...validVision,
      regions: {
        ...validVision.regions,
        forehead: { ...region, symmetry: "asymmetric" }
      }
    });

    const result = applyFaceRules({ vision, mode: "self", subjectAge: 35 });
    expect(result.palaces.find((item) => item.name === "命宮")?.status).toBe("watch");
    expect(result.palaces.find((item) => item.name === "官祿宮")?.status).toBe("watch");
  });

  it("uses the Shen three-treasury mapping for the subject age", () => {
    const vision = faceVisionResultSchema.parse(validVision);

    const youth = applyFaceRules({ vision, mode: "self", subjectAge: 30 }).palaces.find((item) => item.name === "財帛宮");
    const middle = applyFaceRules({ vision, mode: "self", subjectAge: 31 }).palaces.find((item) => item.name === "財帛宮");
    const later = applyFaceRules({ vision, mode: "self", subjectAge: 51 }).palaces.find((item) => item.name === "財帛宮");

    expect(youth).toMatchObject({ ruleId: "PALACE_財帛宮_天倉_V2", parts: expect.stringContaining("天倉") });
    expect(middle).toMatchObject({ ruleId: "PALACE_財帛宮_人倉_V2", parts: expect.stringContaining("人倉") });
    expect(later).toMatchObject({ ruleId: "PALACE_財帛宮_地倉_V2", parts: expect.stringContaining("地倉") });
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

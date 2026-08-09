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
});


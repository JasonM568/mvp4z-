import { describe, expect, it } from "vitest";
import { evaluateFaceQuality } from "@/lib/face-analysis/quality";

describe("evaluateFaceQuality", () => {
  it("accepts a clear, single, front-facing face", () => {
    const result = evaluateFaceQuality({
      blurScore: 0.88,
      brightnessScore: 0.68,
      observation: {
        faceCount: 1,
        faceCoverage: 0.4,
        pose: { yaw: 2, pitch: -1, roll: 1 },
        occlusion: { eyes: false, nose: false, mouth: false }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects multiple, dark, blurry and angled faces without inventing a score", () => {
    const result = evaluateFaceQuality({
      blurScore: 0.1,
      brightnessScore: 0.1,
      observation: {
        faceCount: 2,
        faceCoverage: 0.5,
        pose: { yaw: 25, pitch: 0, roll: 0 },
        occlusion: { eyes: false, nose: false, mouth: false }
      }
    });
    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(["MULTIPLE_FACES", "TOO_BLURRY", "TOO_DARK", "POSE_NOT_FRONT"])
    );
  });

  it("accepts the calibrated sharpness floor and rejects a score below it", () => {
    const shared = {
      brightnessScore: 0.68,
      observation: {
        faceCount: 1,
        faceCoverage: 0.4,
        pose: { yaw: 0, pitch: 0, roll: 0 },
        occlusion: { eyes: false, nose: false, mouth: false }
      }
    };
    expect(evaluateFaceQuality({ ...shared, blurScore: 0.2 }).reasons).not.toContain("TOO_BLURRY");
    expect(evaluateFaceQuality({ ...shared, blurScore: 0.1999 }).reasons).toContain("TOO_BLURRY");
  });
});

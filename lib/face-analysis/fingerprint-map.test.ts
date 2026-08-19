import { describe, expect, it } from "vitest";
import { mapFingerprints, FINGERPRINT_FEATURE_COUNT } from "@/lib/face-analysis/fingerprint-map";
import { applyFaceRules } from "@/lib/face-analysis/rules";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";
import { e2eVision } from "@/lib/face-analysis/__fixtures__/vision";

const vision = faceVisionResultSchema.parse(e2eVision);

describe("照片特徵指紋接教材部位", () => {
  it("涵蓋 Vision 全部 16 個特徵枚舉，不會有查不到表的特徵", () => {
    expect(FINGERPRINT_FEATURE_COUNT).toBe(16);
  });

  it("鼻頭接到準頭、財帛宮與流年 48", () => {
    const [reading] = mapFingerprints(
      [{ feature: "noseTip", region: "nose", side: "center", observation: "鼻頭圓潤且略微突出", salience: 0.9, confidence: 0.9 }],
      41
    );
    expect(reading.partName).toContain("準頭");
    expect(reading.palaces).toContain("財帛宮（人倉）");
    expect(reading.flowYearAges).toEqual([48]);
    expect(reading.flowYearNote).toContain("48");
    expect(reading.favorable).toContain("理財");
    expect(reading.unfavorable).toContain("朝天鼻");
    expect(reading.source).toBeTruthy();
  });

  it("本年正好走到該部位時會標記", () => {
    const atAge = mapFingerprints(
      [{ feature: "noseTip", region: "nose", side: "center", observation: "鼻頭圓潤", salience: 0.9, confidence: 0.9 }],
      48
    );
    expect(atAge[0].hitsCurrentAge).toBe(true);
    expect(atAge[0].flowYearNote).toContain("本年");

    const offAge = mapFingerprints(
      [{ feature: "noseTip", region: "nose", side: "center", observation: "鼻頭圓潤", salience: 0.9, confidence: 0.9 }],
      41
    );
    expect(offAge[0].hitsCurrentAge).toBe(false);
  });

  it("連續流年收斂成區間、非連續逐一列出", () => {
    const brow = mapFingerprints([{ feature: "eyebrowShape", region: "eyebrows", side: "bilateral", observation: "眉形秀麗", salience: 0.9, confidence: 0.9 }], null);
    expect(brow[0].flowYearNote).toContain("31–34");
    const chin = mapFingerprints([{ feature: "chinShape", region: "chin", side: "center", observation: "地閣開闊", salience: 0.9, confidence: 0.9 }], null);
    expect(chin[0].flowYearNote).toContain("61、71");
  });

  it("每個部位都同時提供教材的正向與反向條件", () => {
    const features = ["foreheadShape", "eyebrowShape", "eyebrowTail", "eyeShape", "eyeTilt", "eyeSpacing", "nasalBridge", "noseTip", "noseWing", "cheekbone", "lipShape", "mouthCorner", "philtrumShape", "jawline", "chinShape", "earShape"] as const;
    for (const feature of features) {
      const [reading] = mapFingerprints([{ feature, region: "nose", side: "center", observation: "測試觀察", salience: 0.9, confidence: 0.9 }], null);
      expect(reading.favorable.length, feature).toBeGreaterThan(10);
      expect(reading.unfavorable.length, feature).toBeGreaterThan(10);
      expect(reading.palaces.length, feature).toBeGreaterThan(0);
      expect(reading.source, feature).toBeTruthy();
    }
  });

  it("會員版指紋不得出現臟腑與病名", () => {
    const features = ["noseTip", "noseWing", "eyeSpacing", "nasalBridge"] as const;
    for (const feature of features) {
      const [reading] = mapFingerprints([{ feature, region: "nose", side: "center", observation: "測試", salience: 0.9, confidence: 0.9 }], null);
      expect(JSON.stringify(reading), feature).not.toMatch(/腸胃|氣管|支氣管|肺部|腎|肝|心臟|糖尿病/);
    }
  });

  it("規則層輸出的指紋已帶教材對應", () => {
    const rules = applyFaceRules({ vision, mode: "self", subjectAge: 41 });
    expect(rules.photoFingerprint.length).toBeGreaterThan(0);
    for (const item of rules.photoFingerprint) {
      expect(item.partName).toBeTruthy();
      expect(item.palaces.length).toBeGreaterThan(0);
      expect(item.flowYearNote).toBeTruthy();
    }
  });
});

describe("指紋判讀文字", () => {
  it("英文欄位名會被兜底改寫成中文", async () => {
    const { readModelInterpretationForTest } = await import("@/lib/face-analysis/report");
    expect(readModelInterpretationForTest({ photoFingerprint: [{ interpretation: "較接近 favorable，教材認為…" }] }, 0)).toBe("較接近 相理合，教材認為…");
    expect(readModelInterpretationForTest({ photoFingerprint: [{ interpretation: "較接近 unfavorable。" }] }, 0)).toBe("較接近 相理不合。");
  });

  it("模型漏寫判讀時給明確的保守說明，不留空白", async () => {
    const { readModelInterpretationForTest } = await import("@/lib/face-analysis/report");
    expect(readModelInterpretationForTest({ photoFingerprint: [{}] }, 0)).toContain("無法判定");
    expect(readModelInterpretationForTest({}, 0)).toContain("無法判定");
  });
});

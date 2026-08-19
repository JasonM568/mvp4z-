import { describe, expect, it } from "vitest";
import { stripTeachingReferencesForTest as strip } from "@/lib/face-analysis/report";
import { BUILT_IN_TEACHINGS } from "@/lib/face-analysis/teachings";
import { BUILT_IN_FINGERPRINTS } from "@/lib/face-analysis/fingerprint-map";
import { BUILT_IN_SURFACE_MAPPINGS } from "@/lib/face-analysis/surface-map";
import { applyFaceRules } from "@/lib/face-analysis/rules";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";
import { e2eVision } from "@/lib/face-analysis/__fixtures__/vision";

const FORBIDDEN = /教材|頁筆記|十二宮講義|講義|筆記\s*p\.|p\.\d/;

describe("會員版用語不得出現教材與出處", () => {
  it("內建規則的會員欄位全數乾淨", () => {
    for (const teaching of BUILT_IN_TEACHINGS) {
      expect(teaching.memberText, teaching.id).not.toMatch(FORBIDDEN);
    }
    for (const [feature, mapping] of Object.entries(BUILT_IN_FINGERPRINTS)) {
      expect(mapping.looksAt, feature).not.toMatch(FORBIDDEN);
      expect(mapping.favorable, feature).not.toMatch(FORBIDDEN);
      expect(mapping.unfavorable, feature).not.toMatch(FORBIDDEN);
    }
    for (const [region, mapping] of Object.entries(BUILT_IN_SURFACE_MAPPINGS)) {
      expect(mapping.memberNote, region).not.toMatch(FORBIDDEN);
    }
  });

  it("老師版必須保留教材原文，不能被一起洗掉", () => {
    expect(BUILT_IN_TEACHINGS.some((t) => t.teacherText.includes("教材"))).toBe(true);
    expect(Object.values(BUILT_IN_SURFACE_MAPPINGS).some((m) => m.teacherNote.includes("教材"))).toBe(true);
  });

  it("規則層輸出給會員的內容不含教材與出處", () => {
    const rules = applyFaceRules({ vision: faceVisionResultSchema.parse(e2eVision), mode: "self", subjectAge: 41 });
    const memberFacing = JSON.stringify({
      teachings: rules.teachings.map((t) => t.text),
      fingerprints: rules.photoFingerprint,
      surfaces: rules.surfaceImpacts.map((s) => s.memberNote),
      flowYear: rules.flowYear,
      cautions: rules.cautions
    });
    expect(memberFacing).not.toMatch(/教材/);
  });

  it("淨化器移除出處括號並改寫教材字樣", () => {
    expect(strip("教材說鼻准豐隆（283 頁筆記 p.11、p.49–96 鼻部段）")).toBe("老師說鼻准豐隆");
    expect(strip("依教材屬較佳形態")).toBe("依老師屬較佳形態");
    expect(strip("見十二宮講義 p.10–13")).toBe("見");
  });

  it("淨化器保留稽核用的 sources 欄位", () => {
    const result = strip({ sources: ["老師面相筆記 p.84–86"], summary: "教材說法" }) as Record<string, unknown>;
    expect(result.sources).toEqual(["老師面相筆記 p.84–86"]);
    expect(result.summary).toBe("老師說法");
  });

  it("淨化器遞迴處理巢狀結構", () => {
    const result = strip({ a: { b: ["教材說法（283 頁筆記 p.1）"] } }) as { a: { b: string[] } };
    expect(result.a.b[0]).toBe("老師說法");
  });
});

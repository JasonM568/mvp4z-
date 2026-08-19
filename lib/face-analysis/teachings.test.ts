import { describe, expect, it } from "vitest";
import { groupTeachingsByTheme, matchTeachings } from "@/lib/face-analysis/teachings";
import { mapSurfaceImpacts } from "@/lib/face-analysis/surface-map";
import { applyFaceRules } from "@/lib/face-analysis/rules";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";
import { baselineVision, clearRegion, e2eVision } from "@/lib/face-analysis/__fixtures__/vision";

describe("教材形態條件規則表", () => {
  it("只在形態符合時才命中條文", () => {
    const wide = faceVisionResultSchema.parse({
      ...baselineVision,
      regions: { ...baselineVision.regions, cheeks: { ...clearRegion, relativeWidth: "wide" } }
    });
    const narrow = faceVisionResultSchema.parse({
      ...baselineVision,
      regions: { ...baselineVision.regions, cheeks: { ...clearRegion, relativeWidth: "narrow" } }
    });

    expect(matchTeachings(wide).some((item) => item.id === "T_CHEEKS_WIDE")).toBe(true);
    expect(matchTeachings(wide).some((item) => item.id === "T_CHEEKS_NARROW")).toBe(false);
    expect(matchTeachings(narrow).some((item) => item.id === "T_CHEEKS_NARROW")).toBe(true);
  });

  it("部位看不清楚時不套用教材，避免用光線或模糊推論", () => {
    const obscured = faceVisionResultSchema.parse({
      ...baselineVision,
      regions: {
        ...baselineVision.regions,
        cheeks: {
          ...clearRegion,
          relativeWidth: "wide",
          visibility: "obscured",
          contour: "not_assessable",
          relativeHeight: "not_assessable"
        }
      }
    });
    expect(matchTeachings(obscured).some((item) => item.feature === "cheeks")).toBe(false);
  });

  it("信心度不足的觀察不套用教材", () => {
    const lowConfidence = faceVisionResultSchema.parse({
      ...baselineVision,
      regions: { ...baselineVision.regions, cheeks: { ...clearRegion, relativeWidth: "wide", confidence: 0.4 } }
    });
    expect(matchTeachings(lowConfidence).some((item) => item.feature === "cheeks")).toBe(false);
  });

  it("命中的條文帶出實際形態，讓報告可以回溯依據", () => {
    const matched = matchTeachings(faceVisionResultSchema.parse(e2eVision));
    const forehead = matched.find((item) => item.id === "T_FOREHEAD_WIDE_HIGH");
    expect(forehead).toBeDefined();
    expect(forehead?.observedMorphology).toContain("偏寬");
    expect(forehead?.source).toBeTruthy();
    expect(forehead?.palaces.length).toBeGreaterThan(0);
  });

  it("會員版與老師版的健康條文內容不同", () => {
    const vision = faceVisionResultSchema.parse({
      ...baselineVision,
      details: { ...baselineVision.details, nasalRoot: { ...clearRegion, relativeHeight: "short" } }
    });
    const member = matchTeachings(vision, "member").find((item) => item.id === "T_NASALROOT_LOW");
    const teacher = matchTeachings(vision, "teacher").find((item) => item.id === "T_NASALROOT_LOW");
    expect(member?.text).not.toEqual(teacher?.text);
    expect(teacher?.text).toContain("四隘");
  });

  it("會員版的健康條文不得出現臟腑與病名", () => {
    const matched = matchTeachings(faceVisionResultSchema.parse(e2eVision), "member");
    const text = JSON.stringify(matched);
    expect(text).not.toMatch(/腎臟|肝臟|脾胃|洗腎|糖尿病|腫瘤|癌|壽命|生殖/);
  });

  it("能依五大面向分組", () => {
    const grouped = groupTeachingsByTheme(matchTeachings(faceVisionResultSchema.parse(e2eVision)));
    expect(Object.keys(grouped)).toEqual(["感情", "事業", "健康", "財運", "家庭"]);
    expect(grouped.事業.length).toBeGreaterThan(0);
  });
});

describe("斑痣疤痕的宮位與流年對應", () => {
  const impacts = mapSurfaceImpacts(faceVisionResultSchema.parse(e2eVision).surfaceFeatures, 44);

  it("每一筆都對應到宮位、主題與流年", () => {
    expect(impacts).toHaveLength(2);
    for (const impact of impacts) {
      expect(impact.palaces.length).toBeGreaterThan(0);
      expect(impact.themes.length).toBeGreaterThan(0);
      expect(impact.flowYearPositions.length).toBeGreaterThan(0);
      expect(impact.sourcePages.length).toBeGreaterThan(0);
    }
  });

  it("鼻部的痣對應財帛宮與教材點名的 44 至 50 流年", () => {
    const nose = impacts.find((item) => item.region === "nose");
    expect(nose?.palaces).toContain("財帛宮（人倉）");
    expect(nose?.themes).toContain("財運");
    expect(nose?.flowYearAges).toContain(48);
  });

  it("眉部的疤對應兄弟宮與六親主題", () => {
    const eyebrows = impacts.find((item) => item.region === "eyebrows");
    expect(eyebrows?.palaces).toContain("兄弟宮");
    expect(eyebrows?.themes).toContain("六親");
    expect(eyebrows?.flowYearAges).toContain(33);
  });

  it("受檢者年齡落在該部位流年段時會標記", () => {
    // 44 歲走年上（鼻），眉部流年為 31–34。
    // 注意鼻的流年段有斷點：46、47 走顴，不屬鼻。
    expect(impacts.find((item) => item.region === "nose")?.hitsCurrentAge).toBe(true);
    expect(impacts.find((item) => item.region === "eyebrows")?.hitsCurrentAge).toBe(false);
  });

  it("教材原文只留在 teacherNote，不會出現在會員欄位", () => {
    const nose = impacts.find((item) => item.region === "nose");
    expect(nose?.teacherNote).toContain("教材");
    expect(nose?.memberNote).not.toContain("CRITICAL");
  });
});

describe("規則層輸出", () => {
  const rules = applyFaceRules({ vision: faceVisionResultSchema.parse(e2eVision), mode: "self", subjectAge: 41 });

  it("版本升到 3.0 並帶出三段新資料", () => {
    expect(rules.version).toBe("3.0");
    expect(rules.flowYear).not.toBeNull();
    expect(rules.teachings.length).toBeGreaterThan(0);
    expect(rules.surfaceImpacts.length).toBe(2);
  });

  it("會員版的 surfaceImpacts 不含教材原文", () => {
    expect(JSON.stringify(rules.surfaceImpacts)).not.toContain("teacherNote");
    for (const impact of rules.surfaceImpacts) {
      expect("teacherNote" in impact).toBe(false);
    }
  });

  it("四隘年份會產生明確提醒", () => {
    expect(rules.cautions.some((item) => item.ruleId === "FLOW_YEAR_GATE_41_V3")).toBe(true);
  });

  it("流年部位剛好有斑痣時會升級提醒", () => {
    // 46 歲九值走鼻（46 % 9 = 1 為額；改用 44 歲：44 % 9 = 8 右眼，七十五走年上＝鼻）。
    const atNose = applyFaceRules({ vision: faceVisionResultSchema.parse(e2eVision), mode: "self", subjectAge: 44 });
    expect(atNose.cautions.some((item) => item.ruleId === "FLOW_YEAR_SURFACE_NOSE_V3")).toBe(true);
  });

  it("沒有年齡時不產生流年段落與流年提醒", () => {
    const noAge = applyFaceRules({ vision: faceVisionResultSchema.parse(e2eVision), mode: "self", subjectAge: null });
    expect(noAge.flowYear).toBeNull();
    expect(noAge.cautions.some((item) => item.ruleId.startsWith("FLOW_YEAR_"))).toBe(false);
  });
});

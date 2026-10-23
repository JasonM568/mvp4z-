import { describe, expect, it } from "vitest";
import { faceVisionResultSchema } from "./vision";
import { buildSixRelatives, renderSixRelativesText } from "./six-relatives";
import { filterReportText } from "@/lib/safety/report-filter";
import { baselineVision as rawBaseline, clearRegion } from "./__fixtures__/vision";

const baselineVision = faceVisionResultSchema.parse(rawBaseline);

describe("六親外襲：自己外襲六親", () => {
  it("七個對照項，部位與階段照老師的對照表", () => {
    const s = buildSixRelatives(baselineVision);
    expect(s.items.map((i) => i.relative)).toEqual(["祖父母", "父母", "手足", "配偶（伴侶）", "子女（年少階段）", "子女（中年階段）", "孫子"]);
    expect(s.items[1].parts).toEqual(["額頭", "眼"]);
    expect(s.items[2].parts).toEqual(["眉", "顴頰"]);
    expect(s.items[3].parts).toEqual(["印堂", "眼", "鼻", "地閣"]);
  });

  it("看不清楚的部位直說「照片不足以判讀」，不硬寫形態", () => {
    const blocked = faceVisionResultSchema.parse({
      ...rawBaseline,
      regions: {
        ...rawBaseline.regions,
        eyes: { ...clearRegion, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" }
      }
    });
    const s = buildSixRelatives(blocked);
    const parents = s.items.find((i) => i.relative === "父母")!;
    expect(parents.status).toBe("partial");
    expect(parents.observation).toContain("眼：照片不足以判讀");
  });

  it("聲相一律標明無法由照片判讀", () => {
    const s = buildSixRelatives(baselineVision);
    expect(s.items.find((i) => i.relative === "配偶（伴侶）")!.observation).toContain("聲相（說話的音質與語速）：無法由照片判讀");
  });

  it("整段文字通過醫療與名號過濾器，一個字都不會被剔除", () => {
    const text = renderSixRelativesText(buildSixRelatives(baselineVision));
    const filtered = filterReportText(text);
    expect(filtered.hits).toEqual([]);
    expect(filtered.text).toBe(text);
  });

  it("不出現健康、壽命、血光、命運一類推定", () => {
    const text = renderSixRelativesText(buildSixRelatives(baselineVision));
    for (const bad of ["健康", "壽", "血光", "生命", "傷剋", "必", "一定", "破陷"]) expect(text).not.toContain(bad);
  });
});

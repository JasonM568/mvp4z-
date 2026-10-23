import { describe, expect, it } from "vitest";
import {
  CENTRAL_THIRTEEN_POSITIONS,
  flowYearPositionsForFeature,
  nineValuePosition,
  resolveFlowYear,
  seventyFivePosition
} from "@/lib/face-analysis/flow-year";
import { faceVisionResultSchema } from "@/lib/face-analysis/vision";
import { baselineVision, clearRegion } from "@/lib/face-analysis/__fixtures__/vision";

const vision = faceVisionResultSchema.parse(baselineVision);

describe("七十五部位流年法（筆記 p.11）", () => {
  it("逐歲對應教材原表的部位", () => {
    const expected: Array<[number, string]> = [
      [1, "天輪"],
      [7, "天廓"],
      [14, "地輪"],
      [15, "火星"],
      [19, "天庭"],
      [25, "中正"],
      [28, "印堂"],
      [31, "凌雲"],
      [35, "太陽"],
      [41, "山根"],
      [44, "年上"],
      [47, "顴"],
      [48, "準頭"],
      [51, "人中"],
      [55, "祿倉"],
      [60, "水星"],
      [61, "乘漿"],
      [71, "地閣"],
      [75, "腮"],
      [99, "亥"]
    ];
    for (const [age, position] of expected) {
      expect(seventyFivePosition(age).position, `${age} 歲`).toBe(position);
    }
  });

  it("百歲之後依教材週而復始", () => {
    expect(seventyFivePosition(101).position).toBe(seventyFivePosition(1).position);
    expect(seventyFivePosition(115).position).toBe(seventyFivePosition(15).position);
  });

  it("每個部位都對應得到可觀察的臉部特徵", () => {
    for (let age = 1; age <= 99; age += 1) {
      expect(seventyFivePosition(age).feature, `${age} 歲`).toBeTruthy();
    }
  });
});

describe("九值（九執）流年法：照老師原表", () => {
  it("1 左眉、2 鼻子、3 嘴巴、4 左耳、5 左眼、6 印堂、7 右眉、8 右眼、9 右耳", () => {
    const expected = ["左眉", "鼻子", "嘴巴", "左耳", "左眼", "印堂", "右眉", "右眼", "右耳"];
    expected.forEach((position, i) => {
      expect(nineValuePosition(i + 1), `${i + 1} 歲`).toMatchObject({ remainder: i + 1, position });
    });
  });

  it("以九為倍數取餘數，餘 0 視為 9：原表第一列 1、10、19、28、37、46、55、64", () => {
    for (const age of [1, 10, 19, 28, 37, 46, 55, 64]) expect(nineValuePosition(age).position, `${age} 歲`).toBe("左眉");
    for (const age of [9, 18, 27, 36, 45, 54, 63, 72]) expect(nineValuePosition(age).position, `${age} 歲`).toBe("右耳");
  });

  it("283 頁筆記的兩個例題：33 歲九值走印堂、47 歲九值走鼻子", () => {
    expect(nineValuePosition(33)).toMatchObject({ remainder: 6, position: "印堂", feature: "glabella" });
    expect(nineValuePosition(47)).toMatchObject({ remainder: 2, position: "鼻子", feature: "nose" });
  });
});

describe("併看法與三關四隘", () => {
  it("兩法部位都清楚時判為 aligned", () => {
    const result = resolveFlowYear(vision, 41);
    expect(result?.seventyFive.position).toBe("山根");
    expect(result?.nineValue.position).toBe("左眼");
    expect(result?.crossCheck.verdict).toBe("aligned");
  });

  it("當陽部位清楚、另一部位不可判讀時以當陽為準", () => {
    // 41 歲：七十五部位走山根（當陽十三部位），九值走左眼；把眼部遮蔽。
    const partial = faceVisionResultSchema.parse({
      ...baselineVision,
      regions: {
        ...baselineVision.regions,
        eyes: {
          ...clearRegion,
          visibility: "obscured",
          contour: "not_assessable",
          relativeWidth: "not_assessable",
          relativeHeight: "not_assessable"
        }
      }
    });
    const result = resolveFlowYear(partial, 41);
    expect(result?.crossCheck.verdict).toBe("central_prevails");
    expect(result?.crossCheck.text).toContain("山根");
  });

  it("兩法部位都不可判讀時併看法不成立", () => {
    const blocked = faceVisionResultSchema.parse({
      ...baselineVision,
      regions: {
        ...baselineVision.regions,
        eyes: { ...clearRegion, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" }
      },
      details: {
        ...baselineVision.details,
        nasalRoot: { ...clearRegion, visibility: "obscured", contour: "not_assessable", relativeWidth: "not_assessable", relativeHeight: "not_assessable" }
      }
    });
    const result = resolveFlowYear(blocked, 41);
    expect(result?.crossCheck.verdict).toBe("both_limited");
  });

  it("四隘年份會標出關卡", () => {
    for (const age of [41, 51, 61, 71]) {
      const result = resolveFlowYear(vision, age);
      expect(result?.gates.some((gate) => gate.kind === "four_passes"), `${age} 歲`).toBe(true);
    }
    expect(resolveFlowYear(vision, 42)?.gates.some((gate) => gate.kind === "four_passes")).toBe(false);
  });

  it("三關年份會標出關卡", () => {
    for (const age of [15, 25, 35]) {
      expect(resolveFlowYear(vision, age)?.gates.some((gate) => gate.kind === "three_gates"), `${age} 歲`).toBe(true);
    }
  });

  it("當陽十三部位會被標記為主", () => {
    expect(resolveFlowYear(vision, 41)?.seventyFive.central).toBe(true);
    expect(resolveFlowYear(vision, 47)?.seventyFive.central).toBe(false);
    expect(CENTRAL_THIRTEEN_POSITIONS).toHaveLength(13);
  });

  it("沒有年齡時不產生流年段落", () => {
    expect(resolveFlowYear(vision, null)).toBeNull();
    expect(resolveFlowYear(vision, 0)).toBeNull();
  });

  it("同樣輸入產生同樣結果", () => {
    expect(resolveFlowYear(vision, 41)).toEqual(resolveFlowYear(vision, 41));
  });
});

describe("部位反查流年", () => {
  it("鼻對應到教材的 41 至 50 歲區段", () => {
    const positions = flowYearPositionsForFeature("nose");
    expect(positions.map((item) => item.position)).toEqual(["年上", "壽上", "準頭", "蘭臺", "廷尉"]);
    expect(positions[0].from).toBe(44);
    expect(positions.at(-1)?.to).toBe(50);
  });

  it("耳對應到幼年 1 至 14 歲", () => {
    const positions = flowYearPositionsForFeature("ears");
    expect(positions[0].from).toBe(1);
    expect(positions.at(-1)?.to).toBe(14);
  });
});

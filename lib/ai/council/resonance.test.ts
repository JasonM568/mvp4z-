import { describe, expect, it } from "vitest";
import { computeResonance, RESONANCE_MAX, RESONANCE_MIN } from "./resonance";

const full = {
  aspects: [
    { signal: "green" as const, confidence: 100 },
    { signal: "green" as const, confidence: 100 },
    { signal: "green" as const, confidence: 100 }
  ],
  completeness: 100,
  enabledCount: 3,
  chartedCount: 3
};

describe("共鳴度", () => {
  it("永遠落在 60–90 之間", () => {
    const cases = [
      full,
      { aspects: [], completeness: null, enabledCount: 0, chartedCount: 0 },
      { aspects: [{ signal: "red" as const, confidence: 0 }], completeness: 0, enabledCount: 4, chartedCount: 0 },
      { aspects: [{ confidence: 50 }], completeness: 50, enabledCount: 1, chartedCount: 1 }
    ];
    for (const c of cases) {
      const { value } = computeResonance(c);
      expect(value).toBeGreaterThanOrEqual(RESONANCE_MIN);
      expect(value).toBeLessThanOrEqual(RESONANCE_MAX);
    }
  });

  it("全部條件滿分時才拿到 90", () => {
    expect(computeResonance(full).value).toBe(RESONANCE_MAX);
  });

  it("全部條件最差時落到 60", () => {
    const worst = computeResonance({
      aspects: [
        { signal: "green" as const, confidence: 0 },
        { signal: "red" as const, confidence: 0 }
      ],
      completeness: 0,
      enabledCount: 4,
      chartedCount: 0
    });
    // 一致度 0.1 是唯一非零項：0.45×0.1 = 0.045 → 60 + round(30×0.045) = 61
    expect(worst.value).toBeLessThanOrEqual(62);
  });

  it("方向分歧的分數明顯低於方向一致", () => {
    const agree = computeResonance(full).value;
    const conflict = computeResonance({
      ...full,
      aspects: [
        { signal: "green" as const, confidence: 100 },
        { signal: "red" as const, confidence: 100 },
        { signal: "green" as const, confidence: 100 }
      ]
    }).value;
    expect(conflict).toBeLessThan(agree);
    expect(agree - conflict).toBeGreaterThanOrEqual(10);
  });

  it("單一術數即使其餘條件滿分也拿不到 90——沒有交叉驗證的對象", () => {
    const single = computeResonance({
      aspects: [{ signal: "green" as const, confidence: 100 }],
      completeness: 100,
      enabledCount: 1,
      chartedCount: 1
    });
    // 其他三項滿分、只有一致度拿 0.45 → 明顯低於三術同向的 90
    expect(single.value).toBeLessThan(computeResonance(full).value);
    expect(computeResonance(full).value - single.value).toBeGreaterThanOrEqual(5);
    expect(single.basis.note).toContain("無交叉驗證對象");
  });

  it("排盤覆蓋率會影響分數：奇門尚未有排盤引擎時分數較低", () => {
    const withQimen = computeResonance({ ...full, enabledCount: 4, chartedCount: 3 });
    const allCharted = computeResonance({ ...full, enabledCount: 4, chartedCount: 4 });
    expect(withQimen.value).toBeLessThan(allCharted.value);
  });

  it("缺時辰導致的完整度下降會反映在分數上", () => {
    const complete = computeResonance(full).value;
    const missingHour = computeResonance({ ...full, completeness: 60 }).value;
    expect(missingHour).toBeLessThan(complete);
  });

  it("低確信度會拉低分數", () => {
    const high = computeResonance(full).value;
    const low = computeResonance({
      ...full,
      aspects: full.aspects.map((a) => ({ ...a, confidence: 20 }))
    }).value;
    expect(low).toBeLessThan(high);
  });

  it("沒有排盤時完整度不得被當成滿分", () => {
    const none = computeResonance({ ...full, completeness: null });
    expect(none.value).toBeLessThan(computeResonance(full).value);
    expect(none.basis.note).toContain("未取得系統排盤");
  });

  it("實務情境會落在中段而非全部擠在 80 以上", () => {
    // 啟用四術、奇門未排盤、缺時辰、三術同向但一術保留、確信度中等
    const realistic = computeResonance({
      aspects: [
        { signal: "green", confidence: 75 },
        { signal: "yellow", confidence: 60 },
        { signal: "green", confidence: 80 }
      ],
      completeness: 60,
      enabledCount: 4,
      chartedCount: 3
    });
    expect(realistic.value).toBeGreaterThan(RESONANCE_MIN);
    expect(realistic.value).toBeLessThan(80);
  });

  it("計算說明四個分項都有交代", () => {
    const { basis } = computeResonance(full);
    expect(basis.note).toContain("一致");
    expect(basis.note).toContain("確信度");
    expect(basis.note).toContain("完整度");
    expect(basis.note).toContain("系統排盤");
  });
});

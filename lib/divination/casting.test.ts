import { describe, expect, it } from "vitest";
import { formatTaipeiClock, validateCasting, yaoFromCoins } from "./casting";

const NOW = Date.parse("2026-10-23T04:00:00.000Z");

function throwsAt(startMs: number, gapMs: number, yao: string[] = Array(6).fill("少陰")) {
  return { throws: yao.map((y, i) => ({ at: new Date(startMs + i * gapMs).toISOString(), yao: y })) };
}

describe("validateCasting", () => {
  it("沒有搖卦紀錄 → CASTING_REQUIRED", () => {
    for (const raw of [undefined, null, {}, { throws: [] }]) {
      const r = validateCasting(raw, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("CASTING_REQUIRED");
    }
  });

  it("六次、時間遞增、在一小時內 → 通過，並以第一搖為錨點", () => {
    const r = validateCasting(throwsAt(NOW - 120_000, 3000), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.firstAt.toISOString()).toBe(new Date(NOW - 120_000).toISOString());
  });

  it("不是六次 → CASTING_INVALID", () => {
    const five = { throws: throwsAt(NOW - 60_000, 3000).throws.slice(0, 5) };
    const r = validateCasting(five, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("CASTING_INVALID");
  });

  it("爻象不是四種之一 → 拒絕", () => {
    const r = validateCasting(throwsAt(NOW - 60_000, 3000, ["少陽", "少陽", "少陽", "少陽", "少陽", "隨便"]), NOW);
    expect(r.ok).toBe(false);
  });

  it("時間戳相同或倒退 → 拒絕（偽造的整批預設值通常長這樣）", () => {
    expect(validateCasting(throwsAt(NOW - 60_000, 0), NOW).ok).toBe(false);
    const reversed = { throws: throwsAt(NOW - 60_000, 3000).throws.reverse() };
    expect(validateCasting(reversed, NOW).ok).toBe(false);
  });

  it("六搖合計不到 1.5 秒 → 拒絕", () => {
    expect(validateCasting(throwsAt(NOW - 60_000, 100), NOW).ok).toBe(false);
  });

  it("第一搖超過一小時 → 拒絕；晚於現在超過容許誤差 → 拒絕", () => {
    expect(validateCasting(throwsAt(NOW - 61 * 60_000, 3000), NOW).ok).toBe(false);
    expect(validateCasting(throwsAt(NOW + 10 * 60_000, 3000), NOW).ok).toBe(false);
  });

  it("全部都是預設的少陽、又沒有真實時間戳 → 拒絕", () => {
    const r = validateCasting({ throws: Array(6).fill({ at: "x", yao: "少陽" }) }, NOW);
    expect(r.ok).toBe(false);
  });
});

describe("formatTaipeiClock", () => {
  it("UTC 轉成台北時間，跨日正確", () => {
    expect(formatTaipeiClock(new Date("2026-10-23T16:30:00.000Z"))).toBe("2026-10-24 00:30");
  });
});

describe("yaoFromCoins", () => {
  it("三枚錢：正面數 0/1/2/3 → 老陰/少陽/少陰/老陽", () => {
    expect([0, 1, 2, 3].map(yaoFromCoins)).toEqual(["老陰", "少陽", "少陰", "老陽"]);
  });
});

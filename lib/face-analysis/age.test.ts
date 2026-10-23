import { describe, expect, it } from "vitest";
import { nominalAge, taipeiYear } from "./age";

describe("虛歲", () => {
  const now = new Date("2026-10-23T04:00:00.000Z");

  it("今年 − 出生年 + 1：出生當年算 1 歲", () => {
    expect(nominalAge(2026, now)).toBe(1);
    expect(nominalAge(1990, now)).toBe(37);
    expect(nominalAge(1980, now)).toBe(47);
  });

  it("不合理的出生年回 null", () => {
    expect(nominalAge(2027, now)).toBeNull();
    expect(nominalAge(1890, now)).toBeNull();
    expect(nominalAge(null, now)).toBeNull();
    expect(nominalAge(1990.5, now)).toBeNull();
  });

  it("以台北時間換年：UTC 12/31 16:00 已是台北隔年", () => {
    expect(taipeiYear(new Date("2026-12-31T16:00:00.000Z"))).toBe(2027);
    expect(nominalAge(2000, new Date("2026-12-31T16:00:00.000Z"))).toBe(28);
  });
});

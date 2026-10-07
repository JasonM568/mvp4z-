import { describe, expect, it } from "vitest";
import { COUNCIL_DAILY_LIMIT, taipeiDayStartIso } from "./council-quota";

describe("taipeiDayStartIso", () => {
  it("台北 10/07 15:00（UTC 07:00）→ 當日起點為 UTC 10/06 16:00", () =>
    expect(taipeiDayStartIso(new Date("2026-10-07T07:00:00Z"))).toBe("2026-10-06T16:00:00.000Z"));
  it("UTC 10/06 16:00 剛好是台北 10/07 00:00 → 起點就是它自己", () =>
    expect(taipeiDayStartIso(new Date("2026-10-06T16:00:00Z"))).toBe("2026-10-06T16:00:00.000Z"));
  it("UTC 10/06 15:59:59 仍是台北 10/06 → 起點為 UTC 10/05 16:00", () =>
    expect(taipeiDayStartIso(new Date("2026-10-06T15:59:59Z"))).toBe("2026-10-05T16:00:00.000Z"));
  it("跨年：台北 2027-01-01 00:30（UTC 2026-12-31 16:30）", () =>
    expect(taipeiDayStartIso(new Date("2026-12-31T16:30:00Z"))).toBe("2026-12-31T16:00:00.000Z"));
  it("每日上限為 20", () => expect(COUNCIL_DAILY_LIMIT).toBe(20));
});

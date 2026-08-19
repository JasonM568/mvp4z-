import { describe, expect, it } from "vitest";
import { reviewState, type ReviewableRule } from "@/lib/face-analysis/review-state";

const rule = (overrides: Partial<ReviewableRule>): ReviewableRule =>
  ({ version: 1, reviewed_version: null, reviewed_at: null, ...overrides });

describe("判讀規則核對狀態", () => {
  it("沒核對過就是未核對", () => {
    expect(reviewState(rule({}))).toBe("pending");
  });

  it("核對的版本等於目前版本才算已核對", () => {
    expect(reviewState(rule({ version: 3, reviewed_version: 3, reviewed_at: "2026-08-19T00:00:00Z" }))).toBe("reviewed");
  });

  it("核對後內容再被修改，狀態自動失效需重核", () => {
    expect(reviewState(rule({ version: 4, reviewed_version: 3, reviewed_at: "2026-08-19T00:00:00Z" }))).toBe("stale");
  });

  it("只有時間沒有版本的殘缺紀錄不算已核對", () => {
    expect(reviewState(rule({ reviewed_at: "2026-08-19T00:00:00Z", reviewed_version: null }))).toBe("pending");
  });
});

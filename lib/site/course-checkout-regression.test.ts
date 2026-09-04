import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("course checkout initial state", () => {
  const page = readFileSync(resolve(root, "app/(public)/courses/page.tsx"), "utf8");
  const script = readFileSync(resolve(root, "public/js/course-checkout.js"), "utf8");

  it("does not render obsolete course dates or prices before the API responds", () => {
    expect(page).not.toContain("2026年6月21日");
    expect(page).not.toContain("115年第一期");
    expect(page).toContain("讀取最新課程資訊中");
  });

  it("keeps checkout disabled until current course data is available", () => {
    expect(page).toMatch(/id="courseCheckoutSubmit"[^>]+disabled/);
    expect(script).toContain('button.disabled = false');
    // 解鎖後由 syncPrice 寫入含金額的按鈕文字（前往綠界結帳｜NT$ …），而不是固定字串。
    expect(script).toMatch(/button\.disabled = false;\s*syncPrice\(course\);/);
    expect(script).toContain("前往綠界結帳｜NT$");
    expect(script).toContain('button.disabled = true');
  });
});

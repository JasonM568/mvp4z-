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
    expect(script).toContain('button.textContent = "前往綠界結帳"');
    expect(script).toContain('button.disabled = true');
  });
});

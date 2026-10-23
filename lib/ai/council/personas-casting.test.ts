import { describe, expect, it } from "vitest";
import { yixueDataBlock, type CouncilInput } from "./personas";

const input = {
  question: "q",
  yixue: {
    modules: { bazi: true, qimen: true, liuyao: true, meihua: true },
    meihua: { mode: "時間起卦" },
    liuyao: { mode: "親手搖卦" },
    casting: {
      throws: [
        { at: "2026-10-23T11:24:16.178Z", yao: "少陽" },
        { at: "2026-10-23T11:24:17.883Z", yao: "少陰" },
        { at: "2026-10-23T11:24:19.588Z", yao: "老陽" },
        { at: "2026-10-23T11:24:21.295Z", yao: "少陰" },
        { at: "2026-10-23T11:24:23.002Z", yao: "少陰" },
        { at: "2026-10-23T11:24:24.708Z", yao: "少陰" }
      ]
    }
  }
} as unknown as CouncilInput;

describe("yixueDataBlock 親手搖卦", () => {
  for (const chart of ["", "【系統排盤】x"]) {
    it(`有搖卦紀錄時不印「未填／未提供」的時間（chartBlock=${chart ? "有" : "無"}）`, () => {
      const text = yixueDataBlock(input, chart);
      expect(text).toContain("2026-10-23 19:24");
      expect(text).toContain("少陽、少陰、老陽、少陰、少陰、少陰");
      expect(text).not.toContain("起卦時間：未提供");
      expect(text).not.toContain("未填-未填-未填");
    });
  }
});

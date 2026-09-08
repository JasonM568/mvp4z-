// 參考文件的字數預算。
//
// 這個常數決定老師的教材能不能真的進入報告。設太小的後果不是報錯，
// 是**靜默截斷**——文件被砍成「⋯（後略）」，排在後面的整份不進去，
// 而後台只會顯示一條橘色的進度條。2026-09-08 老師上傳的兩份規則
// （9,117 與 7,667 字）就是這樣躺了一天沒被用到。

import { describe, expect, it } from "vitest";
import { DOCUMENT_CHAR_BUDGET } from "./schema";

describe("參考文件字數預算", () => {
  it("足夠放下老師目前的三份判讀規則（20,525 字）", () => {
    // 若日後有人想調小，這條會先擋下來並說明代價。
    expect(DOCUMENT_CHAR_BUDGET).toBeGreaterThanOrEqual(20525);
  });

  it("單份最大的文件（9,117 字）不會被截斷", () => {
    expect(DOCUMENT_CHAR_BUDGET).toBeGreaterThan(9117);
  });

  it("不超過 DeepSeek 64K context 的安全範圍", () => {
    // 文件只掛第一輪與終稿。DeepSeek 走第一輪，其 context 是 64K，
    // 目前每次呼叫本身約 10.9K tokens。中文約 1 字 1 token，
    // 預留一半 context 給盤面、人設與品質門檻。
    const DEEPSEEK_CONTEXT = 64_000;
    expect(DOCUMENT_CHAR_BUDGET).toBeLessThan(DEEPSEEK_CONTEXT / 2);
  });
});

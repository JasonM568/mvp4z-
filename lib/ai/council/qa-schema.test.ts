// QA 2026-10-07｜易學決策報告輸入邊界。
// 純 schema 層、不打網路、不扣點。
// `it.fails`：目前行為「不符期望」才算通過。修好後這些會轉紅，屆時把 `.fails` 拿掉即可。
import { describe, expect, it } from "vitest";
import { councilSchema } from "./schema";

const ok = (extra: Record<string, unknown> = {}) =>
  councilSchema.safeParse({ question: "我該不該換工作？", ...extra });

describe("Happy / 既有防線", () => {
  it("最小合法請求通過", () => expect(ok().success).toBe(true));
  it("question 剛好 2 字通過、1 字擋下", () => {
    expect(councilSchema.safeParse({ question: "好嗎" }).success).toBe(true);
    expect(councilSchema.safeParse({ question: "好" }).success).toBe(false);
  });
  it("question 2001 字擋下、2000 字通過", () => {
    expect(councilSchema.safeParse({ question: "問".repeat(2001) }).success).toBe(false);
    expect(councilSchema.safeParse({ question: "問".repeat(2000) }).success).toBe(true);
  });
  it("純空白 question 擋下（trim 後長度不足）", () =>
    expect(councilSchema.safeParse({ question: "     " }).success).toBe(false));
  it("缺 question / 非字串擋下", () => {
    expect(councilSchema.safeParse({}).success).toBe(false);
    expect(councilSchema.safeParse({ question: 123 }).success).toBe(false);
    expect(councilSchema.safeParse({ question: null }).success).toBe(false);
  });
  it("context 4001 字擋下", () =>
    expect(ok({ context: "x".repeat(4001) }).success).toBe(false));
  it("SQL injection / XSS 字串只當純文字通過（不在 schema 層擋；DB 層為參數化查詢）", () => {
    expect(ok({ question: "'; DROP TABLE council_runs;--" }).success).toBe(true);
    expect(ok({ question: "<script>alert(1)</script>" }).success).toBe(true);
  });
});

describe("未設上限的欄位（成本與提示詞膨脹風險）", () => {
  it.fails("[QA-C1] birth.place 應有長度上限", () =>
    expect(ok({ yixue: { birth: { place: "地".repeat(1_000_000) } } }).success).toBe(false));

  it.fails("[QA-C1] meihua.numbers 應限制個數", () =>
    expect(ok({ yixue: { meihua: { numbers: Array(100_000).fill(1) } } }).success).toBe(false));

  it.fails("[QA-C1] liuyao.yao 應限制為 6 爻", () =>
    expect(ok({ yixue: { liuyao: { yao: Array(10_000).fill("老陽") } } }).success).toBe(false));

  it.fails("[QA-C1] qimen.direction/time 應有長度上限", () =>
    expect(ok({ yixue: { qimen: { direction: "x".repeat(500_000) } } }).success).toBe(false));

  it.fails("[QA-C2] 出生年份應有合理範圍（-99999 不該通過）", () =>
    expect(ok({ yixue: { birth: { year: -99999, month: 1, day: 1 } } }).success).toBe(false));

  it.fails("[QA-C2] 月/日/時/分超出範圍（月=13、日=99、時=99）不該通過", () =>
    expect(ok({ yixue: { birth: { year: 1990, month: 13, day: 99, hour: 99, minute: 99 } } }).success).toBe(false));

  it.fails("[QA-C2] 非數字字串的年份（'abc'）不該通過", () =>
    expect(ok({ yixue: { birth: { year: "abc" } } }).success).toBe(false));
});

describe("未宣告欄位", () => {
  it("多餘欄位被剝除、不會流進 prompt", () => {
    const p = councilSchema.safeParse({ question: "測試問題", isAdmin: true, creditsCost: 0 });
    expect(p.success && "isAdmin" in p.data).toBe(false);
    expect(p.success && "creditsCost" in p.data).toBe(false);
  });
});

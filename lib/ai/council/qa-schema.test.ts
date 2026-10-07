// QA 2026-10-07｜易學決策報告輸入邊界。
// 純 schema 層、不打網路、不扣點。
// C1／C2 已於 2026-10-07 修復，原本的 it.fails 已改回 it，成為迴歸測試。
import { describe, expect, it } from "vitest";
import { councilSchema } from "./schema";
import { buildInitialForm } from "@/app/member-ai/decision/_form-config";
import { buildCouncilPayload } from "@/app/member-ai/decision/_actions";

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
  it("[QA-C1] birth.place 應有長度上限", () =>
    expect(ok({ yixue: { birth: { place: "地".repeat(1_000_000) } } }).success).toBe(false));

  it("[QA-C1] meihua.numbers 應限制個數", () =>
    expect(ok({ yixue: { meihua: { numbers: Array(100_000).fill(1) } } }).success).toBe(false));

  it("[QA-C1] liuyao.yao 應限制為 6 爻", () =>
    expect(ok({ yixue: { liuyao: { yao: Array(10_000).fill("老陽") } } }).success).toBe(false));

  it("[QA-C1] qimen.direction/time 應有長度上限", () =>
    expect(ok({ yixue: { qimen: { direction: "x".repeat(500_000) } } }).success).toBe(false));

  it("[QA-C2] 出生年份應有合理範圍（-99999 不該通過）", () =>
    expect(ok({ yixue: { birth: { year: -99999, month: 1, day: 1 } } }).success).toBe(false));

  it("[QA-C2] 月/日/時/分超出範圍（月=13、日=99、時=99）不該通過", () =>
    expect(ok({ yixue: { birth: { year: 1990, month: 13, day: 99, hour: 99, minute: 99 } } }).success).toBe(false));

  it("[QA-C2] 非數字字串的年份（'abc'）不該通過", () =>
    expect(ok({ yixue: { birth: { year: "abc" } } }).success).toBe(false));
});

describe("C2 迴歸：合法輸入不可被誤擋", () => {
  const valid = (birth: Record<string, unknown>) => ok({ yixue: { birth } }).success;
  it("前端實際送的形狀：空字串代表未填", () =>
    expect(valid({ calendar: "國曆", isLeapMonth: "否", year: "1985", month: "7", day: "12",
      hourBranch: "午", timeKnown: "是", hour: "", minute: "", place: "" })).toBe(true));
  it("數字型態也通過", () => expect(valid({ year: 1985, month: 7, day: 12, hour: 23, minute: 59 })).toBe(true));
  it("邊界：1900 年、2100 年、0 時 0 分", () => {
    expect(valid({ year: 1900, month: 1, day: 1, hour: 0, minute: 0 })).toBe(true);
    expect(valid({ year: 2100, month: 12, day: 31 })).toBe(true);
  });
  it("越界：1899、2101、24 時、60 分、小數、負數", () => {
    for (const b of [{ year: 1899 }, { year: 2101 }, { hour: 24 }, { minute: 60 }, { month: 0 }, { day: 0 }, { year: 1985.5 }, { month: -1 }])
      expect(valid(b), JSON.stringify(b)).toBe(false);
  });
  it("國曆不存在的日期擋下（2/30、4/31、非閏年 2/29），閏年 2/29 通過", () => {
    expect(valid({ calendar: "國曆", year: 1985, month: 2, day: 30 })).toBe(false);
    expect(valid({ calendar: "國曆", year: 1985, month: 4, day: 31 })).toBe(false);
    expect(valid({ calendar: "國曆", year: 1985, month: 2, day: 29 })).toBe(false);
    expect(valid({ calendar: "國曆", year: 1984, month: 2, day: 29 })).toBe(true);
  });
  it("農曆 30 日不在這層判（由排盤引擎查曆）", () =>
    expect(valid({ calendar: "農曆", year: 1985, month: 2, day: 30 })).toBe(true));
  it("事件時間同樣檢查", () => {
    expect(ok({ yixue: { eventTime: { year: 2026, month: 2, day: 30 } } }).success).toBe(false);
    expect(ok({ yixue: { eventTime: { year: 2026, month: 10, day: 7, hour: 21, minute: 30 } } }).success).toBe(true);
  });
});

describe("C1 迴歸：合法形狀不可被誤擋", () => {
  it("六爻 6 爻、梅花 3 個數字、place 60 字通過", () => {
    expect(ok({ yixue: { liuyao: { yao: ["少陽", "少陰", "老陽", "老陰", "少陽", "少陰"] } } }).success).toBe(true);
    expect(ok({ yixue: { meihua: { numbers: ["123", "456", "789"] } } }).success).toBe(true);
    expect(ok({ yixue: { birth: { place: "地".repeat(60) } } }).success).toBe(true);
  });
  it("第 7 爻、第 4 個數字、place 61 字擋下", () => {
    expect(ok({ yixue: { liuyao: { yao: Array(7).fill("少陽") } } }).success).toBe(false);
    expect(ok({ yixue: { meihua: { numbers: [1, 2, 3, 4] } } }).success).toBe(false);
    expect(ok({ yixue: { birth: { place: "地".repeat(61) } } }).success).toBe(false);
  });
});

describe("未宣告欄位", () => {
  it("多餘欄位被剝除、不會流進 prompt", () => {
    const p = councilSchema.safeParse({ question: "測試問題", isAdmin: true, creditsCost: 0 });
    expect(p.success && "isAdmin" in p.data).toBe(false);
    expect(p.success && "creditsCost" in p.data).toBe(false);
  });
});

describe("前端預設表單送出的 payload 必須通過（不可誤擋正常會員）", () => {
  const modulesSets = [
    { bazi: true, qimen: false, liuyao: false, meihua: false },
    { bazi: false, qimen: true, liuyao: false, meihua: false },
    { bazi: false, qimen: false, liuyao: true, meihua: false },
    { bazi: false, qimen: false, liuyao: false, meihua: true },
    { bazi: true, qimen: true, liuyao: true, meihua: true }
  ];
  for (const modules of modulesSets) {
    it(`modules=${Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join("+")}`, () => {
      const form = { ...buildInitialForm(), question: "我該不該換工作？" } as any;
      const payload = buildCouncilPayload(form, modules as any);
      const r = councilSchema.safeParse(payload);
      expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    });
  }
});

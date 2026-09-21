// 點數不足錯誤。
//
// 這組規則的重點是「前端不必比對中文字串」：2026-09-21 之前三支 API 各說各話
// （「點數不足，請先儲值或升級方案」「點數已用完，請續訂方案或啟用新方案」
// 「完整面相報告需要 20 點，目前點數不足」），前端只拿得到 message，
// 於是只能顯示一句紅字，沒有任何出口。

import { describe, expect, it } from "vitest";
import {
  CREDITS_PURCHASE_PATH,
  INSUFFICIENT_CREDITS_CODE,
  insufficientCreditsError,
  isInsufficientCredits
} from "./credits";
import { errorBody, errorStatus } from "./member";

describe("點數不足錯誤", () => {
  const err = insufficientCreditsError({ feature: "四象天機報告", required: 20, remaining: 3 });

  it("帶固定的 code，前端據此判斷而非比對文案", () => {
    expect(err.code).toBe(INSUFFICIENT_CREDITS_CODE);
    expect(isInsufficientCredits(err)).toBe(true);
  });

  it("回 403 而不是 500", () => {
    expect(errorStatus(err)).toBe(403);
  });

  it("算得出差額，前端不必自己相減", () => {
    expect(err.details.required).toBe(20);
    expect(err.details.remaining).toBe(3);
    expect(err.details.shortfall).toBe(17);
  });

  it("訊息要講出具體數字，不是只說「點數不足」", () => {
    // 只說不足，會員得自己去別頁查餘額才知道要買哪個方案。
    expect(err.message).toContain("20 點");
    expect(err.message).toContain("3 點");
    expect(err.message).toContain("未扣點");
  });

  it("帶上加購路徑，前端不用自己記", () => {
    expect(err.details.purchasePath).toBe(CREDITS_PURCHASE_PATH);
    expect(CREDITS_PURCHASE_PATH).toBe("/member-pricing");
  });

  it("剩餘點數為 0 時 shortfall 等於需求", () => {
    const zero = insufficientCreditsError({ feature: "AI 即時問答", required: 1, remaining: 0 });
    expect(zero.details.shortfall).toBe(1);
  });

  it("負數或小數的餘額不會外流成奇怪的數字", () => {
    const odd = insufficientCreditsError({ feature: "測試", required: 20.6, remaining: -3 });
    expect(odd.details.remaining).toBe(0);
    expect(odd.details.required).toBe(20);
    expect(odd.details.shortfall).toBe(20);
  });
});

describe("錯誤回應信封", () => {
  it("errorBody 會把 code 與 details 一起帶出去", () => {
    const body = errorBody(insufficientCreditsError({ feature: "完整面相報告", required: 20, remaining: 5 }));
    expect(body.code).toBe(INSUFFICIENT_CREDITS_CODE);
    expect(body.details).toMatchObject({ required: 20, remaining: 5, shortfall: 15 });
    expect(body.error).toContain("20 點");
  });

  it("沒有 code 的一般錯誤行為不變，只有 error 一個欄位", () => {
    const body = errorBody(new Error("其他錯誤"));
    expect(body).toEqual({ error: "其他錯誤" });
    expect("code" in body).toBe(false);
    expect("details" in body).toBe(false);
  });
});

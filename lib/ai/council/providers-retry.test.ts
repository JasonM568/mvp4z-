// 退避與重試分類。
//
// 這裡鎖的是三件會靜默出錯的事：
// 1. 該退避的有沒有退避（「high demand」立刻重試等於沒重試）
// 2. 不該重試的有沒有停手（400 再打一百次也一樣，白花 45 秒）
// 3. **退避有沒有可能讓整份報告爆掉 maxDuration** —— 這條最重要，
//    因為它壞掉的方式是「報告整個生不出來」，比少一家意見嚴重得多。

import { describe, expect, it } from "vitest";
import { backoffDelayMs, isRetryableFailure, withRetry, type ModelResult } from "./providers";

function failure(status: number | null, error = "boom"): ModelResult {
  return { role: "geminiFengYi", label: "測試", ok: false, text: "", error, status, tokensIn: 0, tokensOut: 0 };
}

describe("重試分類依 status 而非錯誤字串", () => {
  it("429 限流要重試", () => {
    expect(isRetryableFailure(failure(429))).toBe(true);
  });

  it("5xx 要重試（Gemini 的 high demand 走這條，正式庫 11 次全是它）", () => {
    for (const s of [500, 502, 503, 529]) expect(isRetryableFailure(failure(s))).toBe(true);
  });

  it("沒有 status 代表逾時或網路中斷，要重試", () => {
    expect(isRetryableFailure(failure(null, "Gemini 系統回應逾時"))).toBe(true);
  });

  it("400／401／403 不重試——請求本身有問題，再打一百次也一樣", () => {
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableFailure(failure(s))).toBe(false);
  });

  it("金鑰未設定不重試", () => {
    expect(isRetryableFailure(failure(null, "GEMINI_API_KEY 未設定"))).toBe(false);
  });

  it("不靠錯誤訊息文字判斷：上游改寫文案也不影響分類", () => {
    // 上游哪天把 high demand 換句話說，分類仍然要正確。
    expect(isRetryableFailure(failure(503, "完全不同的新文案"))).toBe(true);
    expect(isRetryableFailure(failure(400, "完全不同的新文案"))).toBe(false);
  });
});

describe("退避延遲", () => {
  it("指數成長並封頂在 8 秒", () => {
    const noJitter = () => 0.5; // jitter = 1.0
    expect(backoffDelayMs(1, noJitter)).toBe(1500);
    expect(backoffDelayMs(2, noJitter)).toBe(3000);
    expect(backoffDelayMs(3, noJitter)).toBe(6000);
    expect(backoffDelayMs(4, noJitter)).toBe(8000);
    expect(backoffDelayMs(9, noJitter)).toBe(8000);
  });

  it("jitter 在 ±25% 之內，且不會是 0（0 等於沒退避）", () => {
    for (const r of [0, 0.25, 0.75, 1]) {
      const d = backoffDelayMs(1, () => r);
      expect(d).toBeGreaterThanOrEqual(1500 * 0.75);
      expect(d).toBeLessThanOrEqual(1500 * 1.25);
    }
  });
});

describe("預算感知：退避絕不可以讓整份報告爆掉 maxDuration", () => {
  // 一份報告最壞是 R1 + R2 + 終稿 = 290s，route 的 maxDuration 是 300s，
  // 只剩 10 秒餘裕。以下用注入的時鐘模擬真實時間軸，不必真的等。
  const TIMEOUT = 45_000;
  const BUDGET = 90_000; // = timeoutMs × 2，刻意沿用改版前的最壞情況

  /** 造一個假時鐘：每次呼叫 fn 就前進 costMs。 */
  function harness(costsMs: number[], result: (i: number) => ModelResult) {
    let clock = 0;
    const slept: number[] = [];
    let i = 0;
    return {
      slept,
      elapsed: () => clock,
      calls: () => i,
      run: (attempts: number, budget = BUDGET) =>
        withRetry(
          attempts,
          TIMEOUT,
          budget,
          async () => {
            clock += costsMs[Math.min(i, costsMs.length - 1)];
            return result(i++);
          },
          { now: () => clock, sleepFn: async (ms) => { slept.push(ms); clock += ms; } }
        )
    };
  }

  const highDemand = () => failure(503, "This model is currently experiencing high demand.");
  const timedOut = () => failure(null, "Gemini 系統回應逾時");

  it("秒回的 high demand：四次嘗試都跑得完，而且每次之間有退避", async () => {
    const h = harness([2000], highDemand);
    const r = await h.run(4);
    expect(h.calls()).toBe(4);
    expect(h.slept).toHaveLength(3);
    expect(h.slept.every((ms) => ms > 0)).toBe(true);
    expect(r.attempts).toBe(4);
    // 全程遠低於單輪預算，不會壓縮到終稿的時間
    expect(h.elapsed()).toBeLessThan(BUDGET);
  });

  it("跑滿 45 秒的逾時：仍然重試一次，但不睡——最壞情況與改版前完全相同", async () => {
    const h = harness([45_000], timedOut);
    await h.run(4);
    expect(h.calls()).toBe(2);          // 第三次塞不下（90+45 > 90）
    expect(h.slept).toEqual([]);        // 睡了就會超出預算，所以一次都不能睡
    expect(h.elapsed()).toBe(90_000);   // 正好等於改版前的 45×2
  });

  it("預算用完就停手，不會送出注定被砍斷的呼叫", async () => {
    const h = harness([50_000], highDemand);
    await h.run(4);
    expect(h.calls()).toBe(1); // 50+45 > 90
  });

  it("400 這種永久性錯誤只打一次，不浪費 45 秒", async () => {
    const h = harness([500], () => failure(400, "invalid request"));
    const r = await h.run(4);
    expect(h.calls()).toBe(1);
    expect(h.slept).toEqual([]);
    expect(r.attempts).toBe(1);
  });

  it("成功就立刻回，並記下用了第幾次", async () => {
    const h = harness([2000], (i) =>
      i < 2
        ? highDemand()
        : { role: "geminiFengYi", label: "測試", ok: true, text: "好了", status: 200, tokensIn: 1, tokensOut: 1 }
    );
    const r = await h.run(4);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
    expect(h.calls()).toBe(3);
  });

  it("終稿那種 attempts=1 的呼叫不會被改成重試", async () => {
    const h = harness([1000], timedOut);
    await h.run(1, 110_000);
    expect(h.calls()).toBe(1);
    expect(h.slept).toEqual([]);
  });
});

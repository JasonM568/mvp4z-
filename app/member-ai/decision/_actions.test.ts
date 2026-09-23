// runCouncilReport 的錯誤分類。
//
// 這裡唯一在乎的事情：分清楚「伺服器說不行」與「我們沒聽到回音」。
// 前者報告確定沒產出；後者報告可能已經跑完並扣了 20 點，只是回應掉了。
// 分錯邊的代價不對稱——把後者當前者，會員付了錢卻永遠回不到那份報告，
// 所以判斷不出來時一律當後者。

import { afterEach, describe, expect, it, vi } from "vitest";
import { runCouncilReport } from "./_actions";

const payload = {} as Parameters<typeof runCouncilReport>[0];

function withToken() {
  const store: Record<string, string> = { xunfeng_member_token: "t" };
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store[k] ?? null } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runCouncilReport 的錯誤分類", () => {
  it("沒登入就不送，也不算連線失敗", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    const r = await runCouncilReport(payload);
    expect(r.error).toContain("尚未登入");
    expect(r.transportFailed).toBeUndefined();
  });

  it("伺服器明確回錯 → 不標 transportFailed（本地可清掉進行中紀錄）", async () => {
    withToken();
    vi.stubGlobal("fetch", async () => ({
      status: 402,
      json: async () => ({ error: "點數不足", code: "INSUFFICIENT_CREDITS" })
    }));
    const r = await runCouncilReport(payload);
    expect(r.code).toBe("INSUFFICIENT_CREDITS");
    expect(r.transportFailed).toBeFalsy();
  });

  it("連線中斷 → 標 transportFailed（報告可能已跑完並扣點）", async () => {
    withToken();
    vi.stubGlobal("fetch", async () => { throw new Error("Failed to fetch"); });
    const r = await runCouncilReport(payload);
    expect(r.transportFailed).toBe(true);
  });

  it("回的不是 JSON（504 / WAF 擋頁）→ 也標 transportFailed", async () => {
    withToken();
    vi.stubGlobal("fetch", async () => ({
      status: 504,
      json: async () => { throw new SyntaxError("Unexpected token <"); }
    }));
    const r = await runCouncilReport(payload);
    expect(r.transportFailed).toBe(true);
    expect(r.error).toContain("504");
  });
});

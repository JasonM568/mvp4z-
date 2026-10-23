// runCouncilReport 的錯誤分類。
//
// 這裡唯一在乎的事情：分清楚「伺服器說不行」與「我們沒聽到回音」。
// 前者報告確定沒產出；後者報告可能已經跑完並扣了 20 點，只是回應掉了。
// 分錯邊的代價不對稱——把後者當前者，會員付了錢卻永遠回不到那份報告，
// 所以判斷不出來時一律當後者。

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCouncilPayload, runCouncilReport } from "./_actions";
import { buildInitialForm, buildInitialModules } from "./_form-config";

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

  it("送出遇到 401 → 換新憑證後重送一次，成功就回報告", async () => {
    const store: Record<string, string> = { xunfeng_member_token: "old", xunfeng_member_refresh: "r1" };
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } }
    });
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes("/api/auth/refresh")) {
        return { ok: true, status: 200, json: async () => ({ token: "new", refresh_token: "r2" }) };
      }
      seen.push(init?.headers?.Authorization || "");
      return seen.length === 1
        ? { ok: false, status: 401, json: async () => ({ error: "登入已過期，請重新登入" }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, final: { ok: true, label: "x", text: "報告" } }) };
    });
    const r = await runCouncilReport(payload);
    expect(seen).toEqual(["Bearer old", "Bearer new"]);
    expect(r.final?.text).toBe("報告");
    expect(store.xunfeng_member_token).toBe("new");
  });

  it("401 且換不到新憑證 → 只送一次，照實回報登入過期", async () => {
    withToken();
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return { ok: false, status: 401, json: async () => ({ error: "登入已過期，請重新登入" }) };
    });
    const r = await runCouncilReport(payload);
    expect(calls).toBe(1);
    expect(r.error).toContain("登入已過期");
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

describe("#7 進階選項必須真能控制報告", () => {
  it("不再向會員顯示沒有對應輸入與流程的策略校核／八字判讀旋鈕", () => {
    const form = buildInitialForm() as unknown as Record<string, unknown>;
    expect(form).not.toHaveProperty("reviewMode");
    expect(form).not.toHaveProperty("baziMode");
  });

  it("起局時間不再由前端決定：奇門、六爻、梅花都不送時間或起局方式", () => {
    const form = buildInitialForm();
    const payload = buildCouncilPayload(form, buildInitialModules());
    expect(payload.yixue.qimen).toEqual({ mode: "第一搖時刻起局", direction: "不確定" });
    expect(payload.yixue.liuyao).toEqual({ mode: "親手搖卦" });
    expect(payload.yixue.meihua).toEqual({ mode: "時間起卦" });
    expect(JSON.stringify(payload)).not.toContain("現在起局");
  });

  it("事件方位送白話方位加後天八卦宮；沒選就是不確定", () => {
    const form = buildInitialForm();
    form.direction = "東北";
    expect(buildCouncilPayload(form, buildInitialModules()).yixue.qimen.direction).toBe("東北（艮宮）");
    form.direction = "西北";
    expect(buildCouncilPayload(form, buildInitialModules()).yixue.qimen.direction).toBe("西北（乾宮）");
    form.direction = "亂填";
    expect(buildCouncilPayload(form, buildInitialModules()).yixue.qimen.direction).toBe("不確定");
  });

  it("新表單沒有預設問題類型、沒有搖卦、沒有事件日期", () => {
    const form = buildInitialForm();
    expect(form.topic).toBe("");
    expect(form.castThrows).toEqual([]);
    expect(form.eventDate).toBe("");
    expect(buildCouncilPayload(form, buildInitialModules()).yixue).not.toHaveProperty("eventTime");
  });

  it("搖卦紀錄原樣送出；事件日期只在有填時送出，且不帶時分", () => {
    const form = buildInitialForm();
    form.castThrows = [{ at: "2026-10-23T04:00:00.000Z", yao: "老陽" }];
    form.eventDate = "2026-11-05";
    const payload = buildCouncilPayload(form, buildInitialModules());
    expect(payload.yixue.casting.throws).toEqual(form.castThrows);
    expect(payload.yixue.eventTime).toEqual({ year: 2026, month: 11, day: 5 });
  });
});

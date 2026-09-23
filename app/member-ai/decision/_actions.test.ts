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

  it("奇門現在起局送獨立的台北當下時間；指定時間留給事件欄位", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-23T02:15:00.000Z"));
      const form = buildInitialForm();
      form.eventYear = 2020;
      form.eventMonth = 1;
      form.eventDay = 2;
      form.eventHour = 3;
      form.eventMinute = 4;
      form.qimenTimeMode = "現在起局";
      const now = buildCouncilPayload(form, buildInitialModules());
      expect(now.yixue.qimen).toMatchObject({ mode: "現在起局", time: "2026-09-23 10:15" });
      form.qimenTimeMode = "指定時間";
      const specified = buildCouncilPayload(form, buildInitialModules());
      expect(specified.yixue.qimen).toMatchObject({ mode: "指定時間" });
      expect(specified.yixue.qimen.time).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

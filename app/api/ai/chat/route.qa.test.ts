import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  ask: vi.fn(),
  usageId: 0
}));

vi.mock("@/lib/ai/member-chat", () => ({
  chatSchema: { parse: (value: unknown) => value },
  chatCreditCost: () => 1,
  askXunfengAI: mocks.ask
}));

vi.mock("@/lib/auth/member", () => ({
  requireBearerProfile: async () => ({ profile: { id: "qa-profile" } }),
  readJson: async (request: NextRequest) => request.json(),
  getPublicMember: async () => ({ id: "qa-profile", credits_remaining: 0 }),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status }),
  errorStatus: (error: { status?: number }) => error.status || 500,
  errorBody: (error: Error) => ({ error: error.message })
}));

vi.mock("@/lib/auth/credits", () => ({
  insufficientCreditsError: () => Object.assign(new Error("點數不足"), { status: 403 })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        order: () => query,
        limit: () => query,
        insert: () => query,
        maybeSingle: async () => ({
          data: { id: "qa-entitlement", credits_remaining: 1, plans: { code: "basic" } },
          error: null
        }),
        single: async () => ({ data: { id: `qa-usage-${++mocks.usageId}` }, error: null })
      };
      if (table !== "member_entitlements" && table !== "usage_logs") throw new Error(`Unexpected table ${table}`);
      return query;
    },
    rpc: mocks.rpc
  })
}));

import { POST } from "./route";

describe("AI 問答並行扣點 QA", () => {
  // 現況：兩個請求都讀到 1 點、都呼叫 LLM；第二筆撞 CR002 卻仍交付免費回覆。
  // 修復後改成一般 it，應在 LLM 前攔下第二筆，且只呼叫一次 LLM。
  it.fails("1 點同時送兩題時只交付一份回覆", async () => {
    mocks.usageId = 0;
    mocks.ask.mockReset().mockResolvedValue({ reply: "測試回覆", tokens_input: 1, tokens_output: 1 });
    mocks.rpc.mockReset()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: "CR002", message: "credits changed" } });

    const request = () => new NextRequest("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer qa" },
      body: JSON.stringify({ message: "同時提問" })
    });
    const responses = await Promise.all([POST(request()), POST(request())]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(bodies.filter((body) => body.credits_charged === 0 && body.reply)).toHaveLength(0);
  });
});

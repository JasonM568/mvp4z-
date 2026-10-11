import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getPublicMember: vi.fn() }));

vi.mock("@/lib/auth/member", () => ({
  requireBearerProfile: async () => ({ profile: { id: "qa-profile" } }),
  readJson: async (request: NextRequest) => request.json(),
  redeemSchema: {},
  getPublicMember: mocks.getPublicMember,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status }),
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

import { POST } from "./route";

describe("啟用碼並行兌換 QA", () => {
  it("原子 RPC 只有一筆搶碼成功時，API 只回一筆 200", async () => {
    mocks.rpc.mockReset()
      .mockResolvedValueOnce({ data: [{ redeemed: true, entitlement_id: "qa-entitlement" }], error: null })
      .mockResolvedValueOnce({ data: [{ redeemed: false, entitlement_id: null }], error: null });
    mocks.getPublicMember.mockReset().mockResolvedValue({ plan: "basic", credits_remaining: 100 });

    const request = () => new NextRequest("http://localhost/api/member/redeem", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer qa" },
      body: JSON.stringify({ code: "QA-ONE-TIME" })
    });
    const responses = await Promise.all([POST(request()), POST(request())]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(bodies.filter((body) => body.ok)).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.getPublicMember).toHaveBeenCalledTimes(1);
  });
});

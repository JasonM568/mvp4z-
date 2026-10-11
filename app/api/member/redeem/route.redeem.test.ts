import { afterEach, describe, expect, it, vi } from "vitest";
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

function request() {
  return new NextRequest("http://localhost/api/member/redeem", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer qa" },
    body: JSON.stringify({ code: "qa-one-time" })
  });
}

describe("啟用碼兌換 RPC route", () => {
  afterEach(() => vi.resetAllMocks());

  it("呼叫原子 RPC，成功後回傳會員資料", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ redeemed: true, entitlement_id: "qa-entitlement" }], error: null });
    mocks.getPublicMember.mockResolvedValue({ plan: "basic", credits_remaining: 100, expires_at: "2027-01-01" });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("redeem_activation_code", {
      p_code: "qa-one-time",
      p_user_id: "qa-profile"
    });
    expect((await response.json()).ok).toBe(true);
  });

  it("RPC 表示未搶到啟用碼時回傳明確 400", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ redeemed: false, entitlement_id: null }], error: null });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "啟用碼不存在或已被使用" });
    expect(mocks.getPublicMember).not.toHaveBeenCalled();
  });

  it("原子 transaction 中任何 DB 寫入錯誤都保留為 500", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "credit transaction insert failed" } });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.getPublicMember).not.toHaveBeenCalled();
  });
});

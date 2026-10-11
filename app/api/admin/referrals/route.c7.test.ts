import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireNamedAdmin: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ profile: { id: "qa-admin" } })),
  requireNamedAdmin: (...args: unknown[]) => mocks.requireNamedAdmin(...args)
}));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));

import { PATCH, POST } from "./route";

function request(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/admin/referrals", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("referral partner atomic writes", () => {
  beforeEach(() => mocks.requireNamedAdmin.mockResolvedValue({ profile: { id: "qa-admin" } }));
  afterEach(() => vi.resetAllMocks());

  it("creates a partner through the audited RPC as a named admin", async () => {
    mocks.rpc.mockResolvedValue({ data: { partner: { id: "partner-1", code: "QA_REF", is_active: true } }, error: null });
    const response = await POST(request("POST", { code: "QA_REF", name: "QA Partner", commission_rate: 0.25 }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_referral_partner", expect.objectContaining({
      p_action: "create", p_admin_user_id: "qa-admin",
      p_payload: expect.objectContaining({ code: "QA_REF", commission_rate: 0.25 })
    }));
  });

  it("updates through the audited RPC with the typed active flag", async () => {
    mocks.rpc.mockResolvedValue({ data: { partner: { id: "partner-1", commission_rate: 0.3, is_active: false } }, error: null });
    const response = await PATCH(request("PATCH", { id: "partner-1", commission_rate: 0.3, is_active: false }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_referral_partner", expect.objectContaining({
      p_action: "update", p_admin_user_id: "qa-admin",
      p_payload: { id: "partner-1", commission_rate: 0.3, is_active: false }
    }));
  });

  it("rejects string booleans before any write", async () => {
    const response = await PATCH(request("PATCH", { id: "partner-1", is_active: "false" }));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unaudited shared-admin identity", async () => {
    mocks.requireNamedAdmin.mockRejectedValue({ message: "named admin required", status: 403 });
    const response = await PATCH(request("PATCH", { id: "partner-1", is_active: false }));

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

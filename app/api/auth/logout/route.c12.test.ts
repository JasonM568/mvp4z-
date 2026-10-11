import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth/member", () => ({
  createSupabasePasswordClient: () => ({ auth: { refreshSession: (...args: unknown[]) => mocks.refreshSession(...args) } })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { signOut: (...args: unknown[]) => mocks.signOut(...args) } } })
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/auth/logout C12", () => {
  afterEach(() => vi.resetAllMocks());

  it("revokes only the session represented by the refresh token", async () => {
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh-access" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    const response = await POST(request({ refresh_token: "refresh" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.refreshSession).toHaveBeenCalledWith({ refresh_token: "refresh" });
    expect(mocks.signOut).toHaveBeenCalledWith("fresh-access", "local");
  });

  it("is idempotent for a refresh token already expired or revoked", async () => {
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 401 } });

    const response = await POST(request({ refresh_token: "stale" }));

    expect(response.status).toBe(200);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

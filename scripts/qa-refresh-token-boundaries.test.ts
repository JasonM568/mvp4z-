import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  clientCreations: 0,
  refreshCalls: [] as string[],
  ensureCalls: [] as Array<Record<string, unknown>>,
  memberCalls: [] as string[],
  result: null as { data: any; error: any } | null,
  ensureError: null as Error | null
}));

vi.mock("@/lib/auth/member", () => ({
  createSupabasePasswordClient: () => {
    state.clientCreations++;
    return { auth: { refreshSession: async ({ refresh_token }: { refresh_token: string }) => {
      state.refreshCalls.push(refresh_token);
      return state.result;
    } } };
  },
  ensureProfileForAuthUser: async (input: Record<string, unknown>) => {
    state.ensureCalls.push(input);
    if (state.ensureError) throw state.ensureError;
    return { id: "qa-profile" };
  },
  getPublicMember: async (id: string) => {
    state.memberCalls.push(id);
    return { id, email: "qa-refresh@example.test", role: "member", credits_remaining: 0 };
  },
  authResponse: (session: { access_token: string; refresh_token?: string }, member: unknown) => ({
    ok: true, token: session.access_token, refresh_token: session.refresh_token, member
  }),
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));

import { POST } from "@/app/api/auth/refresh/route";

function request(body: string) {
  return new NextRequest("http://localhost/api/auth/refresh", {
    method: "POST", headers: { "content-type": "application/json" }, body
  });
}

describe("QA refresh-token route boundaries", () => {
  beforeEach(() => {
    state.clientCreations = 0;
    state.refreshCalls.length = 0;
    state.ensureCalls.length = 0;
    state.memberCalls.length = 0;
    state.result = { data: { session: null, user: null }, error: { status: 401 } };
    state.ensureError = null;
  });

  it("rejects missing, blank, null, and malformed token bodies before creating Auth client", async () => {
    for (const body of ["{}", "{\"refresh_token\":\"   \"}", "{\"refresh_token\":null}", "{"]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(state.clientCreations).toBe(0);
    expect(state.refreshCalls).toHaveLength(0);
  });

  it("returns the same generic 401 for invalid, expired, and revoked token results", async () => {
    const results = [
      { data: { session: null, user: null }, error: { status: 401, message: "invalid token" } },
      { data: { session: null, user: null }, error: { status: 401, message: "expired token" } },
      { data: { session: null, user: null }, error: { status: 401, message: "revoked token" } }
    ];
    const responses = [];
    for (const result of results) {
      state.result = result;
      responses.push(await POST(request(JSON.stringify({ refresh_token: "synthetic-invalid" }))));
    }
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
    expect(bodies).toEqual(Array(3).fill({ error: "登入已過期，請重新登入" }));
    expect(state.ensureCalls).toHaveLength(0);
    expect(state.memberCalls).toHaveLength(0);
  });

  it("rejects incomplete session or user responses without provisioning a profile", async () => {
    for (const data of [
      { session: null, user: { id: "qa-user", email: "qa@example.test" } },
      { session: { access_token: "fresh" }, user: { id: "qa-user", email: "" } },
      { session: { access_token: "fresh" }, user: { id: "", email: "qa@example.test" } }
    ]) {
      state.result = { data, error: null };
      const response = await POST(request(JSON.stringify({ refresh_token: "synthetic-token" })));
      expect(response.status).toBe(401);
    }
    expect(state.ensureCalls).toHaveLength(0);
    expect(state.memberCalls).toHaveLength(0);
  });

  it("returns rotated session credentials and uses refreshed user metadata", async () => {
    state.result = {
      data: {
        session: { access_token: "fresh-access", refresh_token: "rotated-refresh" },
        user: { id: "qa-auth-user", email: "qa@example.test", user_metadata: { name: "QA", phone: "0912345678" } }
      },
      error: null
    };
    const response = await POST(request(JSON.stringify({ refresh_token: "old-refresh" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, token: "fresh-access", refresh_token: "rotated-refresh" });
    expect(state.refreshCalls).toEqual(["old-refresh"]);
    expect(state.ensureCalls).toEqual([{ authUserId: "qa-auth-user", email: "qa@example.test", name: "QA", phone: "0912345678" }]);
    expect(state.memberCalls).toEqual(["qa-profile"]);
  });

  it("forwards each simultaneous refresh request to Auth independently", async () => {
    state.result = {
      data: {
        session: { access_token: "fresh-access", refresh_token: "rotated-refresh" },
        user: { id: "qa-auth-user", email: "qa@example.test" }
      },
      error: null
    };
    const responses = await Promise.all([
      POST(request(JSON.stringify({ refresh_token: "same-old-refresh" }))),
      POST(request(JSON.stringify({ refresh_token: "same-old-refresh" })))
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(state.refreshCalls).toEqual(["same-old-refresh", "same-old-refresh"]);
    // Stub evidence only: actual Supabase rotation/reuse behavior requires an isolated Auth server.
  });
});

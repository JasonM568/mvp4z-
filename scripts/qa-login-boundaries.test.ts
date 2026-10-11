import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ email: string; password: string }>,
  nextError: null as (Error & { status?: number }) | null,
  nextData: { user: null, session: null } as {
    user: { id: string; email: string; user_metadata?: Record<string, unknown> } | null;
    session: { access_token: string; refresh_token: string } | null;
  }
}));

const helpers = vi.hoisted(() => ({
  createPasswordClient: vi.fn(),
  ensureProfile: vi.fn(),
  getPublicMember: vi.fn(),
  makeAuthResponse: vi.fn()
}));

vi.mock("@/lib/auth/member", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/member")>();
  return {
    ...actual,
    createSupabasePasswordClient: helpers.createPasswordClient,
    ensureProfileForAuthUser: helpers.ensureProfile,
    getPublicMember: helpers.getPublicMember,
    authResponse: helpers.makeAuthResponse
  };
});

import { POST } from "@/app/api/auth/login/route";

function request(body: string) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

describe("QA-FS login route boundaries", () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.nextError = null;
    state.nextData = {
      user: { id: "auth-user-a", email: "member@example.test", user_metadata: { name: "QA Member", phone: 42 } },
      session: { access_token: "synthetic-access", refresh_token: "synthetic-refresh" }
    };
    helpers.createPasswordClient.mockReset().mockImplementation(() => ({
      auth: {
        signInWithPassword: async (input: { email: string; password: string }) => {
          state.calls.push(input);
          return { data: state.nextData, error: state.nextError };
        }
      }
    }));
    helpers.ensureProfile.mockReset().mockResolvedValue({ id: "profile-a", email: "member@example.test" });
    helpers.getPublicMember.mockReset().mockResolvedValue({ id: "profile-a", role: "member", status: "pending" });
    helpers.makeAuthResponse.mockReset().mockImplementation((session, member) => ({
      ok: true,
      token: session.access_token,
      refresh_token: session.refresh_token,
      member
    }));
  });

  it("normalizes the email, preserves the password, and creates a profile only after Auth succeeds", async () => {
    const response = await POST(request(JSON.stringify({ email: "  Member@Example.Test ", password: " correct horse " })));
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([{ email: "member@example.test", password: " correct horse " }]);
    expect(helpers.ensureProfile).toHaveBeenCalledWith({
      authUserId: "auth-user-a",
      email: "member@example.test",
      name: "QA Member",
      phone: ""
    });
    expect(helpers.getPublicMember).toHaveBeenCalledWith("profile-a");
    expect(await response.json()).toMatchObject({ ok: true, token: "synthetic-access", member: { id: "profile-a" } });
  });

  it("records that a 128 KiB password currently reaches Auth because no route maximum is defined", async () => {
    const password = "x".repeat(128 * 1024);
    const response = await POST(request(JSON.stringify({ email: "member@example.test", password })));
    expect(response.status).toBe(200);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]?.password).toBe(password);
  });

  it("rejects blank, malformed, SQLi-shaped, and non-string credentials before Auth", async () => {
    const cases = [
      ["empty object", "{}"],
      ["malformed JSON", "{"],
      ["SQLi-shaped email", JSON.stringify({ email: "' OR 1=1 --", password: "anything" })],
      ["non-string email", JSON.stringify({ email: 7, password: "anything" })],
      ["empty password", JSON.stringify({ email: "member@example.test", password: "" })],
      ["non-string password", JSON.stringify({ email: "member@example.test", password: ["secret"] })]
    ];
    for (const [label, body] of cases) {
      const response = await POST(request(body));
      expect(response.status, label).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
    expect(helpers.ensureProfile).not.toHaveBeenCalled();
  });

  it("returns the same 4xx error for known and unknown addresses without creating a profile", async () => {
    state.nextError = Object.assign(new Error("Invalid login credentials"), { status: 400 });
    const known = await POST(request(JSON.stringify({ email: "member@example.test", password: "bad-password" })));
    const unknown = await POST(request(JSON.stringify({ email: "unknown@example.test", password: "bad-password" })));
    expect([known.status, unknown.status]).toEqual([400, 400]);
    expect(await known.json()).toEqual(await unknown.json());
    expect(state.calls).toHaveLength(2);
    expect(helpers.ensureProfile).not.toHaveBeenCalled();
  });

  it.fails("uses a clear Chinese generic message for invalid credentials", async () => {
    state.nextError = Object.assign(new Error("Invalid login credentials"), { status: 400 });
    const response = await POST(request(JSON.stringify({ email: "member@example.test", password: "bad-password" })));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).not.toBe("Invalid login credentials");
    expect(body.error).toMatch(/帳號|密碼|登入/);
  });

  it("does not create a profile when Auth returns an incomplete session", async () => {
    state.nextData = { user: { id: "auth-user-a", email: "member@example.test" }, session: null };
    const response = await POST(request(JSON.stringify({ email: "member@example.test", password: "correct-password" })));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "帳號或密碼錯誤" });
    expect(helpers.ensureProfile).not.toHaveBeenCalled();
  });
});

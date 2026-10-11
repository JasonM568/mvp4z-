import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ email: string; redirectTo: string }>,
  nextError: null as { message: string } | null
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      resetPasswordForEmail: async (email: string, options: { redirectTo: string }) => {
        state.calls.push({ email, redirectTo: options.redirectTo });
        return { error: state.nextError };
      }
    }
  })
}));

import { POST } from "@/app/api/auth/forgot-password/route";

function request(body: string) {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

describe("QA-FS forgot-password route boundaries", () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.nextError = null;
    process.env.NEXT_PUBLIC_SITE_URL = "https://qa.example.test/";
  });

  it("trims and lowercases valid email and uses the configured recovery redirect", async () => {
    const response = await POST(request(JSON.stringify({ email: "  QA.User@Example.Test " })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.calls).toEqual([{ email: "qa.user@example.test", redirectTo: "https://qa.example.test/reset-password" }]);
  });

  it("returns the same response when Auth succeeds or returns a provider rate-limit error", async () => {
    const known = await POST(request(JSON.stringify({ email: "member@example.test" })));
    state.nextError = { message: "rate limit exceeded" };
    const unknown = await POST(request(JSON.stringify({ email: "not-registered@example.test" })));
    expect([known.status, unknown.status]).toEqual([200, 200]);
    expect(await known.json()).toEqual(await unknown.json());
    expect(state.calls).toHaveLength(2);
  });

  it("rejects empty, malformed, SQLi-shaped, and non-string email inputs before Auth", async () => {
    const cases = [
      ["empty body", "{}"],
      ["malformed JSON", "{"],
      ["SQLi-shaped email", JSON.stringify({ email: "' OR 1=1 --" })],
      ["non-string email", JSON.stringify({ email: 42 })]
    ];
    for (const [label, body] of cases) {
      const response = await POST(request(body));
      expect(response.status, label).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
  });

  it.fails("rejects a 260-octet local-part before Auth", async () => {
    const response = await POST(request(JSON.stringify({ email: `${"a".repeat(260)}@example.test` })));
    expect(response.status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it("accepts the 64-octet ASCII local-part SMTP boundary", async () => {
    const email = `${"a".repeat(64)}@example.test`;
    const response = await POST(request(JSON.stringify({ email })));
    expect(response.status).toBe(200);
    expect(state.calls[0]?.email).toBe(email);
  });

  it.fails("rejects a 65-octet ASCII local-part before calling Auth", async () => {
    const response = await POST(request(JSON.stringify({ email: `${"a".repeat(65)}@example.test` })));
    expect(response.status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it("observes that an overlong address is currently forwarded to Auth", async () => {
    const email = `${"a".repeat(260)}@example.test`;
    const response = await POST(request(JSON.stringify({ email })));
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([{ email, redirectTo: "https://qa.example.test/reset-password" }]);
  });

  it("dispatches repeated submissions to Auth without creating local state", async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () =>
      POST(request(JSON.stringify({ email: "member@example.test" })) )));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(state.calls).toHaveLength(10);
  });

  it.fails("does not write the submitted email to server logs on provider error", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.nextError = { message: "provider unavailable" };
    try {
      await POST(request(JSON.stringify({ email: "synthetic-privacy@example.test" })));
      expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-privacy@example.test");
    } finally {
      log.mockRestore();
    }
  });
});

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

  it("accepts the 64-octet ASCII local-part SMTP boundary", async () => {
    const email = `${"a".repeat(64)}@example.test`;
    const response = await POST(request(JSON.stringify({ email })));
    expect(response.status).toBe(200);
    expect(state.calls[0]?.email).toBe(email);
  });

  it("rejects 65- and 260-octet local-parts before calling Auth", async () => {
    for (const length of [65, 260]) {
      const response = await POST(request(JSON.stringify({ email: `${"a".repeat(length)}@example.test` })));
      expect(response.status, `${length}-octet local-part`).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("dispatches repeated submissions to Auth without creating local state", async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () =>
      POST(request(JSON.stringify({ email: "member@example.test" })) )));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(state.calls).toHaveLength(10);
  });

  it("does not write submitted email or provider-controlled secrets to logs", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.nextError = {
      message: "provider failure synthetic-privacy@example.test token=synthetic-token action_link=https://qa.example.test/recovery?token=secret"
    };
    try {
      await POST(request(JSON.stringify({ email: "synthetic-privacy@example.test" })));
      const output = JSON.stringify(log.mock.calls);
      expect(output).not.toContain("synthetic-privacy@example.test");
      expect(output).not.toContain("synthetic-token");
      expect(output).not.toContain("https://qa.example.test/recovery");
      expect(output).not.toContain("provider failure");
    } finally {
      log.mockRestore();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route and Resend protocol test. No network request or real API key is used.
const fixture = vi.hoisted(() => ({ adminStatus: 200 }));
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => {
    if (fixture.adminStatus !== 200) {
      throw Object.assign(new Error("Unauthorized"), { status: fixture.adminStatus });
    }
    return { mode: "role", profile: { id: "qa-admin" } };
  }
}));

import { GET, POST } from "./route";

const originalKey = process.env.RESEND_API_KEY;
const originalFetch = globalThis.fetch;
const endpoint = "http://localhost/api/admin/email-domain";

function request(method: "GET" | "POST", body?: unknown) {
  return new NextRequest(endpoint, {
    method,
    ...(method === "POST" ? {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    } : {})
  });
}

function stubResend(...replies: Array<{ status?: number; body: unknown }>) {
  const pending = [...replies];
  const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const reply = pending.shift();
    if (!reply) throw new Error("unexpected Resend call");
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  globalThis.fetch = fetch as typeof globalThis.fetch;
  return fetch;
}

describe("admin email domain route QA without Resend network", () => {
  beforeEach(() => {
    fixture.adminStatus = 200;
    process.env.RESEND_API_KEY = "qa-dummy-key-never-sent";
    globalThis.fetch = vi.fn(() => { throw new Error("unexpected network call"); }) as typeof fetch;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  });

  it.each([401, 403])("rejects non-admin status %i before Resend", async (status) => {
    fixture.adminStatus = status;
    expect((await GET(request("GET"))).status).toBe(status);
    expect((await POST(request("POST", { action: "create" }))).status).toBe(status);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing API key before network access", async () => {
    delete process.env.RESEND_API_KEY;
    const response = await GET(request("GET"));
    expect(response.status).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns an empty domain state without inventing DNS records", async () => {
    const fetch = stubResend({ body: { data: [{ id: "other", name: "other.test" }] } });
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ domain: "xunfeng.tw", exists: false, status: null, records: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reads the matching domain detail and DNS records", async () => {
    const fetch = stubResend(
      { body: { data: [{ id: "domain-1", name: "xunfeng.tw", status: "pending" }] } },
      { body: { status: "verified", region: "us-east-1", records: [{ type: "TXT", status: "verified" }] } }
    );
    const response = await GET(request("GET"));
    expect(await response.json()).toMatchObject({ exists: true, id: "domain-1", status: "verified",
      region: "us-east-1", records: [{ type: "TXT", status: "verified" }] });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.resend.com/domains", "https://api.resend.com/domains/domain-1"
    ]);
  });

  it("creates only when absent, with the configured domain and region", async () => {
    const fetch = stubResend(
      { body: { data: [] } },
      { body: { id: "domain-2", status: "pending", records: [] } }
    );
    const response = await POST(request("POST", { action: "create" }));
    expect(await response.json()).toMatchObject({ created: true, id: "domain-2", status: "pending" });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe("https://api.resend.com/domains");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "xunfeng.tw", region: "us-east-1" });
  });

  it("does not create a second domain when one already exists", async () => {
    const fetch = stubResend(
      { body: { data: [{ id: "domain-1", name: "xunfeng.tw" }] } },
      { body: { status: "verified", records: [] } }
    );
    const response = await POST(request("POST", { action: "create" }));
    expect(await response.json()).toMatchObject({ created: false, id: "domain-1", status: "verified" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([, init]) => !init || init.method !== "POST")).toBe(true);
  });

  it("rejects verification of a missing domain", async () => {
    const fetch = stubResend({ body: { data: [] } });
    const response = await POST(request("POST", { action: "verify" }));
    expect(response.status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requests verification then reports the actual pending state", async () => {
    const fetch = stubResend(
      { body: { data: [{ id: "domain-1", name: "xunfeng.tw" }] } },
      { body: { id: "domain-1" } },
      { body: { status: "pending", records: [{ type: "TXT", status: "pending" }] } }
    );
    const response = await POST(request("POST", { action: "verify" }));
    expect(await response.json()).toMatchObject({ requested: true, status: "pending",
      records: [{ type: "TXT", status: "pending" }] });
    expect(fetch.mock.calls[1][0]).toBe("https://api.resend.com/domains/domain-1/verify");
    expect(fetch.mock.calls[1][1]?.method).toBe("POST");
  });

  it("rejects invalid and oversized action values without calling Resend", async () => {
    for (const body of [{ action: "delete" }, { action: "verify".repeat(500) }, {}]) {
      const response = await POST(request("POST", body));
      expect(response.status).toBe(400);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("maps an upstream error to 502 without exposing the API key", async () => {
    const fetch = stubResend({ status: 403, body: { message: "domain is not verified" } });
    const response = await GET(request("GET"));
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain("domain is not verified");
    expect(body).not.toContain("qa-dummy-key-never-sent");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

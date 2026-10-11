import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  balance: 5,
  entitlement: { id: "qa-entitlement", credits_remaining: 5 } as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
  transactions: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  clientCalls: 0,
  deniedStatus: 0,
  barrierReads: 0,
  barrierTarget: 0,
  barrierRelease: null as (() => void) | null,
  barrierPromise: null as Promise<void> | null
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => {
    if (state.deniedStatus) throw Object.assign(new Error("QA admin denied"), { status: state.deniedStatus });
    return { profile: { id: "qa-admin" } };
  },
  writeAdminAudit: async (input: Record<string, unknown>) => { state.audits.push(input); }
}));
vi.mock("@/lib/auth/member", () => ({
  readJson: async (request: NextRequest, schema: { parse: (value: unknown) => unknown }) => schema.parse(await request.json()),
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number; name?: string }) => error.status || (error.name === "ZodError" ? 400 : 500),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    state.clientCalls++;
    return {
      from(table: string) {
        let updateValue: Record<string, unknown> | null = null;
        let insertValue: Record<string, unknown> | null = null;
        const query: any = {
          select: () => query,
          eq: () => query,
          gte: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => {
            if (table === "member_entitlements") {
              if (state.barrierTarget) {
                state.barrierReads++;
                if (state.barrierReads >= state.barrierTarget) state.barrierRelease?.();
                await state.barrierPromise;
              }
              return { data: state.entitlement ? { ...state.entitlement, credits_remaining: 5 } : null, error: null };
            }
            return { data: { id: "qa-plan", code: "pro" }, error: null };
          },
          update: (value: Record<string, unknown>) => { updateValue = value; return query; },
          insert: (value: Record<string, unknown>) => { insertValue = value; return query; },
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
            if (table === "member_entitlements" && updateValue) {
              state.updates.push(updateValue);
              state.balance = Number(updateValue.credits_remaining);
            }
            if (table === "credit_transactions" && insertValue) state.transactions.push(insertValue);
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
        };
        return query;
      }
    };
  }
}));

import { POST } from "@/app/api/admin/credits/route";

const userId = "00000000-0000-4000-8000-000000000001";
function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/credits", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer qa-admin" },
    body: JSON.stringify(body)
  });
}
function reset() {
  state.balance = 5;
  state.entitlement = { id: "qa-entitlement", credits_remaining: 5 };
  state.updates.length = 0;
  state.transactions.length = 0;
  state.audits.length = 0;
  state.clientCalls = 0;
  state.deniedStatus = 0;
  state.barrierReads = 0;
  state.barrierTarget = 0;
  state.barrierRelease = null;
  state.barrierPromise = null;
}

describe("QA-FS-C2 admin credit adjustment boundaries (route + deterministic DB stub)", () => {
  beforeEach(() => { vi.clearAllMocks(); reset(); });

  it.each([
    ["malformed UUID", { user_id: "not-a-uuid", amount: 1 }],
    ["SQLi-shaped UUID", { user_id: "00000000-0000-4000-8000-000000000001' OR '1'='1", amount: 1 }],
    ["zero amount", { user_id: userId, amount: 0 }],
    ["fractional amount", { user_id: userId, amount: 1.5 }],
    ["non-numeric amount", { user_id: userId, amount: "abc" }],
    ["days over maximum", { user_id: userId, amount: 1, days: 3651 }],
    ["note over maximum", { user_id: userId, amount: 1, note: "x".repeat(501) }]
  ])("rejects %s before opening the admin DB client", async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(state.clientCalls).toBe(0);
    expect(state.updates).toHaveLength(0);
    expect(state.transactions).toHaveLength(0);
  });

  it("permits the 500-character note boundary and records a normal positive adjustment", async () => {
    const response = await POST(request({ user_id: userId, amount: 4, note: "x".repeat(500) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, credits_remaining: 9 });
    expect(state.updates).toEqual([{ credits_remaining: 9 }]);
    expect(state.transactions).toEqual([expect.objectContaining({ amount: 4, balance_after: 9, type: "adjustment" })]);
    expect(state.audits).toHaveLength(1);
  });

  it("does not open the admin DB client for a denied administrator", async () => {
    state.deniedStatus = 403;
    const response = await POST(request({ user_id: userId, amount: 1 }));
    expect(response.status).toBe(403);
    expect(state.clientCalls).toBe(0);
  });

  it.fails("rejects an amount above PostgreSQL integer range before opening the DB client", async () => {
    const response = await POST(request({ user_id: userId, amount: 2_147_483_648 }));
    expect(state.clientCalls).toBe(0);
    expect(response.status).toBe(400);
  });

  it.fails("rejects an amount below PostgreSQL integer range before opening the DB client", async () => {
    const response = await POST(request({ user_id: userId, amount: -2_147_483_649 }));
    expect(state.clientCalls).toBe(0);
    expect(response.status).toBe(400);
  });

  it("rejects a debit without an active entitlement and leaves all ledgers untouched", async () => {
    state.entitlement = null;
    const response = await POST(request({ user_id: userId, amount: -1 }));
    expect(response.status).toBe(404);
    expect(state.updates).toHaveLength(0);
    expect(state.transactions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("reproduces stale balance reads for two concurrent adjustments", async () => {
    state.barrierTarget = 2;
    state.barrierPromise = new Promise<void>((resolve) => { state.barrierRelease = resolve; });
    const responses = await Promise.all([
      POST(request({ user_id: userId, amount: 1 })),
      POST(request({ user_id: userId, amount: 2 }))
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(state.barrierReads).toBe(2);
    expect(state.transactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0)).toBe(3);
    expect(state.balance).toBe(7);
    expect(state.audits).toHaveLength(2);
  });
});

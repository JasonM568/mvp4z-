import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { adminClientFactory } = vi.hoisted(() => ({ adminClientFactory: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => adminClientFactory()
}));

import { GET } from "./route";

type Entitlement = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  credits_remaining: number;
  expires_at: string;
};

function wireDatabase(initial: Entitlement[]) {
  const entitlements = initial.map((row) => ({ ...row }));
  const writes: Array<{ table: string; value: unknown }> = [];
  const audits: unknown[] = [];

  adminClientFactory.mockReturnValue({
    from(table: string) {
      const state: {
        filters: Array<["eq" | "lt" | "in", string, unknown]>;
        order?: [string, boolean];
        limit?: number;
        update?: Record<string, unknown>;
      } = { filters: [] };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => { state.filters.push(["eq", column, value]); return builder; },
        lt: (column: string, value: unknown) => { state.filters.push(["lt", column, value]); return builder; },
        in: (column: string, value: unknown) => { state.filters.push(["in", column, value]); return builder; },
        order: (column: string, options: { ascending: boolean }) => { state.order = [column, options.ascending]; return builder; },
        limit: (value: number) => { state.limit = value; return builder; },
        update: (value: Record<string, unknown>) => { state.update = value; writes.push({ table, value }); return builder; },
        insert: (value: unknown) => { audits.push(value); return Promise.resolve({ error: null }); },
        then: (resolve: (value: unknown) => unknown) => {
          let data: unknown;
          if (table === "member_entitlements" && state.update) {
            const ids = state.filters.find(([op, column]) => op === "in" && column === "id")?.[2] as string[];
            const updated = entitlements.filter((row) => ids.includes(row.id) && matches(row, state.filters));
            for (const row of updated) Object.assign(row, state.update);
            data = updated.map(({ id }) => ({ id }));
          } else if (table === "member_entitlements") {
            data = entitlements.filter((row) => matches(row, state.filters))
              .sort((a, b) => state.order ? (state.order[1] ? 1 : -1) * String(a[state.order[0] as keyof Entitlement]).localeCompare(String(b[state.order[0] as keyof Entitlement])) : 0)
              .slice(0, state.limit);
          } else {
            data = null;
          }
          return Promise.resolve(resolve({ data, error: null }));
        }
      };
      return builder;
    }
  });

  return { entitlements, writes, audits };
}

function matches(row: Entitlement, filters: Array<["eq" | "lt" | "in", string, unknown]>) {
  return filters.every(([op, column, value]) => {
    const current = row[column as keyof Entitlement];
    if (op === "eq") return current === value;
    if (op === "lt") return String(current) < String(value);
    return (value as string[]).includes(String(current));
  });
}

function request(dryRun: boolean, authorized = true) {
  const url = `http://localhost/api/cron/expire-entitlements${dryRun ? "?dry_run=1" : ""}`;
  return new NextRequest(url, { headers: authorized ? { authorization: "Bearer qa-cron-secret" } : {} });
}

beforeEach(() => {
  process.env.CRON_SECRET = "qa-cron-secret";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.resetAllMocks();
});

describe("GET /api/cron/expire-entitlements", () => {
  it("dry-run reports expired active rows without writing", async () => {
    const db = wireDatabase([
      { id: "stale", user_id: "member-a", plan_id: "plan", status: "active", credits_remaining: 7, expires_at: "2020-01-01T00:00:00.000Z" },
      { id: "future", user_id: "member-a", plan_id: "plan", status: "active", credits_remaining: 9, expires_at: "2099-01-01T00:00:00.000Z" }
    ]);

    const response = await GET(request(true));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ dry_run: true, candidate_count: 1, expired_count: 0 });
    expect(db.writes).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
    expect(db.entitlements.map(({ status, credits_remaining }) => [status, credits_remaining])).toEqual([
      ["active", 7], ["active", 9]
    ]);
  });

  it("expires only stale rows, preserves balances, and is idempotent", async () => {
    const db = wireDatabase([
      { id: "stale", user_id: "member-a", plan_id: "plan", status: "active", credits_remaining: 7, expires_at: "2020-01-01T00:00:00.000Z" },
      { id: "future", user_id: "member-a", plan_id: "plan", status: "active", credits_remaining: 9, expires_at: "2099-01-01T00:00:00.000Z" },
      { id: "already-expired", user_id: "member-a", plan_id: "plan", status: "expired", credits_remaining: 3, expires_at: "2019-01-01T00:00:00.000Z" }
    ]);

    const response = await GET(request(false));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ dry_run: false, candidate_count: 1, expired_count: 1 });
    expect(db.writes).toEqual([{ table: "member_entitlements", value: { status: "expired" } }]);
    expect(db.audits).toHaveLength(1);
    expect(db.entitlements.map(({ status, credits_remaining }) => [status, credits_remaining])).toEqual([
      ["expired", 7], ["active", 9], ["expired", 3]
    ]);

    const rerun = await GET(request(false));
    expect(rerun.status).toBe(200);
    expect(await rerun.json()).toMatchObject({ candidate_count: 0, expired_count: 0 });
    expect(db.writes).toHaveLength(1);
  });

  it("rejects missing cron authorization before querying the database", async () => {
    adminClientFactory.mockClear();
    const response = await GET(request(false, false));
    expect(response.status).toBe(401);
    expect(adminClientFactory).not.toHaveBeenCalled();
  });
});

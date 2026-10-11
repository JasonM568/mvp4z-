import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  entitlementUpdate: null as Record<string, unknown> | null,
  transactionInsert: null as Record<string, unknown> | null
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => ({ profile: { id: "qa-admin" } }),
  writeAdminAudit: async () => undefined
}));

vi.mock("@/lib/auth/member", () => ({
  readJson: async (request: NextRequest) => request.json(),
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: { id: "qa-entitlement", credits_remaining: 5 }, error: null }),
        update: (value: Record<string, unknown>) => {
          if (table === "member_entitlements") mocks.entitlementUpdate = value;
          return query;
        },
        insert: (value: Record<string, unknown>) => {
          if (table === "credit_transactions") mocks.transactionInsert = value;
          return query;
        },
        then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null })
      };
      return query;
    }
  })
}));

import { POST } from "./route";

describe("管理員手動補扣點 QA", () => {
  // 現況：5 點扣 10 點時餘額被截成 0，但交易明細仍記 -10，帳本差 5 點。
  // 修復後改成一般 it，應在 DB transaction 中記錄真實 delta 並原子更新。
  it.fails("交易明細 amount 等於實際餘額變化", async () => {
    mocks.entitlementUpdate = null;
    mocks.transactionInsert = null;
    const response = await POST(new NextRequest("http://localhost/api/admin/credits", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer qa-admin" },
      body: JSON.stringify({ user_id: "00000000-0000-4000-8000-000000000001", amount: -10, note: "QA" })
    }));
    expect(response.status).toBe(200);
    expect(mocks.entitlementUpdate).toMatchObject({ credits_remaining: 0 });
    expect(mocks.transactionInsert).toMatchObject({ amount: -5, balance_after: 0 });
  });
});

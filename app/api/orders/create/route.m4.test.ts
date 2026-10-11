import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planEq: vi.fn(),
  orderInsert: vi.fn(),
  referral: vi.fn()
}));

vi.mock("@/lib/auth/member", () => ({
  requireBearerProfile: async () => ({ profile: { id: "qa-profile" } }),
  readJson: async (request: NextRequest, schema: { parse: (value: unknown) => unknown }) =>
    schema.parse(await request.json()),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status }),
  errorMessage: (error: unknown) => error instanceof ZodError ? error.issues[0]?.message : (error as Error).message,
  errorStatus: (error: unknown) => error instanceof ZodError ? 400 : (error as { status?: number }).status || 500
}));

vi.mock("@/lib/payments/ecpay", () => ({
  createCheckoutParams: vi.fn(() => ({ MerchantTradeNo: "qa-trade" })),
  createMerchantTradeNo: vi.fn(() => "qa-trade"),
  ecpayActionUrl: vi.fn(() => "https://payment.invalid")
}));

vi.mock("@/lib/referral/attribution", () => ({
  referralFieldsForOrder: (...args: unknown[]) => mocks.referral(...args)
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (...args: unknown[]) => mocks.from(...args)
  })
}));

import { POST } from "./route";

function request(planCode: string) {
  return new NextRequest("http://localhost/api/orders/create", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer qa" },
    body: JSON.stringify({ plan_code: planCode })
  });
}

describe("POST /api/orders/create plan_code length validation", () => {
  afterEach(() => vi.resetAllMocks());

  it("accepts a 64-character code and proceeds through the normal order path", async () => {
    const planCode = "p".repeat(64);
    const planQuery = {
      select: vi.fn().mockReturnThis(),
      eq: (...args: unknown[]) => { mocks.planEq(...args); return planQuery; },
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: "qa-plan", code: planCode, name: "QA plan", price: 100, currency: "TWD", credits: 10, duration_days: 30, is_active: true
      }, error: null })
    };
    const orderQuery = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {
        id: "qa-order", order_no: "qa-trade", amount: 100, currency: "TWD", status: "pending", created_at: "2026-10-11T00:00:00Z"
      }, error: null })
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "plans") return planQuery;
      if (table === "orders") return { insert: (...args: unknown[]) => { mocks.orderInsert(...args); return orderQuery; } };
      throw new Error(`unexpected table ${table}`);
    });
    mocks.referral.mockResolvedValue({});

    const response = await POST(request(planCode));

    expect(response.status).toBe(200);
    expect(mocks.planEq).toHaveBeenCalledWith("code", planCode);
    expect(mocks.orderInsert).toHaveBeenCalledTimes(1);
  });

  it.each([65, 10_000])("rejects a %i-character code with 400 before any database access", async (length) => {
    const response = await POST(request("x".repeat(length)));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.orderInsert).not.toHaveBeenCalled();
  });
});

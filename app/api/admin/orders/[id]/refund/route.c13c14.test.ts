import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireNamedAdmin: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireNamedAdmin: (...args: unknown[]) => mocks.requireNamedAdmin(...args)
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

import { POST } from "./route";

const key = "ba4459f8-63d5-4a63-8e20-2a652fdfeacf";
const payload = (extra: Record<string, unknown> = {}) => ({
  amount: 99,
  idempotency_key: key,
  reason: "QA local refund",
  provider_reference: "QA-REF-1",
  confirmed_in_ecpay: true,
  ...extra
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/orders/order-1/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("manual refund idempotency and atomic audit API", () => {
  beforeEach(() => mocks.requireNamedAdmin.mockResolvedValue({
    profile: { id: "named-admin-1", email: "admin@example.test" }
  }));
  afterEach(() => vi.resetAllMocks());

  it("requires an idempotency key before calling the database", async () => {
    const response = await POST(request(payload({ idempotency_key: undefined })), {
      params: Promise.resolve({ id: "order-1" })
    });

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("runs the financial mutation and audit through one RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [{
      refund_id: "refund-1", order_status: "partially_refunded",
      credits_expected: 9, credits_reclaimed: 9, credits_shortfall: 0,
      idempotent_replay: false
    }], error: null });

    const response = await POST(request(payload()), { params: Promise.resolve({ id: "order-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, refund_id: "refund-1", idempotent_replay: false });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("commit_manual_refund", expect.objectContaining({
      p_order_id: "order-1", p_admin_profile_id: "named-admin-1",
      p_idempotency_key: key, p_amount: 99
    }));
  });

  it("maps reused keys with different payloads to 409", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "REFUND_IDEMPOTENCY_CONFLICT", code: "P0001" }
    });

    const response = await POST(request(payload({ amount: 100 })), { params: Promise.resolve({ id: "order-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "REFUND_IDEMPOTENCY_CONFLICT" });
  });

  it("maps over-refund to 400 and a fully refunded order to 409", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "REFUND_AMOUNT_EXCEEDS_REMAINING" } })
      .mockResolvedValueOnce({ data: null, error: { message: "REFUND_ALREADY_FULLY_REFUNDED" } });

    const tooMuch = await POST(request(payload({ amount: 200 })), { params: Promise.resolve({ id: "order-1" }) });
    const afterFull = await POST(request(payload({ amount: 1 })), { params: Promise.resolve({ id: "order-1" }) });

    expect(tooMuch.status).toBe(400);
    expect(afterFull.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  params: {} as Record<string, string>,
  order: {} as Record<string, unknown>,
  update: vi.fn(),
  emails: vi.fn(),
  invoice: vi.fn()
}));

vi.mock("@/lib/payments/ecpay", () => ({
  formDataToParams: () => mocks.params,
  verifyCheckMacValue: () => true
}));
vi.mock("@/lib/payments/orders", () => ({
  normalizeAmount: (amount: string) => Number(amount),
  normalizeOrderWithPlan: (order: unknown) => order
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const query: Record<string, any> = {};
      query.select = vi.fn(() => query);
      query.update = vi.fn(() => {
        mocks.update(table);
        return query;
      });
      query.eq = vi.fn(() => query);
      query.in = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => ({
        data: table === "orders" ? mocks.order : table === "profiles" ? { name: "QA", email: null, phone: null } : null,
        error: null
      }));
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve);
      return query;
    }
  })
}));
vi.mock("@/lib/notifications/admin-alerts", () => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/notifications/order-emails", () => ({ sendOrderPaidEmails: mocks.emails }));
vi.mock("@/lib/payments/issue-invoice-from-order", () => ({ issueInvoiceFromOrder: mocks.invoice }));

import { POST } from "./route";

function request() {
  return new NextRequest("http://localhost/api/payments/ecpay/notify", {
    method: "POST",
    body: new URLSearchParams(mocks.params)
  });
}

function setParams(input: Partial<Record<string, string>>) {
  mocks.params = {
    MerchantTradeNo: "QA-C4-ORDER",
    TradeNo: "QA-C4-TRADE",
    RtnCode: "1",
    PaymentType: "Credit_CreditCard",
    TradeAmt: "980",
    ...input
  };
}

function setOrder(status = "pending") {
  mocks.order = {
    id: "qa-c4-order-id",
    order_no: "QA-C4-ORDER",
    user_id: "qa-member-id",
    plan_id: "qa-plan-id",
    order_type: "membership",
    amount: 980,
    currency: "TWD",
    status,
    provider: "ecpay",
    invoice_request: null,
    legacy_no_invoice: true,
    plans: { id: "qa-plan-id", name: "Local QA", credits: 10, duration_days: 30, is_addon: false }
  };
}

describe("ECPay notify C4 accounting regression", () => {
  beforeEach(() => {
    setOrder();
    setParams({});
    mocks.update.mockReset();
    mocks.emails.mockReset().mockResolvedValue({ ok: true });
    mocks.invoice.mockReset().mockResolvedValue({ ok: false, skipped: true, invoice: {} });
    mocks.rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "record_ecpay_payment_notification") {
        return { data: [{ amount_mismatch: false, payment_status: "paid" }], error: null };
      }
      return {
        data: [{ provisioned: true, entitlement_id: "qa-entitlement", carried_credits: 0, total_credits: 10, expires_at: "2030-01-01T00:00:00Z" }],
        error: null
      };
    });
  });

  it("records a wrong-amount paid callback without committing payment or entitlement", async () => {
    setParams({ TradeAmt: "979" });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ amount_mismatch: true, payment_status: null }],
      error: null
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("record_ecpay_payment_notification", expect.objectContaining({
      p_status: "paid",
      p_amount: 979,
      p_amount_matches: false,
      p_check_mac_valid: true
    }));
    expect(mocks.emails).not.toHaveBeenCalled();
  });

  it("rejects a duplicate provider trade number after the event is recorded", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ amount_mismatch: false, payment_status: "trade_conflict" }],
      error: null
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.text()).toBe("0|Provider trade number conflict");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("record_ecpay_payment_notification", expect.objectContaining({
      p_status: "paid",
      p_check_mac_valid: true
    }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.emails).not.toHaveBeenCalled();
  });

  it.each([
    ["failed", { RtnCode: "0", TradeAmt: "980" }],
    ["allocated", { RtnCode: "2", PaymentType: "ATM_TAISHIN", TradeAmt: "980" }]
  ])("leaves a paid order alone when a later %s callback arrives", async (_label, params) => {
    setOrder("paid");
    setParams(params);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("record_ecpay_payment_notification", expect.objectContaining({
      p_status: _label,
      p_amount_matches: true
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("commit_paid_entitlement", expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("lets a correct paid retry recover provisioning and does not resend the email", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ amount_mismatch: false, payment_status: "paid" }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "injected local provisioning failure" } })
      .mockResolvedValueOnce({ data: [{ amount_mismatch: false, payment_status: "paid" }], error: null })
      .mockResolvedValueOnce({
        data: [{ provisioned: true, entitlement_id: "qa-entitlement", carried_credits: 0, total_credits: 10, expires_at: "2030-01-01T00:00:00Z" }],
        error: null
      })
      .mockResolvedValueOnce({ data: [{ amount_mismatch: false, payment_status: "paid" }], error: null })
      .mockResolvedValueOnce({
        data: [{ provisioned: false, entitlement_id: "qa-entitlement", carried_credits: 0, total_credits: 10, expires_at: "2030-01-01T00:00:00Z" }],
        error: null
      });

    const first = await POST(request());
    expect(first.status).toBe(500);

    setOrder("paid");
    const retry = await POST(request());
    const duplicate = await POST(request());

    expect(retry.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "commit_paid_entitlement")).toHaveLength(3);
    expect(mocks.emails).toHaveBeenCalledTimes(1);
  });
});

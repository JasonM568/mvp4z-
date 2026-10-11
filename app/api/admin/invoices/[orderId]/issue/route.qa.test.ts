import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ issue: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => ({ profile: { id: "qa-admin" } }),
  writeAdminAudit: mocks.audit
}));
vi.mock("@/lib/auth/member", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/member")>();
  return {
    readJson: actual.readJson,
    errorMessage: actual.errorMessage,
    errorStatus: actual.errorStatus,
    statusError: actual.statusError
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: {
          id: "qa-paid-order", order_no: "QA-PAID", user_id: "qa-member", amount: 980,
          currency: "TWD", status: "paid", legacy_no_invoice: false,
          invoice_request: { buyer_type: "personal", buyer_name: "Original Buyer" },
          plans: { code: "vip", name: "VIP" }
        }, error: null })
      };
      return query;
    }
  })
}));
vi.mock("@/lib/payments/issue-invoice-from-order", () => ({ issueInvoiceFromOrder: mocks.issue }));

import { POST } from "./route";

function request(body: string) {
  return new NextRequest("http://localhost/api/admin/invoices/qa-paid-order/issue", {
    method: "POST", headers: { "Content-Type": "application/json" }, body
  });
}

describe("manual invoice issue input validation QA", () => {
  beforeEach(() => {
    mocks.issue.mockReset().mockResolvedValue({ ok: true, reused: false, invoice: { id: "qa-invoice" } });
    mocks.audit.mockReset().mockResolvedValue(undefined);
  });

  it("accepts an intentionally empty body by using the stored invoice request", async () => {
    const response = await POST(request("{}"), { params: Promise.resolve({ orderId: "qa-paid-order" }) });
    expect(response.status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledOnce();
    expect(mocks.issue.mock.calls[0][2]).toBeNull();
  });

  it("rejects an invalid company buyer instead of issuing from stored data", async () => {
    const response = await POST(request(JSON.stringify({ buyer: {
      buyer_type: "company", buyer_name: "QA", buyer_id: "1234567"
    } })), { params: Promise.resolve({ orderId: "qa-paid-order" }) });
    expect(response.status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON instead of issuing from stored data", async () => {
    const response = await POST(request("{broken-json"),
      { params: Promise.resolve({ orderId: "qa-paid-order" }) });
    expect(response.status).toBe(400);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});

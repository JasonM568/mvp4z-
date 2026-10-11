import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ issue: vi.fn(), audit: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => ({ profile: { id: "qa-admin" } }),
  writeAdminAudit: mocks.audit
}));
vi.mock("@/lib/auth/member", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/member")>();
  return {
    ...actual,
    statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/payments/issue-invoice-from-order", () => ({ issueInvoiceFromOrder: mocks.issue }));

import { POST } from "./route";

function request(body: string) {
  return new NextRequest("http://localhost/api/admin/invoices/qa-paid-order/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
}

describe("manual invoice issue strict request parsing", () => {
  beforeEach(() => {
    mocks.issue.mockReset().mockResolvedValue({ ok: true, reused: false, invoice: { id: "qa-invoice" } });
    mocks.audit.mockReset().mockResolvedValue(undefined);
    mocks.from.mockReset();
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "qa-paid-order", order_no: "QA-PAID", user_id: "qa-member", amount: 980,
          currency: "TWD", status: "paid", legacy_no_invoice: false,
          invoice_request: { buyer_type: "personal", buyer_name: "Original Buyer" },
          plans: { code: "vip", name: "VIP" }
        },
        error: null
      }))
    };
    mocks.from.mockReturnValue(query);
  });

  it.each(["", "{}"])("allows empty input %j to use the saved buyer", async (body) => {
    const response = await POST(request(body), { params: Promise.resolve({ orderId: "qa-paid-order" }) });

    expect(response.status).toBe(200);
    expect(mocks.issue).toHaveBeenCalledOnce();
    expect(mocks.issue.mock.calls[0][2]).toBeNull();
    expect(mocks.from).toHaveBeenCalledOnce();
  });

  it.each([
    ["malformed JSON", "{broken-json"],
    ["invalid buyer schema", JSON.stringify({ buyer: { buyer_type: "company", buyer_name: "QA", buyer_id: "1234567" } })]
  ])("rejects %s before database, helper, or audit work", async (_label, body) => {
    const response = await POST(request(body), { params: Promise.resolve({ orderId: "qa-paid-order" }) });

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

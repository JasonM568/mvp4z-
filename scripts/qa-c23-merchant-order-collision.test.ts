import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const provider = vi.hoisted(() => ({
  prepare: vi.fn(),
  issue: vi.fn(),
  search: vi.fn(),
  verify: vi.fn()
}));
const routeState = vi.hoisted(() => ({
  orders: new Map<string, Record<string, any>>(),
  rpcCalls: [] as Array<{ name: string; args: Record<string, any> }>
}));

vi.mock("@/lib/payments/ezpay-invoice", () => ({
  prepareInvoiceIssue: provider.prepare,
  issuePreparedInvoice: provider.issue,
  searchInvoiceByMerchantOrderNo: provider.search,
  verifyCheckCode: provider.verify
}));
vi.mock("@/lib/payments/ezpay-config", () => ({
  getValidatedEzpayConfig: () => ({ env: "stage", merchantId: "12345678", hashKey: "k".repeat(32), hashIv: "i".repeat(16) })
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => ({ profile: { id: "qa-admin" } }) }));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      let selectedId: string | undefined;
      const query = {
        select: () => query,
        eq: (_column: string, value: unknown) => { selectedId = String(value); return query; },
        in: () => query,
        maybeSingle: async () => ({
          data: table === "orders" ? routeState.orders.get(selectedId || "") || null : null,
          error: null
        })
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, any>) => {
      routeState.rpcCalls.push({ name, args });
      if (name === "begin_ezpay_invoice_issue") return { data: { outcome: "merchant_order_conflict" }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    }
  })
}));

// Candidate source is selected by scripts/qa-c23-merchant-order-collision.vitest.mts.
// @ts-expect-error This alias exists only in the isolated QA config.
import { issueInvoiceFromOrder } from "@c23/lib/payments/issue-invoice-from-order";
// @ts-expect-error This alias exists only for isolated candidate route testing.
import { POST as manualIssuePost } from "@c23/app/api/admin/invoices/[orderId]/issue/route";

const prefix = "ABCDEFGHIJKLMNOPQRST";
const orderA = {
  id: "11111111-1111-4111-8111-111111111111",
  order_no: `${prefix}-A`,
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  amount: 199,
  invoice_request: { buyer_type: "personal", buyer_name: "Buyer A", buyer_email: "a@example.test" },
  item_name: "Synthetic A"
};

function makeAdmin(orderId: string, result: Record<string, unknown>, calls: Array<{ name: string; args: Record<string, any> }>) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: async () => ({ data: null, error: null })
  };
  return {
    from: () => query,
    rpc: async (name: string, args: Record<string, any>) => {
      calls.push({ name, args });
      if (name === "begin_ezpay_invoice_issue") return { data: result, error: null };
      throw new Error(`Unexpected RPC ${name} for ${orderId}`);
    }
  } as any;
}

describe("QA-FS-C23 MerchantOrderNo collision fail-closed boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.orders.clear();
    routeState.rpcCalls.length = 0;
    provider.prepare.mockImplementation(async (input: { merchantOrderNo: string; buyerName: string }) => ({
      environment: "stage",
      merchantId: "12345678",
      encryptedPostData: `synthetic-${input.merchantOrderNo}-${input.buyerName}`,
      plainTextLength: 120
    }));
    provider.issue.mockResolvedValue({ ok: true, status: "SUCCESS", result: { InvoiceNumber: "SYNTHETIC" } });
    provider.search.mockResolvedValue({ ok: true, result: { InvoiceNumber: "SYNTHETIC" } });
    provider.verify.mockReturnValue(true);
  });

  it.each([
    { label: "same amount", amountB: 199 },
    { label: "different amount", amountB: 499 }
  ])("rejects both distinct orders with a shared 20-character reference ($label)", async ({ amountB }) => {
    const orderB = {
      ...orderA,
      id: "22222222-2222-4222-8222-222222222222",
      order_no: `${prefix}-B`,
      user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      amount: amountB,
      invoice_request: { buyer_type: "personal", buyer_name: "Buyer B", buyer_email: "b@example.test" },
      item_name: "Synthetic B"
    };
    const externalA = orderA.order_no.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    const externalB = orderB.order_no.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    expect(orderA.id).not.toBe(orderB.id);
    expect(externalA).toBe(prefix);
    expect(externalB).toBe(prefix);

    const rpcA: Array<{ name: string; args: Record<string, any> }> = [];
    const rpcB: Array<{ name: string; args: Record<string, any> }> = [];
    const conflict = { outcome: "merchant_order_conflict" };
    const results = await Promise.allSettled([
      issueInvoiceFromOrder(makeAdmin(orderA.id, conflict, rpcA), orderA),
      issueInvoiceFromOrder(makeAdmin(orderB.id, conflict, rpcB), orderB)
    ]);

    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason).toMatchObject({
        status: 409,
        code: "INVOICE_MERCHANT_ORDER_NO_COLLISION"
      });
    }
    for (const calls of [rpcA, rpcB]) {
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("begin_ezpay_invoice_issue");
      expect(calls[0].args.p_merchant_order_no).toBe(prefix);
    }
    expect(rpcA[0].args.p_order_id).toBe(orderA.id);
    expect(rpcB[0].args.p_order_id).toBe(orderB.id);
    expect(provider.issue).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
  });

  it.each([
    { label: "same amount", amountB: 199 },
    { label: "different amount", amountB: 499 }
  ])("returns HTTP 409 for colliding admin orders before EZPay dispatch ($label)", async ({ amountB }) => {
    const orderB = {
      ...orderA,
      id: "22222222-2222-4222-8222-222222222222",
      order_no: `${prefix}-B`,
      user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      amount: amountB,
      invoice_request: { buyer_type: "personal", buyer_name: "Buyer B", buyer_email: "b@example.test" },
      item_name: "Synthetic B"
    };
    const withRouteFields = (order: typeof orderA) => ({
      ...order,
      currency: "TWD",
      status: "paid",
      legacy_no_invoice: false,
      plans: { code: "local-qa", name: "QA plan" }
    });
    routeState.orders.set(orderA.id, withRouteFields(orderA));
    routeState.orders.set(orderB.id, withRouteFields(orderB));

    for (const [orderId, buyerName] of [[orderA.id, "Buyer A"], [orderB.id, "Buyer B"]]) {
      const request = new NextRequest(`http://localhost/api/admin/invoices/${orderId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer: { buyer_type: "personal", buyer_name: buyerName } })
      });
      const response = await manualIssuePost(request, { params: Promise.resolve({ orderId }) });
      const responseBody = await response.json();
      expect({ status: response.status, body: responseBody }).toMatchObject({
        status: 409,
        body: { error: expect.any(String) }
      });
    }

    expect(routeState.rpcCalls).toHaveLength(2);
    expect(routeState.rpcCalls.map((call) => call.args.p_order_id)).toEqual([orderA.id, orderB.id]);
    expect(routeState.rpcCalls.map((call) => call.args.p_merchant_order_no)).toEqual([prefix, prefix]);
    expect(provider.issue).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
  });
});

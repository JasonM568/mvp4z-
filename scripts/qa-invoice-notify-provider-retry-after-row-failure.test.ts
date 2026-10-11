import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  providerCalls: [] as Array<Record<string, unknown>>,
  invoiceRows: [] as Array<Record<string, unknown>>,
  alerts: [] as Array<Record<string, unknown>>,
  order: null as null | Record<string, any>,
  failFirstInvoiceInsert: true
}));

vi.mock("@/lib/payments/ecpay", () => ({
  formDataToParams: () => ({
    MerchantTradeNo: "QA_ORDER_WEBHOOK_20261011", TradeNo: "QA_PROVIDER_TRADE",
    RtnCode: "1", PaymentType: "Credit_CreditCard", TradeAmt: "500"
  }),
  verifyCheckMacValue: () => true
}));
vi.mock("@/lib/payments/orders", () => ({
  normalizeAmount: (value: unknown) => Math.round(Number(value)),
  normalizeOrderWithPlan: (order: unknown) => order
}));
vi.mock("@/lib/notifications/admin-alerts", () => ({
  sendAdminAlert: async (input: Record<string, unknown>) => { state.alerts.push(input); }
}));
vi.mock("@/lib/notifications/order-emails", () => ({ sendOrderPaidEmails: vi.fn() }));
vi.mock("@/lib/payments/ezpay-invoice", () => ({
  issueInvoice: async (input: Record<string, unknown>) => {
    state.providerCalls.push(input);
    return {
      ok: true, status: "SUCCESS", message: "QA provider stub success",
      result: {
        InvoiceNumber: `QA-WEBHOOK-${state.providerCalls.length}`,
        RandomNum: "4321", CreateTime: "2026-10-11 12:00:00",
        InvoiceTransNo: `QA-WEBHOOK-TRANS-${state.providerCalls.length}`
      },
      rawResponse: { Status: "SUCCESS", Message: "QA provider stub success" },
      rawRequest: { url: "http://local-provider-stub", merchantId: "QA-STUB", plainTextLength: 1 }
    };
  }
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => makeAdminClient() }));

import { POST } from "../app/api/payments/ecpay/notify/route";

function makeAdminClient() {
  return {
    from(table: string) {
      let updatePayload: Record<string, unknown> | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      let filters: Record<string, unknown> = {};
      const query: Record<string, (...args: any[]) => any> = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        in: (key: string, value: unknown) => { filters[key] = value; return query; },
        update: (payload: Record<string, unknown>) => { updatePayload = payload; return query; },
        maybeSingle: async () => {
          if (table === "orders") return { data: state.order, error: null };
          if (table === "profiles") return { data: { name: "Synthetic QA", email: "qa@example.test", phone: null }, error: null };
          if (table === "invoices") return {
            data: state.invoiceRows.find((row) => ["pending", "issued"].includes(String(row.status))) || null,
            error: null
          };
          throw new Error(`unexpected maybeSingle on ${table}`);
        },
        insert: (payload: Record<string, unknown>) => { insertPayload = payload; return query; },
        single: async () => {
          if (table !== "invoices" || !insertPayload) throw new Error(`unexpected insert on ${table}`);
          if (state.failFirstInvoiceInsert) {
            state.failFirstInvoiceInsert = false;
            return { data: null, error: new Error("injected invoice INSERT failure after provider success") };
          }
          const inserted = { id: "qa-webhook-invoice-row", ...insertPayload };
          state.invoiceRows.push(inserted);
          return { data: inserted, error: null };
        },
        then: (resolve: (result: { error: null }) => unknown) => {
          if (table === "orders" && updatePayload && state.order &&
            (filters.status as string[] | undefined)?.includes(String(state.order.status))) {
            Object.assign(state.order, updatePayload);
          }
          return Promise.resolve(resolve({ error: null }));
        }
      };
      return query;
    },
    rpc: async (name: string) => {
      if (name === "record_ecpay_payment_notification") {
        return { data: [{ amount_mismatch: false, payment_status: "paid" }], error: null };
      }
      if (name === "commit_paid_entitlement") {
        return { data: [{ provisioned: false, entitlement_id: "qa-entitlement",
          carried_credits: 0, total_credits: 5, expires_at: "2026-11-10T00:00:00.000Z" }], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    }
  };
}

function request() {
  const body = new URLSearchParams({ MerchantTradeNo: "QA_ORDER_WEBHOOK_20261011" });
  return new NextRequest("http://localhost/api/payments/ecpay/notify", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body
  });
}

describe("QA-FS-C23 ECPay notification retry after provider success and invoice row failure", () => {
  beforeEach(() => {
    state.providerCalls = [];
    state.invoiceRows = [];
    state.alerts = [];
    state.failFirstInvoiceInsert = true;
    state.order = {
      id: "00000000-0000-4000-8000-000000000010",
      order_no: "QA_ORDER_WEBHOOK_20261011",
      user_id: "00000000-0000-4000-8000-000000000020",
      plan_id: "00000000-0000-4000-8000-000000000030",
      order_type: "membership", amount: 500, currency: "TWD", status: "pending",
      provider: "ecpay", provider_trade_no: null, paid_at: null,
      created_at: "2026-10-11T00:00:00.000Z",
      invoice_request: { buyer_type: "personal", buyer_name: "Synthetic QA", buyer_email: "qa@example.test" },
      legacy_no_invoice: false,
      plans: { id: "qa-plan", code: "qa", name: "Synthetic QA", price: 500, currency: "TWD",
        credits: 5, duration_days: 30, is_active: true, is_addon: false }
    };
  });

  it("acknowledges the payment callback but repeats provider issue when the local row was not saved", async () => {
    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("1|OK");
    expect(state.providerCalls).toHaveLength(1);
    expect(state.invoiceRows).toHaveLength(0);
    expect(state.alerts).toHaveLength(1);

    const repeatedCallback = await POST(request());
    expect(repeatedCallback.status).toBe(200);
    expect(await repeatedCallback.text()).toBe("1|OK");
    expect(state.providerCalls).toHaveLength(2);
    expect(state.providerCalls.map((call) => call.merchantOrderNo)).toEqual([
      "QA_ORDER_WEBHOOK_202", "QA_ORDER_WEBHOOK_202"
    ]);
    expect(state.invoiceRows).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
  });
});

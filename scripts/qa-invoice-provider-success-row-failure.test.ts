import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  providerCalls: [] as Array<Record<string, unknown>>,
  invoiceRows: [] as Array<Record<string, unknown>>,
  auditRows: [] as Array<Record<string, unknown>>,
  failFirstInvoiceInsert: true,
  expectedProviderCalls: 0,
  providerGate: null as null | Promise<void>,
  releaseProvider: null as null | (() => void)
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => ({ profile: { id: "qa-admin" } }),
  writeAdminAudit: async (input: Record<string, unknown>) => { state.auditRows.push(input); }
}));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => makeAdminClient() }));
vi.mock("@/lib/payments/ezpay-invoice", () => ({
  issueInvoice: async (input: Record<string, unknown>) => {
    state.providerCalls.push(input);
    if (state.expectedProviderCalls > 0 && state.providerCalls.length >= state.expectedProviderCalls) {
      state.releaseProvider?.();
    }
    if (state.providerGate) await state.providerGate;
    return {
      ok: true,
      status: "SUCCESS",
      message: "QA provider stub success",
      result: {
        InvoiceNumber: `QA${state.providerCalls.length}`,
        RandomNum: "1234",
        CreateTime: "2026-10-11 12:00:00",
        InvoiceTransNo: `QA-TRANS-${state.providerCalls.length}`
      },
      rawResponse: { Status: "SUCCESS", Message: "QA provider stub success" },
      rawRequest: { url: "http://local-provider-stub", merchantId: "QA-STUB", plainTextLength: 1 }
    };
  }
}));

import { POST } from "../app/api/admin/invoices/[orderId]/issue/route";

const order = {
  id: "00000000-0000-4000-8000-000000000010",
  order_no: "QA_ORDER_20261011",
  user_id: "00000000-0000-4000-8000-000000000020",
  amount: 500,
  currency: "TWD",
  status: "paid",
  legacy_no_invoice: false,
  invoice_request: { buyer_type: "personal", buyer_name: "Synthetic QA", buyer_email: "qa@example.test" },
  plans: { code: "qa", name: "Synthetic QA" }
};

function makeAdminClient() {
  return {
    from(table: string) {
      let insertPayload: Record<string, unknown> | null = null;
      const query: Record<string, (...args: any[]) => any> = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => table === "orders"
          ? { data: order, error: null }
          : { data: state.invoiceRows.find((row) => ["pending", "issued"].includes(String(row.status))) || null, error: null },
        insert: (payload: Record<string, unknown>) => { insertPayload = payload; return query; },
        single: async () => {
          if (table !== "invoices" || !insertPayload) throw new Error(`unexpected insert on ${table}`);
          if (state.failFirstInvoiceInsert) {
            state.failFirstInvoiceInsert = false;
            return { data: null, error: new Error("injected invoices row INSERT failure after provider success") };
          }
          if (state.invoiceRows.some((row) => row.order_id === insertPayload?.order_id &&
            row.provider === insertPayload?.provider && ["pending", "issued"].includes(String(row.status)))) {
            return { data: null, error: new Error("duplicate key violates idx_invoices_order_provider_active") };
          }
          const inserted = { id: "qa-invoice-row", ...insertPayload };
          state.invoiceRows.push(inserted);
          return { data: inserted, error: null };
        }
      };
      return query;
    }
  };
}

function request() {
  return new NextRequest("http://localhost/api/admin/invoices/00000000-0000-4000-8000-000000000010/issue", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer qa-admin" },
    body: "{}"
  });
}

describe("QA-FS-C23 invoice provider success followed by invoice-row insert failure", () => {
  beforeEach(() => {
    state.providerCalls = [];
    state.invoiceRows = [];
    state.auditRows = [];
    state.failFirstInvoiceInsert = true;
    state.expectedProviderCalls = 0;
    state.providerGate = null;
    state.releaseProvider = null;
  });

  it("calls the provider again on retry because the first success has no persisted invoice row", async () => {
    const context = { params: Promise.resolve({ orderId: order.id }) };
    const first = await POST(request(), context);
    expect(first.status).toBe(500);
    expect(state.providerCalls).toHaveLength(1);
    expect(state.invoiceRows).toHaveLength(0);
    expect(state.auditRows).toHaveLength(0);

    const retry = await POST(request(), context);
    const body = await retry.json();
    expect(retry.status).toBe(200);
    expect(body.invoice.status).toBe("issued");
    expect(state.providerCalls).toHaveLength(2);
    expect(state.providerCalls[0]).toMatchObject({ merchantOrderNo: "QA_ORDER_20261011" });
    expect(state.providerCalls[1]).toMatchObject({ merchantOrderNo: "QA_ORDER_20261011" });
    expect(state.invoiceRows).toHaveLength(1);
    expect(state.auditRows).toHaveLength(1);
  });

  it("can call the provider N times before the active-invoice unique index permits only one local row", async () => {
    state.failFirstInvoiceInsert = false;
    state.expectedProviderCalls = 10;
    state.providerGate = new Promise<void>((resolve) => { state.releaseProvider = resolve; });
    const context = { params: Promise.resolve({ orderId: order.id }) };

    const responses = await Promise.all(Array.from({ length: 10 }, () =>
      POST(request(), context)));
    const statuses = await Promise.all(responses.map(async (response) => response.status));

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 500)).toHaveLength(9);
    expect(state.providerCalls).toHaveLength(10);
    expect(state.invoiceRows).toHaveLength(1);
    expect(state.auditRows).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAdminAudit: vi.fn(),
  createActivationCode: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  issueInvoiceFromOrder: vi.fn(),
  auditInsertFails: false,
  auditRows: [] as Array<Record<string, unknown>>,
  activationCodes: [] as Array<Record<string, unknown>>,
  ledgerRows: [] as Array<Record<string, unknown>>,
  entitlement: { id: "qa-entitlement", credits_remaining: 5 } as Record<string, unknown>,
  invoiceCalls: 0
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mocks.requireAdmin,
  writeAdminAudit: mocks.writeAdminAudit,
  createActivationCode: mocks.createActivationCode
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/payments/issue-invoice-from-order", () => ({ issueInvoiceFromOrder: mocks.issueInvoiceFromOrder }));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  readJson: async (request: NextRequest, schema: { parse(value: unknown): unknown }) => schema.parse(await request.json()),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));

import { POST as createCodePOST } from "../app/api/admin/create-code/route";
import { POST as adjustCreditsPOST } from "../app/api/admin/credits/route";
import { POST as issueInvoicePOST } from "../app/api/admin/invoices/[orderId]/issue/route";

function makeAdminClient() {
  return {
    from: (table: string) => {
      let filters: Record<string, unknown> = {};
      let insertPayload: Record<string, unknown> | null = null;
      let updatePayload: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        gte: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          if (table === "plans") return { data: { id: "qa-plan", code: "basic" }, error: null };
          if (table === "member_entitlements") return { data: { ...mocks.entitlement }, error: null };
          if (table === "orders") return {
            data: {
              id: "00000000-0000-4000-8000-000000000010",
              order_no: "QA-ORDER",
              user_id: "00000000-0000-4000-8000-000000000020",
              amount: 500,
              currency: "TWD",
              status: "paid",
              legacy_no_invoice: false,
              invoice_request: { buyer_type: "personal", buyer_name: "QA", buyer_email: "qa@example.test" },
              plans: { code: "basic", name: "QA" }
            }, error: null
          };
          return { data: null, error: null };
        },
        insert: (payload: Record<string, unknown>) => { insertPayload = payload; return query; },
        update: (payload: Record<string, unknown>) => { updatePayload = payload; return query; },
        then: (resolve: (result: { error: Error | null }) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve().then(() => {
            if (table === "admin_audit_logs") {
              if (mocks.auditInsertFails) return { error: new Error("injected audit insert failure") };
              if (insertPayload) mocks.auditRows.push({ ...insertPayload });
            } else if (table === "activation_codes" && insertPayload) {
              mocks.activationCodes.push({ ...insertPayload });
            } else if (table === "member_entitlements" && updatePayload) {
              Object.assign(mocks.entitlement, updatePayload);
            } else if (table === "credit_transactions" && insertPayload) {
              mocks.ledgerRows.push({ ...insertPayload });
            }
            return { error: null };
          }).then(resolve, reject)
      };
      return query;
    }
  };
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer qa-admin" },
    body: JSON.stringify(body)
  });
}

describe("QA: admin audit insert failure side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditInsertFails = true;
    mocks.auditRows = [];
    mocks.activationCodes = [];
    mocks.ledgerRows = [];
    mocks.entitlement = { id: "qa-entitlement", credits_remaining: 5 };
    mocks.invoiceCalls = 0;
    mocks.requireAdmin.mockResolvedValue({ profile: { id: "qa-admin" } });
    mocks.createSupabaseAdminClient.mockReturnValue(makeAdminClient());
    mocks.createActivationCode.mockReturnValue("XF-QA-1234-5678");
    mocks.writeAdminAudit.mockImplementation(async (input) => {
      await mocks.createSupabaseAdminClient().from("admin_audit_logs").insert({
        admin_user_id: input.adminUserId || null,
        action: input.action,
        target_type: input.targetType || null,
        target_id: input.targetId || null,
        metadata: input.metadata || {}
      });
    });
    mocks.issueInvoiceFromOrder.mockImplementation(async () => {
      mocks.invoiceCalls += 1;
      return {
        ok: true,
        reused: false,
        invoice: { id: "qa-invoice", invoice_number: "QA-NO-CHARGE", status: "issued", error_code: null, error_msg: null }
      };
    });
  });

  it("activation-code insert returns success although the code has no audit", async () => {
    const response = await createCodePOST(jsonRequest("http://localhost/api/admin/create-code", {
      plan: "basic", days: 30, credits: 100, note: "QA"
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.code).toBe("XF-QA-1234-5678");
    expect(mocks.activationCodes).toHaveLength(1);
    expect(mocks.auditRows).toHaveLength(0);
  });

  it("credit balance and ledger change return success although audit insert fails", async () => {
    const response = await adjustCreditsPOST(jsonRequest("http://localhost/api/admin/credits", {
      user_id: "00000000-0000-4000-8000-000000000020", amount: -5, plan: "basic", days: 30, note: "QA"
    }));

    expect(response.status).toBe(200);
    expect(mocks.entitlement.credits_remaining).toBe(0);
    expect(mocks.ledgerRows).toEqual([expect.objectContaining({ amount: -5, balance_after: 0 })]);
    expect(mocks.auditRows).toHaveLength(0);
  });

  it("invoice route returns issued invoice although its audit insert fails", async () => {
    const response = await issueInvoicePOST(
      jsonRequest("http://localhost/api/admin/invoices/00000000-0000-4000-8000-000000000010/issue", {}),
      { params: Promise.resolve({ orderId: "00000000-0000-4000-8000-000000000010" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invoice.id).toBe("qa-invoice");
    expect(mocks.invoiceCalls).toBe(1);
    expect(mocks.auditRows).toHaveLength(0);
  });
});

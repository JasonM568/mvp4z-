import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  prepare: vi.fn(),
  issue: vi.fn(),
  search: vi.fn(),
  verify: vi.fn()
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

// @ts-expect-error Alias is supplied by qa-c23-provider-row-failure-retry.vitest.mts.
import { issueInvoiceFromOrder } from "@c23/lib/payments/issue-invoice-from-order";

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  order_no: "LOCAL_C23_ORDER_1",
  user_id: "22222222-2222-4222-8222-222222222222",
  amount: 199,
  invoice_request: { buyer_type: "personal", buyer_name: "Local QA", buyer_email: "qa@example.test" },
  item_name: "Synthetic QA plan"
};
const issued = {
  InvoiceNumber: "AB12345678",
  RandomNum: "1234",
  InvoiceTransNo: "LOCAL_TX_1",
  MerchantID: "12345678",
  MerchantOrderNo: "LOCAL_C23_ORDER_1",
  TotalAmt: 199,
  CheckCode: "stub-check",
  CreateTime: "2026-10-11 12:00:00"
};
const providerSuccess = {
  ok: true,
  status: "SUCCESS",
  message: "ok",
  result: issued,
  rawResponse: { Status: "SUCCESS" },
  rawRequest: {}
};

function claim(dispatchCount: number) {
  return {
    outcome: "claimed",
    operation_id: "33333333-3333-4333-8333-333333333333",
    lease_token: `lease-${dispatchCount}`,
    dispatch_count: dispatchCount,
    environment: "stage",
    merchant_id: "12345678",
    encrypted_post_data: "same-encrypted-payload"
  };
}

function makeAdmin() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error: null }))
  };
  let begins = 0;
  let completes = 0;
  const rpc = vi.fn(async (name: string) => {
    if (name === "begin_ezpay_invoice_issue") return { data: claim(++begins), error: null };
    if (name === "complete_ezpay_invoice_issue") {
      completes++;
      return completes === 1
        ? { data: null, error: { message: "injected invoice/audit transaction failure" } }
        : { data: { id: "invoice-1", status: "issued" }, error: null };
    }
    return { data: null, error: null };
  });
  return { client: { from: vi.fn(() => query), rpc } as any };
}

describe("QA-FS-C23 provider success followed by local row transaction failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.prepare.mockResolvedValue({
      environment: "stage",
      merchantId: "12345678",
      encryptedPostData: "same-encrypted-payload",
      plainTextLength: 123
    });
    provider.issue.mockResolvedValue(providerSuccess);
    provider.verify.mockReturnValue(true);
  });

  it("searches and reuses the provider invoice without issuing again", async () => {
    const { client } = makeAdmin();
    provider.search.mockResolvedValue(providerSuccess);

    await expect(issueInvoiceFromOrder(client, order as any)).rejects.toMatchObject({ code: "INVOICE_OUTCOME_UNKNOWN" });
    const retry = await issueInvoiceFromOrder(client, order as any);

    expect(retry).toMatchObject({ ok: true, invoice: { id: "invoice-1", status: "issued" } });
    expect(provider.issue).toHaveBeenCalledTimes(1);
    expect(provider.search).toHaveBeenCalledTimes(1);
  });

  it("only resends the exact persisted encrypted request after an explicit not-found lookup", async () => {
    const { client } = makeAdmin();
    provider.search.mockResolvedValue({
      ok: false,
      status: "INV20006",
      message: "not found",
      rawResponse: {},
      rawRequest: {}
    });

    await expect(issueInvoiceFromOrder(client, order as any)).rejects.toMatchObject({ code: "INVOICE_OUTCOME_UNKNOWN" });
    const retry = await issueInvoiceFromOrder(client, order as any);

    expect(retry.ok).toBe(true);
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(provider.issue).toHaveBeenCalledTimes(2);
    expect(provider.issue.mock.calls[1][0]).toMatchObject({
      environment: "stage",
      merchantId: "12345678",
      encryptedPostData: "same-encrypted-payload"
    });
  });
});

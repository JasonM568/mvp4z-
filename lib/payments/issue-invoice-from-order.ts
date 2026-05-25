// 「對 paid order 開票並寫 invoices row」共用 helper。
// admin manual issue API (/api/admin/invoices/[orderId]/issue) 與
// notify webhook 自動開票 (/api/payments/ecpay/notify) 共用。
//
// idempotent：已有 active（pending/issued）的 invoice 直接回該 row 不重開。
// 失敗仍寫 row (status=failed) 留待 admin retry。

import type { SupabaseClient } from "@supabase/supabase-js";
import { issueInvoice, type InvoiceCarrierType } from "./ecpay-invoice";

export interface OrderForInvoice {
  id: string;
  order_no: string;
  user_id: string;
  amount: number;
  invoice_request: unknown;
  legacy_no_invoice?: boolean;
  item_name?: string | null;
  plans?: { code?: string | null; name?: string | null } | null;
}

export interface InvoiceBuyer {
  buyer_type: "personal" | "company";
  buyer_name: string;
  buyer_id?: string | null;
  buyer_email?: string | null;
  carrier_type?: InvoiceCarrierType;
  carrier_num?: string | null;
  donation_code?: string | null;
}

export interface IssueResult {
  ok: boolean;
  invoice: Record<string, unknown>;
  reused?: boolean;     // 已有 active invoice，直接回
  skipped?: boolean;    // legacy_no_invoice / 無 invoice_request → 不開
  reason?: string;      // skipped 時的原因
}

export function buyerFromOrder(order: OrderForInvoice, override?: InvoiceBuyer | null): InvoiceBuyer | null {
  if (override) return override;
  if (!order.invoice_request || typeof order.invoice_request !== "object") return null;
  const raw = order.invoice_request as Record<string, unknown>;
  if (!raw.buyer_type || !raw.buyer_name) return null;
  return {
    buyer_type: raw.buyer_type as "personal" | "company",
    buyer_name: String(raw.buyer_name),
    buyer_id: raw.buyer_id ? String(raw.buyer_id) : null,
    buyer_email: raw.buyer_email ? String(raw.buyer_email) : null,
    carrier_type: (raw.carrier_type as InvoiceCarrierType) || "none",
    carrier_num: raw.carrier_num ? String(raw.carrier_num) : null,
    donation_code: raw.donation_code ? String(raw.donation_code) : null
  };
}

export async function issueInvoiceFromOrder(
  admin: SupabaseClient,
  order: OrderForInvoice,
  override?: InvoiceBuyer | null
): Promise<IssueResult> {
  if (order.legacy_no_invoice) {
    return { ok: false, invoice: {}, skipped: true, reason: "legacy_no_invoice" };
  }

  // idempotency：已有 active invoice 直接回
  const { data: existing } = await admin
    .from("invoices")
    .select("*")
    .eq("order_id", order.id)
    .eq("provider", "ecpay")
    .in("status", ["pending", "issued"])
    .maybeSingle();

  if (existing) {
    return { ok: existing.status === "issued", invoice: existing, reused: true };
  }

  const buyer = buyerFromOrder(order, override);
  if (!buyer) {
    return { ok: false, invoice: {}, skipped: true, reason: "no_buyer_info" };
  }

  const planInfo = order.plans;
  const itemName = order.item_name || planInfo?.name || order.order_no;
  const result = await issueInvoice({
    relateNumber: order.order_no,
    customerName: buyer.buyer_name,
    customerEmail: buyer.buyer_email || "",
    customerIdentifier: buyer.buyer_id || "",
    carrierType: buyer.carrier_type || "none",
    carrierNum: buyer.carrier_num || "",
    donationCode: buyer.donation_code || "",
    totalAmount: order.amount,
    taxType: "1",
    items: [{ name: itemName, count: 1, price: order.amount }],
    invoiceRemark: order.order_no
  });

  const baseRow: Record<string, unknown> = {
    order_id: order.id,
    user_id: order.user_id,
    provider: "ecpay",
    buyer_type: buyer.buyer_type,
    buyer_name: buyer.buyer_name,
    buyer_id: buyer.buyer_id || null,
    buyer_email: buyer.buyer_email || null,
    carrier_type: buyer.carrier_type || "none",
    carrier_num: buyer.carrier_num || null,
    donation_code: buyer.donation_code || null,
    total_amount: order.amount,
    tax_type: "1",
    last_attempted_at: new Date().toISOString(),
    retry_count: 1,
    raw_response: result.rawResponse as object
  };

  if (result.ok) {
    baseRow.status = "issued";
    baseRow.invoice_number = result.invoiceNumber;
    baseRow.random_code = result.randomCode;
    baseRow.invoice_date = parseInvoiceDate(result.invoiceDate);
  } else {
    baseRow.status = "failed";
    baseRow.error_code = result.errorCode;
    baseRow.error_msg = result.errorMessage;
  }

  const { data: inserted, error: insertError } = await admin
    .from("invoices")
    .insert(baseRow)
    .select("*")
    .single();
  if (insertError) throw insertError;

  return { ok: result.ok, invoice: inserted };
}

// 綠界 InvoiceDate "YYYY-MM-DD HH:mm:ss"（無時區）→ ISO with +08:00
function parseInvoiceDate(value: string): string | null {
  if (!value) return null;
  const normalized = value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

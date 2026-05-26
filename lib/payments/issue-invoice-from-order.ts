// 「對 paid order 開票並寫 invoices row」共用 helper。
// admin manual issue API (/api/admin/invoices/[orderId]/issue) 與
// notify webhook 自動開票 (/api/payments/ecpay/notify) 共用。
//
// idempotent：已有 active（pending/issued）的 invoice 直接回該 row 不重開。
// 失敗仍寫 row (status=failed) 留待 admin retry。
//
// 2026-05-26 切到 EZPay 樂點電子發票（原本 ecpay-invoice 是綠界 V3，未使用）。
// schema 內部 carrier_type enum 保留原值 ('none/cellphone/citizen_digital/ecpay_member')
// 不改前端，內部 mapping 到 EZPay 規格 (''/0/1/2)。

import type { SupabaseClient } from "@supabase/supabase-js";
import { issueInvoice, type EzpayCarrierType, type EzpayCategory } from "./ezpay-invoice";

export type InvoiceCarrierType = "none" | "cellphone" | "citizen_digital" | "ecpay_member";

export interface OrderForInvoice {
  id: string;
  order_no: string;
  user_id: string;
  amount: number;                      // 含稅總額（我們的 order.amount 對應 EZPay TotalAmt）
  invoice_request: unknown;
  legacy_no_invoice?: boolean;
  item_name?: string | null;
  plans?: { code?: string | null; name?: string | null } | null;
}

export interface InvoiceBuyer {
  buyer_type: "personal" | "company";
  buyer_name: string;
  buyer_id?: string | null;            // 統編 8 碼（company 必填）
  buyer_email?: string | null;
  carrier_type?: InvoiceCarrierType;
  carrier_num?: string | null;
  donation_code?: string | null;       // 捐贈碼 3-7 碼數字
}

export interface IssueResult {
  ok: boolean;
  invoice: Record<string, unknown>;
  reused?: boolean;     // 已有 active invoice，直接回
  skipped?: boolean;    // legacy_no_invoice / 無 invoice_request → 不開
  reason?: string;      // skipped 時的原因
}

const PROVIDER = "ezpay";

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
    .eq("provider", PROVIDER)
    .in("status", ["pending", "issued"])
    .maybeSingle();

  if (existing) {
    return { ok: existing.status === "issued", invoice: existing, reused: true };
  }

  const buyer = buyerFromOrder(order, override);
  if (!buyer) {
    return { ok: false, invoice: {}, skipped: true, reason: "no_buyer_info" };
  }

  const itemName = order.item_name || order.plans?.name || order.order_no;
  const category: EzpayCategory = buyer.buyer_type === "company" ? "B2B" : "B2C";

  // 含稅金額拆 amt + taxAmt（應稅 5%）
  // B2B: amt 是未稅 / B2C: amt 也是未稅但 ItemPrice 是含稅（PDF 第四章定義）
  const totalAmt = Math.max(0, Math.round(order.amount));
  const amt = Math.round(totalAmt / 1.05);
  const taxAmt = totalAmt - amt;

  // carrier_type mapping：我們 schema 內部 → EZPay 規格
  const carrierType = mapCarrierType(buyer.carrier_type, category);
  const carrierNum = carrierType ? mapCarrierNum(buyer.carrier_type, buyer.carrier_num, buyer.buyer_email) : "";

  // PrintFlag 規則：B2B 必 Y；B2C 沒載具沒捐贈才 Y
  const hasCarrierOrDonate = Boolean(carrierType || buyer.donation_code);
  const printFlag: "Y" | "N" = category === "B2B" ? "Y" : (hasCarrierOrDonate ? "N" : "Y");

  // sanitize order_no → EZPay merchantOrderNo（只允許英、數、底線，≤ 20）
  const merchantOrderNo = order.order_no.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);

  const result = await issueInvoice({
    merchantOrderNo,
    category,
    buyerName: buyer.buyer_name,
    buyerUbn: category === "B2B" ? buyer.buyer_id || undefined : undefined,
    buyerEmail: buyer.buyer_email || undefined,
    carrierType,
    carrierNum: carrierNum || undefined,
    loveCode: category === "B2C" ? buyer.donation_code || undefined : undefined,
    printFlag,
    taxType: "1",
    taxRate: 5,
    amt,
    taxAmt,
    totalAmt,
    items: [{ name: itemName, count: 1, unit: "次", price: category === "B2B" ? amt : totalAmt, amount: category === "B2B" ? amt : totalAmt }],
    comment: order.order_no
  });

  const baseRow: Record<string, unknown> = {
    order_id: order.id,
    user_id: order.user_id,
    provider: PROVIDER,
    buyer_type: buyer.buyer_type,
    buyer_name: buyer.buyer_name,
    buyer_id: buyer.buyer_id || null,
    buyer_email: buyer.buyer_email || null,
    carrier_type: buyer.carrier_type || "none",
    carrier_num: buyer.carrier_num || null,
    donation_code: buyer.donation_code || null,
    total_amount: totalAmt,
    tax_type: "1",
    last_attempted_at: new Date().toISOString(),
    retry_count: 1,
    raw_response: result.rawResponse as object
  };

  if (result.ok && result.result) {
    baseRow.status = "issued";
    baseRow.invoice_number = result.result.InvoiceNumber;
    baseRow.random_code = result.result.RandomNum;
    baseRow.invoice_date = parseInvoiceDate(result.result.CreateTime);
    baseRow.provider_trans_no = result.result.InvoiceTransNo;
  } else {
    baseRow.status = "failed";
    baseRow.error_code = result.status;          // EZPay 錯誤碼 (KEY10006 等)
    baseRow.error_msg = result.message;
  }

  const { data: inserted, error: insertError } = await admin
    .from("invoices")
    .insert(baseRow)
    .select("*")
    .single();
  if (insertError) throw insertError;

  return { ok: result.ok, invoice: inserted };
}

// 內部 carrier enum → EZPay 規格
function mapCarrierType(carrier: InvoiceCarrierType | undefined, category: EzpayCategory): EzpayCarrierType {
  if (category === "B2B") return ""; // B2B 不用載具
  switch (carrier) {
    case "cellphone": return "0";
    case "citizen_digital": return "1";
    case "ecpay_member": return "2"; // 我們 schema 歷史命名，EZPay 載具用 buyer_email
    default: return "";
  }
}

function mapCarrierNum(carrier: InvoiceCarrierType | undefined, carrierNum: string | null | undefined, buyerEmail: string | null | undefined): string {
  // CarrierType=2 (ezPay 電子載具) 用 email 作為 CarrierNum
  if (carrier === "ecpay_member") return buyerEmail || "";
  return carrierNum || "";
}

// EZPay CreateTime "YYYY-MM-DD HH:mm:ss"（無時區，台北時間）→ ISO with +08:00
function parseInvoiceDate(value: string): string | null {
  if (!value) return null;
  const normalized = value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

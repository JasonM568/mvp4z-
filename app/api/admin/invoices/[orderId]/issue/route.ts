// admin 手動開票
// POST /api/admin/invoices/[orderId]/issue
//
// 用途：
// - 對 paid 但尚無 invoice 的 order 補開（自動開票還沒做，所有 paid 訂單都靠這條）
// - 對 status=failed 的 invoice 重試（呼叫前先把舊 row 標 voided/失效另議；v1 簡化為「沒有 active invoice 就可開」）
//
// Body（可選，覆蓋 orders.invoice_request）：
//   {
//     "buyer_type": "personal" | "company",
//     "buyer_name": "...",
//     "buyer_id": "12345678" | null,
//     "buyer_email": "...",
//     "carrier_type": "none" | "cellphone" | "citizen_digital" | "ecpay_member",
//     "carrier_num": "/ABC1234" | null,
//     "donation_code": "1234" | null
//   }
//
// 若 body 為空：讀 orders.invoice_request；若也是 null 報 400。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueInvoice, type InvoiceCarrierType } from "@/lib/payments/ecpay-invoice";

const buyerSchema = z.object({
  buyer_type: z.enum(["personal", "company"]),
  buyer_name: z.string().trim().min(1).max(60),
  buyer_id: z.string().trim().regex(/^\d{8}$/).nullable().optional(),
  buyer_email: z.string().trim().email().nullable().optional(),
  carrier_type: z.enum(["none", "cellphone", "citizen_digital", "ecpay_member"]).default("none"),
  carrier_num: z.string().trim().nullable().optional(),
  donation_code: z.string().trim().regex(/^\d{4,7}$/).nullable().optional()
}).refine(
  (v) => v.buyer_type === "personal" || (v.buyer_id && /^\d{8}$/.test(v.buyer_id)),
  { message: "公司發票必須填統一編號 8 碼", path: ["buyer_id"] }
);

type Buyer = z.infer<typeof buyerSchema>;

const inputSchema = z.object({ buyer: buyerSchema.optional() });

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { profile } = await requireAdmin(request);
    const { orderId } = await context.params;
    if (!orderId) throw statusError("缺少 order id", 400);

    const input = await readJson(request, inputSchema).catch(() => ({} as { buyer?: Buyer }));
    const admin = createSupabaseAdminClient();

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_no, user_id, amount, currency, status, legacy_no_invoice, invoice_request, plans(code, name)")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw statusError("找不到訂單", 404);
    if (order.status !== "paid") throw statusError("訂單尚未付款，無法開立發票", 400);
    if (order.legacy_no_invoice) throw statusError("此訂單已標記為歷史不開票", 400);

    const buyer: Buyer = input.buyer
      ? buyerSchema.parse(input.buyer)
      : buyerSchema.parse(order.invoice_request);

    const { data: existing } = await admin
      .from("invoices")
      .select("id, status")
      .eq("order_id", orderId)
      .eq("provider", "ecpay")
      .in("status", ["pending", "issued"])
      .maybeSingle();

    if (existing) {
      throw statusError(`此訂單已有 ${existing.status === "issued" ? "已開立" : "進行中"} 的發票`, 409);
    }

    const planInfo = order.plans as { code?: string; name?: string } | null;
    const itemName = planInfo?.name || order.order_no;
    const result = await issueInvoice({
      relateNumber: order.order_no,
      customerName: buyer.buyer_name,
      customerEmail: buyer.buyer_email || "",
      customerIdentifier: buyer.buyer_id || "",
      carrierType: buyer.carrier_type as InvoiceCarrierType,
      carrierNum: buyer.carrier_num || "",
      donationCode: buyer.donation_code || "",
      totalAmount: order.amount,
      taxType: "1",
      items: [{ name: itemName, count: 1, price: order.amount }],
      invoiceRemark: order.order_no
    });

    const insertRow: Record<string, unknown> = {
      order_id: order.id,
      user_id: order.user_id,
      provider: "ecpay",
      buyer_type: buyer.buyer_type,
      buyer_name: buyer.buyer_name,
      buyer_id: buyer.buyer_id || null,
      buyer_email: buyer.buyer_email || null,
      carrier_type: buyer.carrier_type,
      carrier_num: buyer.carrier_num || null,
      donation_code: buyer.donation_code || null,
      total_amount: order.amount,
      tax_type: "1",
      last_attempted_at: new Date().toISOString(),
      retry_count: 1,
      raw_response: result.rawResponse as object
    };

    if (result.ok) {
      insertRow.status = "issued";
      insertRow.invoice_number = result.invoiceNumber;
      insertRow.random_code = result.randomCode;
      insertRow.invoice_date = parseInvoiceDate(result.invoiceDate);
    } else {
      insertRow.status = "failed";
      insertRow.error_code = result.errorCode;
      insertRow.error_msg = result.errorMessage;
    }

    const { data: inserted, error: insertError } = await admin
      .from("invoices")
      .insert(insertRow)
      .select("*")
      .single();
    if (insertError) throw insertError;

    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: result.ok ? "invoice_issue_success" : "invoice_issue_failed",
      targetType: "order",
      targetId: order.id,
      metadata: {
        invoice_id: inserted.id,
        invoice_number: inserted.invoice_number,
        error_code: inserted.error_code,
        error_msg: inserted.error_msg
      }
    });

    return apiJson({ ok: result.ok, invoice: inserted }, result.ok ? 200 : 502);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

// 綠界回傳 InvoiceDate 格式 "YYYY-MM-DD HH:mm:ss"（無時區），補 +08:00
function parseInvoiceDate(value: string): string | null {
  if (!value) return null;
  const normalized = value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

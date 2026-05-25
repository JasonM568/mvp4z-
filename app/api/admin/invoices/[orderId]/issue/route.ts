// admin 手動開票
// POST /api/admin/invoices/[orderId]/issue
//
// 用途：
// - 對 paid 但尚無 invoice 的 order 補開
// - Phase 2 後：notify webhook 已自動開票，這條只在沒 invoice_request 或失敗 retry 才用
//
// Body（可選，覆蓋 orders.invoice_request）：
//   {
//     "buyer": { buyer_type, buyer_name, buyer_id, buyer_email, carrier_type, carrier_num, donation_code }
//   }
// 若 body 為空：讀 orders.invoice_request；若也是 null 報 400。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueInvoiceFromOrder, type InvoiceBuyer } from "@/lib/payments/issue-invoice-from-order";

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

const inputSchema = z.object({ buyer: buyerSchema.optional() });

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { profile } = await requireAdmin(request);
    const { orderId } = await context.params;
    if (!orderId) throw statusError("缺少 order id", 400);

    const input = await readJson(request, inputSchema).catch(() => ({} as { buyer?: InvoiceBuyer }));
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

    const override = input.buyer ? buyerSchema.parse(input.buyer) as InvoiceBuyer : null;
    // 若 body 沒帶 buyer 且 order 也沒 invoice_request → helper 會回 skipped
    if (!override && (!order.invoice_request || typeof order.invoice_request !== "object")) {
      throw statusError("此訂單無發票買受人資訊，請在 body 內帶 buyer", 400);
    }

    const planInfo = order.plans as { code?: string; name?: string } | null;
    const result = await issueInvoiceFromOrder(
      admin,
      {
        id: order.id,
        order_no: order.order_no,
        user_id: order.user_id,
        amount: Number(order.amount),
        invoice_request: order.invoice_request,
        legacy_no_invoice: order.legacy_no_invoice,
        plans: planInfo
      },
      override
    );

    if (result.reused) {
      throw statusError(
        `此訂單已有 ${(result.invoice.status as string) === "issued" ? "已開立" : "進行中"} 的發票`,
        409
      );
    }

    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: result.ok ? "invoice_issue_success" : "invoice_issue_failed",
      targetType: "order",
      targetId: order.id,
      metadata: {
        invoice_id: result.invoice.id,
        invoice_number: result.invoice.invoice_number,
        error_code: result.invoice.error_code,
        error_msg: result.invoice.error_msg
      }
    });

    return apiJson({ ok: result.ok, invoice: result.invoice }, result.ok ? 200 : 502);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

import { NextRequest, NextResponse } from "next/server";
import { formDataToParams, verifyCheckMacValue } from "@/lib/payments/ecpay";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { issueInvoiceFromOrder } from "@/lib/payments/issue-invoice-from-order";
import { normalizeAmount, normalizeOrderWithPlan } from "@/lib/payments/orders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const params = formDataToParams(await request.formData());
    const checkMacValid = verifyCheckMacValue(params);
    if (!checkMacValid) return ecpayText("0|CheckMacValue invalid", 400);

    const merchantTradeNo = String(params.MerchantTradeNo || "");
    const providerTradeNo = String(params.TradeNo || "");
    const rtnCode = String(params.RtnCode || "");
    const paidAmount = normalizeAmount(params.TradeAmt || params.TotalAmount || 0);
    const admin = createSupabaseAdminClient();

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_no, user_id, plan_id, amount, currency, status, provider, provider_trade_no, paid_at, created_at, invoice_request, legacy_no_invoice, plans(id, code, name, price, currency, credits, duration_days, is_active)")
      .eq("order_no", merchantTradeNo)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return ecpayText("0|Order not found", 404);

    const currentOrder = normalizeOrderWithPlan(order);
    await recordPayment({
      orderId: currentOrder.id,
      merchantTradeNo,
      providerTradeNo,
      paidAmount,
      status: rtnCode === "1" ? "paid" : "failed",
      checkMacValid,
      rawPayload: params
    });

    if (rtnCode !== "1") {
      await admin.from("orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", currentOrder.id).eq("status", "pending");
      return ecpayText("1|OK");
    }

    if (paidAmount !== Number(currentOrder.amount)) return ecpayText("0|Amount mismatch", 400);
    if (currentOrder.status === "paid") return ecpayText("1|OK");
    if (!currentOrder.plans) return ecpayText("0|Plan not found", 404);

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + Number(currentOrder.plans.duration_days || 30));

    const { error: orderUpdateError } = await admin
      .from("orders")
      .update({
        status: "paid",
        provider_trade_no: providerTradeNo,
        paid_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq("id", currentOrder.id)
      .in("status", ["pending", "failed"]);

    if (orderUpdateError) throw orderUpdateError;

    const { data: existingEntitlement, error: existingError } = await admin
      .from("member_entitlements")
      .select("id")
      .eq("source_order_id", currentOrder.id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existingEntitlement) {
      const credits = Number(currentOrder.plans.credits || 0);
      const { data: entitlement, error: entitlementError } = await admin
        .from("member_entitlements")
        .insert({
          user_id: currentOrder.user_id,
          plan_id: currentOrder.plan_id,
          status: "active",
          credits_remaining: credits,
          starts_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          source_order_id: currentOrder.id
        })
        .select("id")
        .single();

      if (entitlementError) throw entitlementError;

      const { error: txError } = await admin.from("credit_transactions").insert({
        user_id: currentOrder.user_id,
        entitlement_id: entitlement.id,
        type: "grant",
        amount: credits,
        balance_after: credits,
        source: "ecpay_payment",
        ref_id: merchantTradeNo
      });

      if (txError) throw txError;
    }

    // 自動開立電子發票（Phase 2）。失敗不阻擋 1|OK，failed row 留待 admin retry。
    try {
      const result = await issueInvoiceFromOrder(admin, {
        id: currentOrder.id,
        order_no: currentOrder.order_no,
        user_id: currentOrder.user_id,
        amount: Number(currentOrder.amount),
        invoice_request: (currentOrder as { invoice_request?: unknown }).invoice_request,
        legacy_no_invoice: (currentOrder as { legacy_no_invoice?: boolean }).legacy_no_invoice,
        plans: currentOrder.plans
      });
      if (!result.ok && !result.skipped && !result.reused) {
        console.warn("[notify] invoice issue failed", {
          orderId: currentOrder.id,
          error: result.invoice.error_msg,
          code: result.invoice.error_code
        });
        await sendAdminAlert({
          subject: `[巽風] 電子發票開立失敗：${currentOrder.order_no}`,
          text: [
            "綠界付款已成功，但電子發票開立失敗，請到後台發票管理檢查並重試。",
            "",
            `Order: ${currentOrder.order_no}`,
            `Order ID: ${currentOrder.id}`,
            `Error code: ${String(result.invoice.error_code || "")}`,
            `Error message: ${String(result.invoice.error_msg || "")}`
          ].join("\n")
        });
      }
    } catch (invoiceError) {
      // 開票流程本身有 bug 時不阻擋付款回應，但 log 出來
      console.warn("[notify] invoice issue threw", {
        orderId: currentOrder.id,
        error: invoiceError instanceof Error ? invoiceError.message : String(invoiceError)
      });
      await sendAdminAlert({
        subject: `[巽風] 電子發票流程異常：${currentOrder.order_no}`,
        text: [
          "綠界付款已成功，但電子發票流程發生例外，請到後台發票管理檢查並重試。",
          "",
          `Order: ${currentOrder.order_no}`,
          `Order ID: ${currentOrder.id}`,
          `Error: ${invoiceError instanceof Error ? invoiceError.message : String(invoiceError)}`
        ].join("\n")
      });
    }

    return ecpayText("1|OK");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment notify failed";
    return ecpayText(`0|${message}`, 500);
  }
}

async function recordPayment(input: {
  orderId: string;
  merchantTradeNo: string;
  providerTradeNo: string;
  paidAmount: number;
  status: string;
  checkMacValid: boolean;
  rawPayload: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const payload = {
    order_id: input.orderId,
    provider: "ecpay",
    provider_trade_no: input.providerTradeNo || null,
    merchant_trade_no: input.merchantTradeNo,
    amount: input.paidAmount,
    status: input.status,
    raw_payload: input.rawPayload,
    check_mac_valid: input.checkMacValid,
    received_at: new Date().toISOString()
  };

  const { error } = await admin.from("payments").upsert(payload, {
    onConflict: "provider,merchant_trade_no"
  });

  if (error) throw error;
}

function ecpayText(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

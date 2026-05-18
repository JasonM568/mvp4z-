import { NextRequest, NextResponse } from "next/server";
import { formDataToParams, verifyCheckMacValue } from "@/lib/payments/ecpay";
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
      .select("id, order_no, user_id, plan_id, amount, currency, status, provider, provider_trade_no, paid_at, created_at, plans(id, code, name, price, currency, credits, duration_days, is_active)")
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

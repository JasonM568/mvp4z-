import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, readJson, requireBearerProfile, statusError } from "@/lib/auth/member";
import { createCheckoutParams, createMerchantTradeNo, ecpayActionUrl } from "@/lib/payments/ecpay";
import { createOrderSchema, normalizeAmount, Plan } from "@/lib/payments/orders";
import { referralFieldsForRequest } from "@/lib/referral/attribution";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, createOrderSchema);
    const admin = createSupabaseAdminClient();

    let planQuery = admin
      .from("plans")
      .select("id, code, name, price, currency, credits, duration_days, is_active")
      .eq("is_active", true);

    planQuery = input.plan_id ? planQuery.eq("id", input.plan_id) : planQuery.eq("code", input.plan_code);

    const { data: plan, error: planError } = await planQuery.maybeSingle();
    if (planError) throw planError;
    if (!plan) throw statusError("找不到可購買的方案", 404);

    const selectedPlan = plan as Plan;
    const amount = normalizeAmount(selectedPlan.price);
    if (selectedPlan.currency !== "TWD") throw statusError("綠界付款目前僅支援 TWD", 400);

    const orderNo = createMerchantTradeNo();
    // 業務推廣歸因：查不到或已停用的推廣碼會回空物件，不影響訂單成立。
    const referral = await referralFieldsForRequest(admin, request);
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        order_no: orderNo,
        user_id: profile.id,
        plan_id: selectedPlan.id,
        amount,
        currency: selectedPlan.currency,
        status: "pending",
        provider: "ecpay",
        invoice_request: input.invoice_request || null,
        ...referral
      })
      .select("id, order_no, amount, currency, status, created_at")
      .single();

    if (orderError) throw orderError;

    const checkoutParams = createCheckoutParams({
      merchantTradeNo: orderNo,
      totalAmount: amount,
      itemName: `巽風系統 - ${selectedPlan.name} - ${amount}元`,
      tradeDesc: "Xunfeng Membership"
    });

    return apiJson({
      ok: true,
      order,
      checkout: {
        action: ecpayActionUrl(),
        method: "POST",
        params: checkoutParams
      }
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, readJson, requireBearerProfile, statusError } from "@/lib/auth/member";
import { createCheckoutParams, createMerchantTradeNo, ecpayActionUrl } from "@/lib/payments/ecpay";
import { createOrderSchema, normalizeAmount, Plan } from "@/lib/payments/orders";
import { referralFieldsForOrder } from "@/lib/referral/attribution";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** 內部方案（刷卡實測等）一律不得建立訂單。與 /api/plans 的同名樣式保持一致。 */
const INTERNAL_PLAN_PATTERN = /^e2e_/;

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

    // 內部方案（e2e 刷卡實測等）預設不得對外銷售。
    // /api/plans 只是「前台不列出」，那是顯示控制不是購買權限控制：
    // 使用者只要知道 code，用 /member-pricing?plan=e2e_xxx 就能走完整個結帳流程。
    //
    // 要跑 NT$1 信用卡真刷測試時，暫時把 ALLOW_INTERNAL_PLAN_CHECKOUT 設成 true，
    // 測完拿掉。用環境變數而不是留個洞，是為了讓「現在可以買測試方案」變成一個
    // 明確、看得見、會被 log 記下來的狀態。
    if (INTERNAL_PLAN_PATTERN.test(selectedPlan.code)) {
      if ((process.env.ALLOW_INTERNAL_PLAN_CHECKOUT || "").trim().toLowerCase() !== "true") {
        throw statusError("找不到可購買的方案", 404);
      }
      console.warn("[orders] 內部方案結帳已由 ALLOW_INTERNAL_PLAN_CHECKOUT 放行", {
        planCode: selectedPlan.code,
        profileId: profile.id
      });
    }
    const amount = normalizeAmount(selectedPlan.price);
    if (selectedPlan.currency !== "TWD") throw statusError("綠界付款目前僅支援 TWD", 400);

    const orderNo = createMerchantTradeNo();
    // 業務推廣歸因：以「註冊時綁定的推廣人」為主，沒綁定才退回 ?ref= cookie。
    // 查不到或已停用的推廣碼會回空物件，不影響訂單成立。
    const referral = await referralFieldsForOrder(admin, request, profile.id);
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

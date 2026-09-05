import { NextRequest, NextResponse } from "next/server";
import { formDataToParams, verifyCheckMacValue } from "@/lib/payments/ecpay";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { sendOrderPaidEmails } from "@/lib/notifications/order-emails";
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
    const paymentType = String(params.PaymentType || "");
    // 綠界非同步取號成功通知：ATM/CVS/BARCODE 的虛擬帳號或繳費代碼已產生，
    // 用戶尚未實際付款。RtnCode=2 + PaymentType 為 ATM_xxx / CVS_xxx / BARCODE。
    const isAsyncAllocation = rtnCode === "2" && /^(ATM|CVS|BARCODE)/.test(paymentType);
    const paidAmount = normalizeAmount(params.TradeAmt || params.TotalAmount || 0);
    const admin = createSupabaseAdminClient();

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_no, user_id, plan_id, order_type, course_product_id, item_name, amount, currency, status, provider, provider_trade_no, paid_at, created_at, invoice_request, legacy_no_invoice, plans(id, code, name, price, currency, credits, duration_days, is_active, is_addon)")
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
      status: rtnCode === "1" ? "paid" : isAsyncAllocation ? "allocated" : "failed",
      checkMacValid,
      rawPayload: params
    });

    if (rtnCode !== "1") {
      if (isAsyncAllocation) {
        // ATM/CVS/BARCODE 取號成功，order 維持 pending 等用戶實際付款。
        // 未來若啟用 PaymentInfoURL，可在這邊把虛擬帳號 / 繳費代碼 / 到期日存進 orders。
        return ecpayText("1|OK");
      }
      await admin.from("orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", currentOrder.id).eq("status", "pending");
      if ((currentOrder as { order_type?: string }).order_type === "course") {
        await admin.from("course_registrations").update({ status: "failed" }).eq("order_id", currentOrder.id).eq("status", "pending");
      }
      return ecpayText("1|OK");
    }

    if (paidAmount !== Number(currentOrder.amount)) return ecpayText("0|Amount mismatch", 400);

    // 這裡刻意不因為「訂單已是 paid」就早退。
    // 訂單標記與開通是兩段寫入，中間失敗會留下「已付款、沒開通」，
    // 而綠界重送是唯一的補救機會 —— 早退等於把補救的門關上。
    // 開通本身以 source_order_id 冪等（commit_paid_entitlement），重跑安全。
    const alreadyPaid = currentOrder.status === "paid";

    const now = new Date();

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

    // 這次呼叫是否真的完成了開通。重送通知時為 false，用來避免重寄付款通知信。
    let newlyProvisioned = false;

    let notification: {
      orderType: "membership" | "course";
      itemName: string;
      customerName?: string | null;
      customerEmail?: string | null;
      customerPhone?: string | null;
      adminExtra?: string[];
    } | null = null;

    if ((currentOrder as { order_type?: string }).order_type === "course") {
      const { data: registration, error: registrationError } = await admin
        .from("course_registrations")
        .update({
          status: "paid",
          paid_at: now.toISOString()
        })
        .eq("order_id", currentOrder.id)
        // 只認 pending → paid 這一次轉換。少了這個條件，重送通知會再次命中，
        // 讓下面的 newlyProvisioned 誤判為真而重寄一封報名成功信。
        .eq("status", "pending")
        .select("id, name, phone, email, registration_type, amount")
        .maybeSingle();

      if (registrationError) throw registrationError;

      // 重送時 registration 已是 paid，這個 update 不會命中，registration 為 null。
      // 用它判斷「本次才真的完成報名」，避免重寄通知信。
      newlyProvisioned = Boolean(registration);

      notification = {
        orderType: "course",
        itemName: (currentOrder as { item_name?: string | null }).item_name || currentOrder.order_no,
        customerName: registration?.name,
        customerEmail: registration?.email,
        customerPhone: registration?.phone,
        adminExtra: [
          `報名身份：${registration?.registration_type === "returning" ? "複訓學員" : "新生報名"}`
        ]
      };
    } else {
      if (!currentOrder.plans) return ecpayText("0|Plan not found", 404);

      // 開通、續訂結轉與點數交易全部在 commit_paid_entitlement 這個 DB function 裡，
      // 同一個 transaction 要嘛全成要嘛全退，並以 source_order_id 冪等。
      // 續訂規則：剩餘點數疊加、效期從 max(現有到期日, now) 往後延，舊方案歸零並標記 expired。
      const { data: commitRows, error: commitError } = await admin.rpc("commit_paid_entitlement", {
        p_order_id: currentOrder.id,
        p_user_id: currentOrder.user_id,
        p_plan_id: currentOrder.plan_id,
        p_credits: Number(currentOrder.plans.credits || 0),
        p_duration_days: Number(currentOrder.plans.duration_days || 30),
        p_ref_id: merchantTradeNo,
        // 加購只加點數、不延長效期。少了這個旗標，199 元的加購會被當成月方案，
        // 把整個訂閱效期往後多推 30 天。
        p_is_addon: Boolean(currentOrder.plans.is_addon)
      });
      if (commitError) throw commitError;

      const commit = (Array.isArray(commitRows) ? commitRows[0] : commitRows) as
        | { provisioned: boolean; entitlement_id: string; carried_credits: number; total_credits: number; expires_at: string }
        | undefined;
      if (!commit) throw new Error("commit_paid_entitlement 沒有回傳結果");

      // 重送通知時 provisioned=false，代表這張訂單先前已開通；不重寄信、不重發點。
      newlyProvisioned = commit.provisioned;
      if (commit.provisioned) {
        console.info("[notify] entitlement provisioned", {
          orderNo: currentOrder.order_no,
          carriedCredits: commit.carried_credits,
          totalCredits: commit.total_credits,
          expiresAt: commit.expires_at,
          recoveredAfterFailure: alreadyPaid
        });
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("name, email, phone")
        .eq("id", currentOrder.user_id)
        .maybeSingle();

      notification = {
        orderType: "membership",
        itemName: currentOrder.plans.name || (currentOrder as { item_name?: string | null }).item_name || currentOrder.order_no,
        customerName: profile?.name,
        customerEmail: profile?.email,
        customerPhone: profile?.phone
      };
    }

    // 只有這次真的完成開通／報名才寄信。綠界重送時 newlyProvisioned 為 false，
    // 否則使用者每收到一次重送就會多一封「付款成功」。
    if (notification && newlyProvisioned) {
      await sendOrderPaidEmails({
        orderNo: currentOrder.order_no,
        orderType: notification.orderType,
        itemName: notification.itemName,
        amount: Number(currentOrder.amount),
        currency: currentOrder.currency,
        paidAt: now.toISOString(),
        customerName: notification.customerName,
        customerEmail: notification.customerEmail,
        customerPhone: notification.customerPhone,
        adminExtra: notification.adminExtra
      }).catch((emailError) => {
        console.warn("[notify] order paid email failed", {
          orderId: currentOrder.id,
          error: emailError instanceof Error ? emailError.message : String(emailError)
        });
      });
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
        item_name: (currentOrder as { item_name?: string | null }).item_name,
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

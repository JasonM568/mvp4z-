import { NextRequest, NextResponse } from "next/server";
import { formDataToParams, verifyCheckMacValue } from "@/lib/payments/ecpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const params = formDataToParams(await request.formData());
  const valid = verifyCheckMacValue(params);
  const status = valid && String(params.RtnCode || "") === "1" ? "paid" : "pending";
  const orderNo = String(params.MerchantTradeNo || "");
  const redirectUrl = await paymentRedirectUrl(request, orderNo);
  const isCourse = redirectUrl.pathname === "/courses";
  redirectUrl.searchParams.set(isCourse ? "course_payment" : "payment", status);
  redirectUrl.searchParams.set("order", orderNo);
  if (isCourse) redirectUrl.hash = "courseCheckout";
  return NextResponse.redirect(redirectUrl, 303);
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(memberRedirectUrl(request), 303);
}

function memberRedirectUrl(request: NextRequest) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = configuredSiteUrl ? normalizeOrigin(configuredSiteUrl) : requestOrigin(request);
  return new URL("/member", origin);
}

async function paymentRedirectUrl(request: NextRequest, orderNo: string) {
  if (orderNo) {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from("orders")
        .select("order_type")
        .eq("order_no", orderNo)
        .maybeSingle();
      if (data?.order_type === "course") {
        const url = memberRedirectUrl(request);
        url.pathname = "/courses";
        return url;
      }
    } catch (error) {
      console.warn("[ecpay-return] failed to resolve order type", {
        orderNo,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return memberRedirectUrl(request);
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    url.protocol = "http:";
  }
  return url.origin;
}

function requestOrigin(request: NextRequest) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost || request.headers.get("host") || url.host;
  const protocol =
    host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http:"
      : `${forwardedProto || url.protocol.replace(":", "")}:`;
  return `${protocol}//${host}`;
}

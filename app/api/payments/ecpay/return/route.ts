import { NextRequest, NextResponse } from "next/server";
import { formDataToParams, verifyCheckMacValue } from "@/lib/payments/ecpay";

export async function POST(request: NextRequest) {
  const params = formDataToParams(await request.formData());
  const valid = verifyCheckMacValue(params);
  const status = valid && String(params.RtnCode || "") === "1" ? "paid" : "pending";
  const redirectUrl = memberRedirectUrl(request);
  redirectUrl.searchParams.set("payment", status);
  redirectUrl.searchParams.set("order", String(params.MerchantTradeNo || ""));
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

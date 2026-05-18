import { NextRequest, NextResponse } from "next/server";
import { formDataToParams, verifyCheckMacValue } from "@/lib/payments/ecpay";

export async function POST(request: NextRequest) {
  const params = formDataToParams(await request.formData());
  const valid = verifyCheckMacValue(params);
  const orderNo = encodeURIComponent(String(params.MerchantTradeNo || ""));
  const status = valid && String(params.RtnCode || "") === "1" ? "paid" : "pending";
  return NextResponse.redirect(new URL(`/member?payment=${status}&order=${orderNo}`, request.url));
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/member", request.url));
}

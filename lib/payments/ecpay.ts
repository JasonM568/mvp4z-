import crypto from "node:crypto";
import { getValidatedEcpayConfig } from "./ecpay-config";

const ECPAY_SORTER = new Intl.Collator("en-US").compare;

export type EcpayParams = Record<string, string | number>;

export function createCheckMacValue(params: EcpayParams) {
  const { hashKey, hashIv } = getValidatedEcpayConfig();
  const sorted = Object.entries(params)
    .filter(([key]) => key !== "CheckMacValue")
    .sort(([a], [b]) => ECPAY_SORTER(a, b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIv}`;
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replaceAll("%20", "+")
    .replaceAll("%2d", "-")
    .replaceAll("%5f", "_")
    .replaceAll("%2e", ".")
    .replaceAll("%21", "!")
    .replaceAll("%2a", "*")
    .replaceAll("%28", "(")
    .replaceAll("%29", ")");

  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyCheckMacValue(params: EcpayParams) {
  const expected = String(params.CheckMacValue || "");
  return expected === createCheckMacValue(params);
}

export function ecpayActionUrl() {
  return getValidatedEcpayConfig().actionUrl;
}

export function createMerchantTradeNo() {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join("");
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `XF${stamp}${random}`.slice(0, 20);
}

export function formatEcpayDate(date = new Date()) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function createCheckoutParams(input: {
  merchantTradeNo: string;
  totalAmount: number;
  itemName: string;
  tradeDesc?: string;
}) {
  const config = getValidatedEcpayConfig();
  const params: EcpayParams = {
    MerchantID: config.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: formatEcpayDate(),
    PaymentType: "aio",
    TotalAmount: input.totalAmount,
    TradeDesc: sanitizeEcpayText(input.tradeDesc || "Xunfeng Membership"),
    ItemName: sanitizeEcpayText(input.itemName),
    ReturnURL: config.notifyUrl,
    OrderResultURL: config.returnUrl,
    ClientBackURL: config.clientBackUrl,
    ChoosePayment: "ALL",
    EncryptType: 1
  };

  return {
    ...params,
    CheckMacValue: createCheckMacValue(params)
  };
}

export function formDataToParams(formData: FormData): EcpayParams {
  const params: EcpayParams = {};
  for (const [key, value] of formData.entries()) {
    params[key] = typeof value === "string" ? value : value.name;
  }
  return params;
}

function sanitizeEcpayText(value: string) {
  return value.replace(/[<>]/g, "").slice(0, 200);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

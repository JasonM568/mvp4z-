import crypto from "node:crypto";

const ECPAY_SORTER = new Intl.Collator("en-US").compare;

export type EcpayParams = Record<string, string | number>;

export function createCheckMacValue(params: EcpayParams) {
  const hashKey = requiredEnv("ECPAY_HASH_KEY");
  const hashIv = requiredEnv("ECPAY_HASH_IV");
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
  return process.env.ECPAY_ENV === "production"
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

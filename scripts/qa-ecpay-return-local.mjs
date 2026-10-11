// Local-only callback smoke. Start the local app with the QA stage ECPAY_* values below.
import crypto from "node:crypto";

const baseUrl = process.argv[2] || "http://127.0.0.1:3104";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl)) throw new Error("Use localhost only");
const hashKey = "qa_local_hash_key_0123456789";
const hashIv = "qa_local_hash_iv";

function mac(params) {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => new Intl.Collator("en-US").compare(a, b))
    .map(([key, value]) => `${key}=${value}`).join("&");
  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIv}`;
  const encoded = encodeURIComponent(raw).toLowerCase()
    .replaceAll("%20", "+").replaceAll("%2d", "-").replaceAll("%5f", "_")
    .replaceAll("%2e", ".").replaceAll("%21", "!").replaceAll("%2a", "*")
    .replaceAll("%28", "(").replaceAll("%29", ")");
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

const signed = { RtnCode: "1", MerchantTradeNo: "QA-NO-ORDER" };
const cases = [
  ["GET no params", "GET", null, null, null],
  ["POST empty", "POST", {}, "pending", ""],
  ["POST forged paid", "POST", { RtnCode: "1", MerchantTradeNo: "QA-INVALID", CheckMacValue: "BAD" }, "pending", "QA-INVALID"],
  ["POST hostile order no", "POST", { RtnCode: "1", MerchantTradeNo: "QA-<script>alert(1)</script>", CheckMacValue: "BAD" }, "pending", "QA-<script>alert(1)</script>"],
  ["POST signed no-order", "POST", { ...signed, CheckMacValue: mac(signed) }, "paid", "QA-NO-ORDER"]
];

let passed = 0;
for (const [label, method, form, payment, order] of cases) {
  const response = await fetch(`${baseUrl}/api/payments/ecpay/return`, {
    method,
    body: form === null ? undefined : new URLSearchParams(form),
    redirect: "manual"
  });
  const location = response.headers.get("location");
  const url = location ? new URL(location) : null;
  const ok = response.status === 303 && url?.origin === baseUrl && url.pathname === "/member" &&
    (payment === null || url.searchParams.get("payment") === payment) &&
    (order === null || url.searchParams.get("order") === order);
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${response.status}, location=${location?.slice(0, 180)}`);
}
console.log(`${passed}/${cases.length} ECPay return checks passed`);
if (passed !== cases.length) process.exitCode = 1;

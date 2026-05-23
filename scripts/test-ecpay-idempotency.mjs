import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));
loadEnvFile(args.envFile || ".env.local");

const baseUrl = (args.baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const orderNo = requireArg(args.orderNo, "--order-no");
const tradeNo = args.tradeNo || `TEST${Date.now()}`;
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const order = await getOrder(orderNo);
const amount = Number(order.amount);
const payload = {
  MerchantTradeNo: orderNo,
  TradeNo: tradeNo,
  RtnCode: "1",
  RtnMsg: "Succeeded",
  TradeAmt: String(amount)
};
payload.CheckMacValue = createCheckMacValue(payload);

const before = await snapshot(order.id, orderNo);
const first = await postNotify(payload);
if (first.status !== 200 || first.body !== "1|OK") {
  throw new Error(`First notify failed: ${first.status} ${first.body}`);
}

const afterFirst = await snapshot(order.id, orderNo);
const second = await postNotify(payload);
if (second.status !== 200 || second.body !== "1|OK") {
  throw new Error(`Second notify failed: ${second.status} ${second.body}`);
}

const afterSecond = await snapshot(order.id, orderNo);
assertUnchanged("payments", afterFirst.payments, afterSecond.payments);
assertUnchanged("entitlements", afterFirst.entitlements, afterSecond.entitlements);
assertUnchanged("creditTransactions", afterFirst.creditTransactions, afterSecond.creditTransactions);

console.log(JSON.stringify({
  ok: true,
  orderNo,
  tradeNo,
  before,
  afterFirst,
  afterSecond
}, null, 2));

async function getOrder(value) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, amount")
    .eq("order_no", value)
    .single();

  if (error) throw error;
  return data;
}

async function postNotify(payloadValue) {
  const body = new URLSearchParams(payloadValue);
  const response = await fetch(`${baseUrl}/api/payments/ecpay/notify`, {
    method: "POST",
    body
  });
  return {
    status: response.status,
    body: await response.text()
  };
}

async function snapshot(orderId, merchantTradeNo) {
  const [payments, entitlements, creditTransactions] = await Promise.all([
    count("payments", "merchant_trade_no", merchantTradeNo),
    count("member_entitlements", "source_order_id", orderId),
    count("credit_transactions", "ref_id", merchantTradeNo)
  ]);

  return { payments, entitlements, creditTransactions };
}

async function count(table, column, value) {
  const { count: valueCount, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) throw error;
  return valueCount || 0;
}

function assertUnchanged(label, firstValue, secondValue) {
  if (firstValue !== secondValue) {
    throw new Error(`${label} changed after duplicate notify: ${firstValue} -> ${secondValue}`);
  }
}

function createCheckMacValue(params) {
  const hashKey = requiredEnv("ECPAY_HASH_KEY");
  const hashIv = requiredEnv("ECPAY_HASH_IV");
  const sorted = Object.entries(params)
    .filter(([key]) => key !== "CheckMacValue")
    .sort(([a], [b]) => a.localeCompare(b, "en-US"))
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

function loadEnvFile(path) {
  if (!path || !fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function requiredEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

function requireArg(value, label) {
  if (!value) throw new Error(`Missing required argument: ${label}`);
  return value;
}

// 驗證 ATM/CVS/BARCODE 取號成功通知（RtnCode=2 + PaymentType=ATM_xxx）的行為：
//   - order.status 維持 pending（不被誤改為 failed）
//   - payments 表新增一筆 status=allocated 的 audit row
//   - member_entitlements 沒新增（未付款不應發點）
//   - credit_transactions 沒新增
//   - 重送同樣 webhook（idempotency）payments 不會重複
//
// 用法：
//   npm run test:ecpay-atm-allocation -- --base-url=https://www.xunfeng.tw --order-no=XF20260526XXXX
//
// 對應修法：app/api/payments/ecpay/notify/route.ts 的 isAsyncAllocation 分支
// 對應綠界文件：AIO V5 ATM/CVS/BARCODE Async Payment Result

import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));
loadEnvFile(args.envFile || ".env.local");

const baseUrl = (args.baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const orderNo = requireArg(args.orderNo, "--order-no");
const tradeNo = args.tradeNo || `TESTATM${Date.now()}`;
const paymentType = args.paymentType || "ATM_TAISHIN";
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const order = await getOrder(orderNo);
if (order.status !== "pending") {
  throw new Error(`Order ${orderNo} status is ${order.status}, expected pending (allocation 測試需要 pending order)`);
}

const amount = Number(order.amount);
const payload = {
  MerchantTradeNo: orderNo,
  TradeNo: tradeNo,
  RtnCode: "2",
  RtnMsg: "Get VirtualAccount Succeeded",
  PaymentType: paymentType,
  TradeAmt: String(amount),
  BankCode: "812",
  vAccount: "9990123456789012",
  ExpireDate: "2026/06/02"
};
payload.CheckMacValue = createCheckMacValue(payload);

const before = await snapshot(order.id, orderNo);
const first = await postNotify(payload);
if (first.status !== 200 || first.body !== "1|OK") {
  throw new Error(`First allocation notify failed: ${first.status} ${first.body}`);
}

const afterFirst = await snapshot(order.id, orderNo);

// 1. order.status 維持 pending
if (afterFirst.orderStatus !== "pending") {
  throw new Error(`order.status 應該維持 pending，實際: ${afterFirst.orderStatus}`);
}

// 2. payments 新增一筆 status=allocated
if (afterFirst.payments !== before.payments + 1) {
  throw new Error(`payments 應新增 1 筆，實際: ${before.payments} → ${afterFirst.payments}`);
}
const allocationRow = await getLatestPayment(orderNo);
if (allocationRow.status !== "allocated") {
  throw new Error(`payments.status 應為 allocated，實際: ${allocationRow.status}`);
}

// 3. entitlements 沒新增
if (afterFirst.entitlements !== before.entitlements) {
  throw new Error(`entitlements 不應新增，實際: ${before.entitlements} → ${afterFirst.entitlements}`);
}

// 4. credit_transactions 沒新增
if (afterFirst.creditTransactions !== before.creditTransactions) {
  throw new Error(`credit_transactions 不應新增，實際: ${before.creditTransactions} → ${afterFirst.creditTransactions}`);
}

// 5. 重送 idempotency：payments 不會重複（onConflict upsert）
const second = await postNotify(payload);
if (second.status !== 200 || second.body !== "1|OK") {
  throw new Error(`Second allocation notify failed: ${second.status} ${second.body}`);
}
const afterSecond = await snapshot(order.id, orderNo);
if (afterSecond.payments !== afterFirst.payments) {
  throw new Error(`重送 webhook payments 應不變，實際: ${afterFirst.payments} → ${afterSecond.payments}`);
}

console.log(JSON.stringify({
  ok: true,
  orderNo,
  tradeNo,
  paymentType,
  before,
  afterFirst,
  afterSecond,
  allocationRowStatus: allocationRow.status
}, null, 2));

async function getOrder(value) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, amount, status")
    .eq("order_no", value)
    .single();
  if (error) throw error;
  return data;
}

async function getLatestPayment(merchantTradeNo) {
  const { data, error } = await supabase
    .from("payments")
    .select("status, raw_payload")
    .eq("merchant_trade_no", merchantTradeNo)
    .order("received_at", { ascending: false })
    .limit(1)
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
  return { status: response.status, body: await response.text() };
}

async function snapshot(orderId, merchantTradeNo) {
  const [payments, entitlements, creditTransactions, orderRow] = await Promise.all([
    count("payments", "merchant_trade_no", merchantTradeNo),
    count("member_entitlements", "source_order_id", orderId),
    count("credit_transactions", "ref_id", merchantTradeNo),
    getOrderStatus(orderId)
  ]);
  return { payments, entitlements, creditTransactions, orderStatus: orderRow };
}

async function getOrderStatus(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data.status;
}

async function count(table, column, value) {
  const { count: valueCount, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return valueCount || 0;
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

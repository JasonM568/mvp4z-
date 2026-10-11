#!/usr/bin/env node
// Isolated local-only payment accounting regression. Creates and deletes its own orders.
// Usage: node scripts/qa-ecpay-notify-accounting-local.mjs --base-url=http://127.0.0.1:3101 \
//   --env-file=/private/connection.private.env \
//   --app-env-file=/private/run-local-c4-app.sh

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
const envFile = args["env-file"];
const appEnvFile = args["app-env-file"];
if (!baseUrl || !envFile || !appEnvFile) {
  throw new Error("Provide --base-url, --env-file and --app-env-file");
}
for (const url of [baseUrl]) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) throw new Error("Refusing non-local app URL");
}

const local = await parseEnv(envFile);
const app = await parseEnv(appEnvFile);
const restUrl = local.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")) {
  throw new Error("Refusing non-local Supabase REST URL");
}
const serviceKey = required(local.SERVICE_ROLE_KEY, "local service key");
const dbUrl = new URL(required(local.DB_URL, "local DB URL"));
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname)) throw new Error("Refusing non-local DB URL");
if (app.ECPAY_ENV !== "stage" || !/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(app.ECPAY_NOTIFY_URL || "")) {
  throw new Error("Refusing non-stage/non-local ECPay configuration");
}
const hashKey = required(app.ECPAY_HASH_KEY, "ECPay hash key");
const hashIv = required(app.ECPAY_HASH_IV, "ECPay hash IV");
const [plan] = await db("plans?select=id&limit=1", { method: "GET" });
if (!plan?.id) throw new Error("Local QA plan is missing");
const [profile] = await db("profiles", { method: "POST", body: [{
  email: `qa-c4-${crypto.randomBytes(8).toString("hex")}@example.test`,
  name: "QA C4 isolated", role: "member"
}] });
const userId = required(profile?.id, "local QA profile");

const failures = [];
try {
for (const scenario of ["amount-mismatch", "paid-then-failed", "paid-duplicate", "provider-conflict"]) {
  const orderNo = `QA${Date.now()}${crypto.randomBytes(2).toString("hex")}`;
  const tradeNo = `${orderNo}T`;
  let orderId;
  let occupiedOrderId;
  try {
    const [order] = await db("orders", {
      method: "POST",
      body: [{ order_no: orderNo, user_id: userId, plan_id: plan.id, amount: 980,
        currency: "TWD", status: scenario === "paid-then-failed" ? "paid" : "pending",
        provider: "ecpay", legacy_no_invoice: true }]
    });
    orderId = order.id;
    if (scenario === "provider-conflict") {
      const occupiedOrderNo = `${orderNo}X`;
      const [occupiedOrder] = await db("orders", {
        method: "POST",
        body: [{ order_no: occupiedOrderNo, user_id: userId, plan_id: plan.id, amount: 980,
          currency: "TWD", status: "paid", provider: "ecpay", legacy_no_invoice: true }]
      });
      occupiedOrderId = occupiedOrder.id;
      await db("payments", { method: "POST", body: [{ order_id: occupiedOrderId, provider: "ecpay",
        merchant_trade_no: occupiedOrderNo, provider_trade_no: tradeNo, amount: 980,
        status: "paid", check_mac_valid: true, raw_payload: { qa: true } }] });
    }
    if (scenario === "paid-then-failed") {
      await db("payments", {
        method: "POST",
        body: [{ order_id: orderId, provider: "ecpay", merchant_trade_no: orderNo,
          provider_trade_no: tradeNo, amount: 980, status: "paid", check_mac_valid: true,
          raw_payload: { qa: true } }]
      });
    }

    const params = {
      MerchantTradeNo: orderNo,
      TradeNo: tradeNo,
      RtnCode: scenario === "paid-then-failed" ? "0" : "1",
      RtnMsg: scenario === "paid-then-failed" ? "Failed" : "Succeeded",
      TradeAmt: scenario === "amount-mismatch" ? "979" : "980"
    };
    params.CheckMacValue = createCheckMacValue(params);
    const responses = await Promise.all(Array.from({ length: scenario === "paid-duplicate" ? 10 : 1 }, () =>
      fetch(`${baseUrl}/api/payments/ecpay/notify`, { method: "POST", body: new URLSearchParams(params) })
    ));
    const errorBodies = await Promise.all(responses.filter((response) => response.status >= 500)
      .map(async (response) => (await response.text()).slice(0, 180)));
    const paymentRows = await db(`payments?select=status,amount&merchant_trade_no=eq.${orderNo}`, { method: "GET" });
    const events = await db(`payment_notification_events?select=notification_status,amount,amount_matches,check_mac_valid&merchant_trade_no=eq.${orderNo}`, { method: "GET" });
    const [orderAfter] = await db(`orders?select=status&order_no=eq.${orderNo}`, { method: "GET" });
    const occupiedPayments = occupiedOrderId
      ? await db(`payments?select=status,amount&order_id=eq.${occupiedOrderId}`, { method: "GET" })
      : [];
    const occupiedOrders = occupiedOrderId
      ? await db(`orders?select=status&id=eq.${occupiedOrderId}`, { method: "GET" })
      : [];
    const entitlements = await db(`member_entitlements?select=id&source_order_id=eq.${orderId}`, { method: "GET" });
    const transactions = await db(`credit_transactions?select=id&ref_id=eq.${orderNo}`, { method: "GET" });
    const invoices = await db(`invoices?select=id&order_id=eq.${orderId}`, { method: "GET" });
    const payment = paymentRows[0];
    const expectedEvents = scenario === "paid-duplicate" ? 10 : 1;
    const auditOk = events.length === expectedEvents && events.every((event) =>
      event.check_mac_valid === true
      && event.notification_status === (scenario === "paid-then-failed" ? "failed" : "paid")
      && event.amount === (scenario === "amount-mismatch" ? 979 : 980)
      && event.amount_matches === (scenario !== "amount-mismatch")
    );
    const canonicalOk = scenario === "amount-mismatch"
      ? responses.every((response) => response.status === 400) && payment?.status !== "paid" && orderAfter?.status === "pending"
      : scenario === "provider-conflict"
      ? responses.every((response) => response.status === 409) && !payment && orderAfter?.status === "pending"
        && occupiedPayments.length === 1 && occupiedPayments[0].status === "paid"
        && occupiedPayments[0].amount === 980 && occupiedOrders.length === 1 && occupiedOrders[0].status === "paid"
      : responses.every((response) => response.status === 200) && payment?.status === "paid" && payment?.amount === 980 && orderAfter?.status === "paid";
    const entitlementOk = scenario === "paid-duplicate"
      ? entitlements.length === 1 && transactions.length === 1 && invoices.length === 0
      : entitlements.length === 0 && transactions.length === 0 && invoices.length === 0;
    const ok = auditOk && canonicalOk && entitlementOk;
    console.log(`${ok ? "PASS" : "FAIL"} ${scenario}: HTTP ${responses.map((r) => r.status).join("/")}, payment=${payment?.status || "none"}, order=${orderAfter?.status || "none"}, audit=${events.length}, entitlements=${entitlements.length}, transactions=${transactions.length}`);
    for (const body of errorBodies) console.log(`  server error: ${body}`);
    if (!ok) failures.push(scenario);
  } finally {
    if (orderId) {
      // The new notification audit is append-only to service_role and has an order FK.
      // Remove only this local QA order's events with the local DB owner before deleting the order.
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Invalid local QA order id");
      const cleanupSql = `do $$ begin if to_regclass('public.payment_notification_events') is not null then delete from public.payment_notification_events where order_id = '${orderId}'; end if; end $$;`;
      execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", cleanupSql], {
        env: { ...process.env, PGHOST: dbUrl.hostname, PGPORT: dbUrl.port,
          PGUSER: decodeURIComponent(dbUrl.username), PGPASSWORD: decodeURIComponent(dbUrl.password),
          PGDATABASE: dbUrl.pathname.slice(1) }, stdio: "pipe"
      });
      await db(`credit_transactions?ref_id=eq.${orderNo}`, { method: "DELETE" });
      await db(`member_entitlements?source_order_id=eq.${orderId}`, { method: "DELETE" });
      await db(`invoices?order_id=eq.${orderId}`, { method: "DELETE" });
      await db(`payments?order_id=eq.${orderId}`, { method: "DELETE" });
      await db(`orders?id=eq.${orderId}`, { method: "DELETE" });
      const remainingOrders = await db(`orders?select=id&id=eq.${orderId}`, { method: "GET" });
      const remainingPayments = await db(`payments?select=id&order_id=eq.${orderId}`, { method: "GET" });
      const remainingEvents = await db(`payment_notification_events?select=id&order_id=eq.${orderId}`, { method: "GET" });
      const remainingEntitlements = await db(`member_entitlements?select=id&source_order_id=eq.${orderId}`, { method: "GET" });
      const remainingTransactions = await db(`credit_transactions?select=id&ref_id=eq.${orderNo}`, { method: "GET" });
      if (remainingOrders.length || remainingPayments.length || remainingEvents.length || remainingEntitlements.length || remainingTransactions.length) {
        throw new Error("Local QA cleanup incomplete");
      }
    }
    if (occupiedOrderId) {
      await db(`payments?order_id=eq.${occupiedOrderId}`, { method: "DELETE" });
      await db(`orders?id=eq.${occupiedOrderId}`, { method: "DELETE" });
      const occupiedPayments = await db(`payments?select=id&order_id=eq.${occupiedOrderId}`, { method: "GET" });
      const occupiedOrders = await db(`orders?select=id&id=eq.${occupiedOrderId}`, { method: "GET" });
      if (occupiedPayments.length || occupiedOrders.length) throw new Error("Local conflict fixture cleanup incomplete");
    }
  }
}
console.log(`${4 - failures.length}/4 isolated ECPay accounting checks passed`);
if (failures.length) process.exitCode = 1;
} finally {
  await db(`profiles?id=eq.${userId}`, { method: "DELETE" });
  const remainingProfile = await db(`profiles?select=id&id=eq.${userId}`, { method: "GET" });
  if (remainingProfile.length) throw new Error("Local QA profile cleanup incomplete");
}

async function db(path, { method, body }) {
  const response = await fetch(`${restUrl}/${path}`, {
    method,
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json", Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function parseEnv(path) {
  return Object.fromEntries((await readFile(path, "utf8")).split(/\r?\n/)
    .filter((line) => /^(?:export )?[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => {
      line = line.replace(/^export /, "");
      const split = line.indexOf("=");
      return [line.slice(0, split), line.slice(split + 1).replace(/^["']|["']$/g, "")];
    }));
}

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function createCheckMacValue(params) {
  const sorted = Object.entries(params)
    .filter(([key]) => key !== "CheckMacValue")
    .sort(([a], [b]) => a.localeCompare(b, "en-US"))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const encoded = encodeURIComponent(`HashKey=${hashKey}&${sorted}&HashIV=${hashIv}`)
    .toLowerCase().replaceAll("%20", "+").replaceAll("%2d", "-")
    .replaceAll("%5f", "_").replaceAll("%2e", ".").replaceAll("%21", "!")
    .replaceAll("%2a", "*").replaceAll("%28", "(").replaceAll("%29", ")");
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

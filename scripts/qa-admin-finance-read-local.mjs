#!/usr/bin/env node
// Local-only named-admin order/invoice list and detail read regression. No payments are triggered.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!args["env-file"] || !args["members-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url, --env-file and --members-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members?.[0];
if (!member?.access_token || !member?.profile_id) throw new Error("Missing local QA member");
const [plan] = await db("plans?select=id&code=eq.vip&limit=1", "GET");
if (!plan?.id) throw new Error("Local vip plan fixture missing");
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-finance-admin-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const orderNo = `QAFIN${suffix.toUpperCase()}`;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let authUserId, adminProfileId, orderId, invoiceId, token;
let passed = 0;
function check(ok, label) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [adminProfile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Finance Admin", role: "admin" }]);
  adminProfileId = adminProfile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  const [order] = await db("orders", "POST", [{ order_no: orderNo, user_id: member.profile_id,
    plan_id: plan.id, amount: 980, currency: "TWD", status: "pending", provider: "ecpay" }]);
  orderId = order.id;
  const [invoice] = await db("invoices", "POST", [{ order_id: orderId, user_id: member.profile_id,
    buyer_type: "personal", buyer_name: "QA Finance", total_amount: 980, status: "pending" }]);
  invoiceId = invoice.id;

  for (const route of ["/api/admin/orders", "/api/admin/invoices"]) {
    check((await api(route, "")).status === 401, `anonymous ${route} rejected 401`);
    check((await api(route, member.access_token)).status === 403, `member ${route} rejected 403`);
  }
  const orderList = await api("/api/admin/orders", token);
  check(orderList.status === 200 && orderList.body.orders?.some((row) => row.id === orderId),
    "admin order list includes isolated pending order");
  const invoiceList = await api("/api/admin/invoices", token);
  check(invoiceList.status === 200 && invoiceList.body.invoices?.some((row) => row.id === invoiceId
    && row.order_id === orderId), "admin invoice list joins isolated pending invoice");
  const detail = await api(`/api/admin/orders?id=${orderId}`, token);
  check(detail.status === 200 && detail.body.order?.id === orderId
    && detail.body.order.invoices?.length === 1 && detail.body.order.invoices[0].id === invoiceId
    && Array.isArray(detail.body.order.payments) && detail.body.order.payments.length === 0,
    "admin detail reconciles pending order and invoice without payment");
  const absent = await api(`/api/admin/orders?id=${crypto.randomUUID()}`, token);
  check(absent.status === 404, "unknown order UUID returns 404");
  for (const [label, id] of [["malformed", "not-a-uuid"], ["SQLi-shaped", "' OR 1=1 --"],
    ["oversize", "x".repeat(10000)]]) {
    const response = await api(`/api/admin/orders?id=${encodeURIComponent(id)}`, token);
    check([400, 404].includes(response.status), `${label} order id rejected 4xx (actual ${response.status})`);
  }
} finally {
  if (invoiceId) await db(`invoices?id=eq.${invoiceId}`, "DELETE");
  if (orderId) await db(`orders?id=eq.${orderId}`, "DELETE");
  if (adminProfileId) await db(`profiles?id=eq.${adminProfileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
for (const [table, id] of [["invoices", invoiceId], ["orders", orderId], ["profiles", adminProfileId]]) {
  if ((await db(`${table}?select=id&id=eq.${id}`, "GET")).length) throw new Error(`${table} QA fixture remains`);
}
console.log(`${passed}/11 admin finance read checks passed; fixtures cleaned`);
if (passed !== 11) process.exitCode = 1;

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, bearer) {
  const response = await fetch(`${baseUrl}${path}`, { headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
  } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

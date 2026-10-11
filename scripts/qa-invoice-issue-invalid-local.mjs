#!/usr/bin/env node
// Local-only paid-order input validation. Every request is invalid; no ezPay call is allowed.
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
const email = `qa-invoice-issue-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let authUserId, adminProfileId, orderId, token;
let passed = 0;
function check(ok, label) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [adminProfile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Invoice Admin", role: "admin" }]);
  adminProfileId = adminProfile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  const [order] = await db("orders", "POST", [{ order_no: `QAINV${suffix.toUpperCase()}`,
    user_id: member.profile_id, plan_id: plan.id, amount: 980, currency: "TWD", status: "paid",
    provider: "ecpay", invoice_request: { buyer_type: "personal", buyer_name: "Saved Buyer" } }]);
  orderId = order.id;
  const route = `/api/admin/invoices/${orderId}/issue`;
  check((await api(route, "", "{} ")).status === 401, "anonymous cannot issue paid-order invoice");
  check((await api(route, member.access_token, "{} ")).status === 403, "member cannot issue paid-order invoice");

  for (const [label, body] of [
    ["bad company ID", JSON.stringify({ buyer: { buyer_type: "company", buyer_name: "QA", buyer_id: "1234567" } })],
    ["malformed JSON", "{broken-json"],
    ["invalid carrier", JSON.stringify({ buyer: { buyer_type: "personal", buyer_name: "QA", carrier_type: "cellphone", carrier_num: "abc" } })],
    ["oversize buyer name", JSON.stringify({ buyer: { buyer_type: "personal", buyer_name: "x".repeat(61) } })]
  ]) check((await api(route, token, body)).status === 400, `${label} rejected 400 before issue`);

  const invoices = await db(`invoices?select=id&order_id=eq.${orderId}`, "GET");
  const audits = await db(`admin_audit_logs?select=id&target_id=eq.${orderId}`, "GET");
  const [after] = await db(`orders?select=status,invoice_request&id=eq.${orderId}`, "GET");
  check(invoices.length === 0 && audits.length === 0 && after.status === "paid"
    && after.invoice_request?.buyer_name === "Saved Buyer", "invalid requests leave invoice, audit and order unchanged");
} finally {
  if (orderId) await db(`orders?id=eq.${orderId}`, "DELETE");
  if (adminProfileId) await db(`profiles?id=eq.${adminProfileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
for (const [table, id] of [["orders", orderId], ["profiles", adminProfileId]]) {
  if ((await db(`${table}?select=id&id=eq.${id}`, "GET")).length) throw new Error(`${table} QA fixture remains`);
}
console.log(`${passed}/7 invoice invalid-input checks passed; fixtures cleaned`);
if (passed !== 7) process.exitCode = 1;

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, bearer, body) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json"
  }, body });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

#!/usr/bin/env node
// Local-only member order/usage API ownership and payment polling regression.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

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
    || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2 || members.some((member) => !member.profile_id || !member.access_token)) {
  throw new Error("Expected two valid local QA members");
}
const [plan] = await db("plans?select=id&code=eq.vip&limit=1");
if (!plan?.id) throw new Error("Local vip plan fixture missing");
const tag = `QAMREAD${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
const created = { orders: [], usage_logs: [], member_entitlements: [] };
let passed = 0;
function check(ok, label) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); passed++; }

try {
  const [pendingA] = await db("orders", "POST", [{ order_no: `${tag}A`, user_id: members[0].profile_id,
    plan_id: plan.id, amount: 980, currency: "TWD", status: "pending" }]);
  const [paidA] = await db("orders", "POST", [{ order_no: `${tag}P`, user_id: members[0].profile_id,
    plan_id: plan.id, amount: 980, currency: "TWD", status: "paid" }]);
  const [pendingB] = await db("orders", "POST", [{ order_no: `${tag}B`, user_id: members[1].profile_id,
    plan_id: plan.id, amount: 980, currency: "TWD", status: "pending" }]);
  created.orders.push(pendingA.id, paidA.id, pendingB.id);
  const [usageA] = await db("usage_logs", "POST", [{ user_id: members[0].profile_id,
    type: "qa", prompt: `${tag}A`, reply: "QA own answer" }]);
  const [usageB] = await db("usage_logs", "POST", [{ user_id: members[1].profile_id,
    type: "qa", prompt: `${tag}B`, reply: "QA other answer" }]);
  created.usage_logs.push(usageA.id, usageB.id);

  for (const route of ["/api/member/orders", "/api/member/usage"]) {
    check((await api(route, "")).status === 401, `anonymous ${route} rejected 401`);
    check((await api(route, "invalid-token")).status === 401, `invalid token ${route} rejected 401`);
  }
  const ordersA = await api("/api/member/orders", members[0].access_token);
  const ordersB = await api("/api/member/orders", members[1].access_token);
  const aItems = ordersA.body.items || [];
  const bItems = ordersB.body.items || [];
  check(ordersA.status === 200 && aItems.some((item) => item.order_no === `${tag}A` && !item.activated)
    && aItems.some((item) => item.order_no === `${tag}P` && !item.activated)
    && !aItems.some((item) => item.order_no === `${tag}B`), "member A sees own pending/unprovisioned paid orders only");
  check(ordersB.status === 200 && bItems.some((item) => item.order_no === `${tag}B` && !item.activated)
    && !bItems.some((item) => item.order_no === `${tag}A` || item.order_no === `${tag}P`),
    "member B cannot see A orders");

  const ownPoll = await api(`/api/member/orders?order_no=${tag}P`, members[0].access_token);
  const otherPoll = await api(`/api/member/orders?order_no=${tag}P`, members[1].access_token);
  check(ownPoll.status === 200 && ownPoll.body.items?.length === 1 && !ownPoll.body.items[0].activated
    && otherPoll.status === 200 && otherPoll.body.items?.length === 0,
    "payment-return polling is scoped to owner and shows paid but not yet activated");

  const [entitlement] = await db("member_entitlements", "POST", [{ user_id: members[0].profile_id,
    plan_id: plan.id, source_order_id: paidA.id, status: "active", credits_remaining: 20,
    expires_at: new Date(Date.now() + 86400000).toISOString() }]);
  created.member_entitlements.push(entitlement.id);
  const provisioned = await api(`/api/member/orders?order_no=${tag}P`, members[0].access_token);
  check(provisioned.status === 200 && provisioned.body.items?.length === 1
    && provisioned.body.items[0].activated === true, "payment-return polling flips activated after entitlement exists");
  const injection = await api(`/api/member/orders?order_no=${encodeURIComponent("' OR 1=1 --")}`,
    members[0].access_token);
  check(injection.status === 200 && injection.body.items?.length === 0, "SQLi-shaped order number returns no rows");

  const usageReadA = await api("/api/member/usage", members[0].access_token);
  const usageReadB = await api("/api/member/usage", members[1].access_token);
  check(usageReadA.status === 200 && usageReadA.body.usage?.some((item) => item.id === usageA.id)
    && !usageReadA.body.usage.some((item) => item.id === usageB.id), "member A usage excludes B");
  check(usageReadB.status === 200 && usageReadB.body.usage?.some((item) => item.id === usageB.id)
    && !usageReadB.body.usage.some((item) => item.id === usageA.id), "member B usage excludes A");
} finally {
  for (const table of ["member_entitlements", "usage_logs", "orders"]) {
    for (const id of created[table]) await db(`${table}?id=eq.${id}`, "DELETE");
  }
}
for (const [table, ids] of Object.entries(created)) {
  for (const id of ids) {
    if ((await db(`${table}?select=id&id=eq.${id}`)).length) throw new Error(`${table} QA fixture remains`);
  }
}
console.log(`${passed}/11 member order/usage API checks passed; fixtures cleaned`);
if (passed !== 11) process.exitCode = 1;

async function db(path, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, bearer) {
  const response = await fetch(`${baseUrl}${path}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

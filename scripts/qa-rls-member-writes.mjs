#!/usr/bin/env node
// Direct PostgREST write-isolation checks against a disposable local Supabase only.
// Usage: node scripts/qa-rls-member-writes.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
if (!args["env-file"] || !args["members-file"]) throw new Error("Provide --env-file and --members-file");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !env.ANON_KEY || !env.SERVICE_ROLE_KEY || members.length !== 2) {
  throw new Error("Expected local Supabase REST, both keys and two QA members");
}

const [a, b] = members;
const tag = `QA-RLS-${crypto.randomBytes(6).toString("hex")}`;
const ownProfile = (await request("profiles?select=id,name&id=eq." + a.profile_id, { key: env.SERVICE_ROLE_KEY })).body[0];
const otherProfile = (await request("profiles?select=id,name&id=eq." + b.profile_id, { key: env.SERVICE_ROLE_KEY })).body[0];
const plan = (await request("plans?select=id&limit=1", { key: env.SERVICE_ROLE_KEY })).body[0];
if (!ownProfile || !otherProfile || !plan) throw new Error("Missing isolated QA fixtures");
const orderNo = `${tag}-ORDER`;
const directOrderId = crypto.randomUUID();
const entitlementId = crypto.randomUUID();
const transactionId = crypto.randomUUID();
let fixtureOrderId;
let checks = 0;

try {
  const made = await request("orders", { key: env.SERVICE_ROLE_KEY, method: "POST", body: [{
    order_no: orderNo, user_id: b.profile_id, plan_id: plan.id, amount: 980,
    status: "pending", provider: "ecpay"
  }] });
  if (made.status !== 201 || made.body.length !== 1) throw new Error("Cannot create isolated order fixture");
  fixtureOrderId = made.body[0].id;

  // A cannot alter either their own or B's profile through raw PostgREST.
  for (const [label, target] of [["own", ownProfile], ["other", otherProfile]]) {
    await request(`profiles?id=eq.${target.id}`, { key: env.ANON_KEY, token: a.access_token,
      method: "PATCH", body: { name: tag } });
    const after = (await request(`profiles?select=name&id=eq.${target.id}`, { key: env.SERVICE_ROLE_KEY })).body[0];
    assert(after.name === target.name, `profile ${label} changed by member token`);
    console.log(`PASS profile ${label} PATCH: no DB change`); checks++;
  }

  await request(`orders?id=eq.${fixtureOrderId}`, { key: env.ANON_KEY, token: a.access_token,
    method: "PATCH", body: { status: "paid" } });
  const orderAfter = (await request(`orders?select=status&id=eq.${fixtureOrderId}`, { key: env.SERVICE_ROLE_KEY })).body[0];
  assert(orderAfter.status === "pending", "other member order status changed");
  console.log("PASS other order PATCH: no DB change"); checks++;

  const orderInsert = await request("orders", { key: env.ANON_KEY, token: a.access_token, method: "POST", body: [{
    id: directOrderId, order_no: `${tag}-DIRECT`, user_id: a.profile_id,
    plan_id: plan.id, amount: 1, status: "paid", provider: "ecpay"
  }] });
  const directOrders = (await request(`orders?select=id&id=eq.${directOrderId}`, { key: env.SERVICE_ROLE_KEY })).body;
  assert(orderInsert.status >= 400 && directOrders.length === 0, "member inserted a paid order directly");
  console.log(`PASS direct paid order INSERT: HTTP ${orderInsert.status}, 0 rows`); checks++;

  const entitlementInsert = await request("member_entitlements", { key: env.ANON_KEY, token: a.access_token,
    method: "POST", body: [{ id: entitlementId, user_id: a.profile_id, plan_id: plan.id,
      credits_remaining: 9999, expires_at: new Date(Date.now() + 86_400_000).toISOString() }] });
  const entitlements = (await request(`member_entitlements?select=id&id=eq.${entitlementId}`, { key: env.SERVICE_ROLE_KEY })).body;
  assert(entitlementInsert.status >= 400 && entitlements.length === 0, "member granted own entitlement directly");
  console.log(`PASS direct entitlement INSERT: HTTP ${entitlementInsert.status}, 0 rows`); checks++;

  const creditInsert = await request("credit_transactions", { key: env.ANON_KEY, token: a.access_token,
    method: "POST", body: [{ id: transactionId, user_id: a.profile_id, type: "grant",
      amount: 9999, balance_after: 9999, source: tag }] });
  const transactions = (await request(`credit_transactions?select=id&id=eq.${transactionId}`, { key: env.SERVICE_ROLE_KEY })).body;
  assert(creditInsert.status >= 400 && transactions.length === 0, "member granted own credit transaction directly");
  console.log(`PASS direct credit transaction INSERT: HTTP ${creditInsert.status}, 0 rows`); checks++;
} finally {
  // Restore fixtures even if an access-control regression changes them.
  for (const profile of [ownProfile, otherProfile]) {
    await request(`profiles?id=eq.${profile.id}`, { key: env.SERVICE_ROLE_KEY,
      method: "PATCH", body: { name: profile.name } });
  }
  for (const [table, id] of [["credit_transactions", transactionId], ["member_entitlements", entitlementId],
    ["orders", directOrderId], ["orders", fixtureOrderId]]) {
    if (id) await request(`${table}?id=eq.${id}`, { key: env.SERVICE_ROLE_KEY, method: "DELETE" });
  }
}
for (const profile of [ownProfile, otherProfile]) {
  const after = (await request(`profiles?select=name&id=eq.${profile.id}`, { key: env.SERVICE_ROLE_KEY })).body[0];
  assert(after?.name === profile.name, "QA profile fixture was not restored");
}
for (const [table, id] of [["credit_transactions", transactionId], ["member_entitlements", entitlementId],
  ["orders", directOrderId], ["orders", fixtureOrderId]]) {
  if (!id) continue;
  const rows = (await request(`${table}?select=id&id=eq.${id}`, { key: env.SERVICE_ROLE_KEY })).body;
  assert(rows.length === 0, `${table} QA row remains after cleanup`);
}
console.log(`${checks}/${checks} isolated direct-write checks passed; fixtures restored`);

function assert(ok, message) { if (!ok) throw new Error(message); }
async function request(path, { key, token = key, method = "GET", body } = {}) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json",
    Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  let parsed;
  try { parsed = raw ? JSON.parse(raw) : []; } catch { parsed = []; }
  return { status: response.status, body: parsed };
}

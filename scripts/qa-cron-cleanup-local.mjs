#!/usr/bin/env node
// Isolated local DB only: exercise dry-run and execution of the two financial cleanup crons.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!args["env-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url and --env-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const secret = "qa-cron-isolated-only";
const tag = crypto.randomBytes(6).toString("hex").toUpperCase();
const now = Date.now();
const old = new Date(now - 26 * 3600000).toISOString();
const recent = new Date(now - 23 * 3600000).toISOString();
const expired = new Date(now - 3600000).toISOString();
const future = new Date(now + 3600000).toISOString();
const created = { profile: null, orders: [], entitlements: [] };
let passed = 0;
function check(ok, label) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); passed++; }

const [staleOrders, staleEntitlements, plans, auditBefore] = await Promise.all([
  db(`orders?select=id&status=eq.pending&created_at=lt.${encodeURIComponent(new Date(now - 24 * 3600000).toISOString())}`),
  db(`member_entitlements?select=id&status=eq.active&expires_at=lt.${encodeURIComponent(new Date(now).toISOString())}`),
  db("plans?select=id&limit=1"),
  db("admin_audit_logs?select=id&action=in.(orders_auto_cancel,entitlements_expired_by_cron)")
]);
if (staleOrders.length || staleEntitlements.length || !plans[0]?.id) {
  throw new Error("Isolated DB must have no pre-existing cleanup candidates and one plan");
}
const auditIds = new Set(auditBefore.map((row) => row.id));

try {
  const [profile] = await db("profiles", "POST", [{ email: `qa-cron-${tag}@example.test`, name: "QA cron" }]);
  created.profile = profile.id;
  const orderRows = await db("orders", "POST", [
    { order_no: `QACRON${tag}O`, user_id: profile.id, plan_id: plans[0].id,
      amount: 100, currency: "TWD", status: "pending", created_at: old },
    { order_no: `QACRON${tag}N`, user_id: profile.id, plan_id: plans[0].id,
      amount: 100, currency: "TWD", status: "pending", created_at: recent },
    { order_no: `QACRON${tag}P`, user_id: profile.id, plan_id: plans[0].id,
      amount: 100, currency: "TWD", status: "paid", created_at: old }
  ]);
  created.orders.push(...orderRows.map((row) => row.id));
  const entitlementRows = await db("member_entitlements", "POST", [
    { user_id: profile.id, plan_id: plans[0].id, status: "active", credits_remaining: 7,
      expires_at: expired },
    { user_id: profile.id, plan_id: plans[0].id, status: "active", credits_remaining: 9,
      expires_at: future }
  ]);
  created.entitlements.push(...entitlementRows.map((row) => row.id));

  for (const [path, countKey] of [
    ["cleanup-pending-orders", "cleaned_count"],
    ["expire-entitlements", "expired_count"]
  ]) {
    check((await api(path, "", true)).status === 401, `${path} rejects missing secret`);
    check((await api(path, "wrong", true)).status === 401, `${path} rejects wrong secret`);
    const dry = await api(path, secret, true);
    check(dry.status === 200 && dry.body.dry_run === true
      && dry.body.candidate_count === 1 && dry.body[countKey] === 0,
    `${path} dry-run reports one candidate without mutation`);
  }
  let orders = await db(`orders?select=id,status&id=in.(${created.orders.join(",")})`);
  let ents = await db(`member_entitlements?select=id,status,credits_remaining&id=in.(${created.entitlements.join(",")})`);
  check(orders.filter((row) => row.status === "pending").length === 2
    && ents.every((row) => row.status === "active"), "dry-run leaves fixtures unchanged");

  const cleaned = await api("cleanup-pending-orders", secret, false);
  const expiredResult = await api("expire-entitlements", secret, false);
  check(cleaned.status === 200 && cleaned.body.candidate_count === 1 && cleaned.body.cleaned_count === 1,
    "old pending order is cancelled once");
  check(expiredResult.status === 200 && expiredResult.body.candidate_count === 1
    && expiredResult.body.expired_count === 1,
  `expired active entitlement is marked expired once: HTTP ${expiredResult.status}, candidate=${expiredResult.body.candidate_count}, expired=${expiredResult.body.expired_count}, error=${expiredResult.body.error || "none"}`);
  orders = await db(`orders?select=id,status&id=in.(${created.orders.join(",")})`);
  ents = await db(`member_entitlements?select=id,status,credits_remaining&id=in.(${created.entitlements.join(",")})`);
  check(orders.find((row) => row.id === orderRows[0].id)?.status === "cancelled"
    && orders.find((row) => row.id === orderRows[1].id)?.status === "pending"
    && orders.find((row) => row.id === orderRows[2].id)?.status === "paid",
  "cron preserves recent pending and already-paid orders");
  check(ents.find((row) => row.id === entitlementRows[0].id)?.status === "expired"
    && ents.find((row) => row.id === entitlementRows[0].id)?.credits_remaining === 7
    && ents.find((row) => row.id === entitlementRows[1].id)?.status === "active",
  "cron preserves credits and future entitlement");
  const rerun = await Promise.all([api("cleanup-pending-orders", secret, false), api("expire-entitlements", secret, false)]);
  check(rerun.every((item) => item.status === 200 && item.body.candidate_count === 0),
    "repeated cron calls have no candidates");
} finally {
  for (const id of created.entitlements) await db(`member_entitlements?id=eq.${id}`, "DELETE");
  for (const id of created.orders) await db(`orders?id=eq.${id}`, "DELETE");
  if (created.profile) await db(`profiles?id=eq.${created.profile}`, "DELETE");
  const auditAfter = await db("admin_audit_logs?select=id&action=in.(orders_auto_cancel,entitlements_expired_by_cron)");
  for (const row of auditAfter) if (!auditIds.has(row.id)) await db(`admin_audit_logs?id=eq.${row.id}`, "DELETE");
}
for (const [table, ids] of [["orders", created.orders], ["member_entitlements", created.entitlements]]) {
  for (const id of ids) if ((await db(`${table}?select=id&id=eq.${id}`)).length) throw new Error(`${table} fixture remains`);
}
if (created.profile && (await db(`profiles?select=id&id=eq.${created.profile}`)).length) {
  throw new Error("profile fixture remains");
}
console.log(`${passed}/12 cron cleanup checks passed; fixtures and audit cleaned`);

async function db(path, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json().catch(() => []);
}
async function api(path, bearer, dryRun) {
  const response = await fetch(`${baseUrl}/api/cron/${path}${dryRun ? "?dry_run=1" : ""}`,
    { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

#!/usr/bin/env node
// Local-only A/B finance, course and usage RLS checks with disposable rows.
// Usage: node scripts/qa-finance-rls-local.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (!args["env-file"] || !args["members-file"]) throw new Error("Provide --env-file and --members-file");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2) throw new Error("Expected two QA members");
const plan = (await db("plans?select=id&limit=1"))[0];
const course = (await db("course_products?select=id&limit=1"))[0];
if (!plan || !course) throw new Error("Missing local plan/course fixture");
const tag = `QARLS${crypto.randomBytes(5).toString("hex")}`;
const owned = [new Map(), new Map()];
const created = { orders: [], invoices: [], course_registrations: [], usage_logs: [] };
let passed = 0;

try {
  for (const [i, member] of members.entries()) {
    const memberOrder = (await insert("orders", [{ order_no: `${tag}${i}M`, user_id: member.profile_id,
      plan_id: plan.id, amount: 980, currency: "TWD", status: "pending", provider: "ecpay" }]))[0];
    const courseOrder = (await insert("orders", [{ order_no: `${tag}${i}C`, user_id: member.profile_id,
      order_type: "course", course_product_id: course.id, amount: 980, currency: "TWD",
      status: "pending", provider: "ecpay" }]))[0];
    created.orders.push(memberOrder.id, courseOrder.id);
    owned[i].set("orders", memberOrder.id);

    const invoice = (await insert("invoices", [{ order_id: memberOrder.id,
      user_id: member.profile_id, buyer_type: "personal", buyer_name: tag,
      total_amount: 980, status: "pending" }]))[0];
    created.invoices.push(invoice.id); owned[i].set("invoices", invoice.id);

    const registration = (await insert("course_registrations", [{ order_id: courseOrder.id,
      user_id: member.profile_id, course_product_id: course.id, status: "pending",
      registration_type: "new", amount: 980, currency: "TWD", name: tag,
      phone: "0900000000", email: `qa-${tag}-${i}@example.test` }]))[0];
    created.course_registrations.push(registration.id);
    owned[i].set("course_registrations", registration.id);

    const usage = (await insert("usage_logs", [{ user_id: member.profile_id,
      type: "qa", prompt: tag, reply: tag }]))[0];
    created.usage_logs.push(usage.id); owned[i].set("usage_logs", usage.id);
  }

  for (const [i, member] of members.entries()) {
    for (const table of ["orders", "invoices", "course_registrations", "usage_logs"]) {
      const mine = await memberGet(table, owned[i].get(table), member.access_token);
      const other = await memberGet(table, owned[1 - i].get(table), member.access_token);
      assert(mine.status === 200 && mine.body.length === 1
        && other.status === 200 && other.body.length === 0, `${table} A/B RLS leak for member ${i + 1}`);
      console.log(`PASS member ${i + 1} ${table}: own 1, other 0`); passed++;
    }
  }

  const response = await fetch(`${restUrl}/invoices?id=eq.${owned[1].get("invoices")}`, {
    method: "PATCH", headers: { apikey: env.ANON_KEY,
      Authorization: `Bearer ${members[0].access_token}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "voided" })
  });
  const invoiceAfter = await db(`invoices?select=status&id=eq.${owned[1].get("invoices")}`);
  assert([200, 204, 401, 403].includes(response.status) && invoiceAfter[0]?.status === "pending",
    "A changed B invoice directly");
  console.log(`PASS cross-member invoice PATCH: HTTP ${response.status}, DB unchanged`); passed++;
} finally {
  for (const table of ["usage_logs", "course_registrations", "invoices", "orders"]) {
    for (const id of created[table]) await db(`${table}?id=eq.${id}`, "DELETE");
  }
}
for (const [table, ids] of Object.entries(created)) {
  for (const id of ids) {
    const remaining = await db(`${table}?select=id&id=eq.${id}`);
    assert(remaining.length === 0, `${table} QA fixture remains`);
  }
}
console.log(`${passed}/${passed} finance/course/usage RLS checks passed; fixtures cleaned`);

function assert(ok, message) { if (!ok) throw new Error(message); }
async function insert(table, body) { return db(table, "POST", body); }
async function db(path, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function memberGet(table, id, token) {
  const response = await fetch(`${restUrl}/${table}?select=id&id=eq.${id}`, {
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}` }
  });
  return { status: response.status, body: await response.json().catch(() => []) };
}

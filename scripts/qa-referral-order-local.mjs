#!/usr/bin/env node
// Local-only member order attribution using two disposable referral partners.
// Usage: node scripts/qa-referral-order-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

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
    || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members?.[0];
if (!member?.access_token || !member?.profile_id) throw new Error("Missing local QA member");
const [plan] = (await db("plans?select=code,price&is_active=eq.true", "GET"))
  .filter((item) => item.price > 0 && !item.code.startsWith("e2e_"));
if (!plan) throw new Error("No local purchasable plan");
const codeA = `QAREFA${crypto.randomBytes(4).toString("hex")}`;
const codeB = `QAREFB${crypto.randomBytes(4).toString("hex")}`;
const original = (await db(`profiles?select=referral_code&id=eq.${member.profile_id}`, "GET"))[0];
if (!original) throw new Error("Missing local QA profile");
const partnerIds = [];
const orderIds = [];
let passed = 0;
try {
  const partners = await db("referral_partners", "POST", [
    { code: codeA, name: "QA Partner A", commission_rate: 0.2 },
    { code: codeB, name: "QA Partner B", commission_rate: 0.3 }
  ]);
  partnerIds.push(...partners.map((item) => item.id));
  const a = partners.find((item) => item.code === codeA);
  const b = partners.find((item) => item.code === codeB);
  if (!a || !b) throw new Error("Local referral partners missing");

  await db(`profiles?id=eq.${member.profile_id}`, "PATCH", { referral_code: codeA });
  const activeBound = await createOrder(codeB);
  const activeOk = activeBound.referral_partner_id === a.id
    && activeBound.referral_code === codeA && Number(activeBound.referral_rate) === 0.2;
  console.log(`${activeOk ? "PASS" : "FAIL"} active profile binding outranks other cookie`);
  if (activeOk) passed++;

  await db(`referral_partners?id=eq.${a.id}`, "PATCH", { is_active: false });
  const disabledBound = await createOrder(codeB);
  console.log(`OBSERVED disabled profile partner + other cookie: attributed_to=${disabledBound.referral_partner_id === b.id ? "other_partner" : disabledBound.referral_partner_id ? "unexpected" : "none"}`);

  await db(`profiles?id=eq.${member.profile_id}`, "PATCH", { referral_code: null });
  const cookieOnly = await createOrder(codeB);
  const cookieOk = cookieOnly.referral_partner_id === b.id
    && cookieOnly.referral_code === codeB && Number(cookieOnly.referral_rate) === 0.3;
  console.log(`${cookieOk ? "PASS" : "FAIL"} unbound member uses active cookie partner`);
  if (cookieOk) passed++;

  await db(`referral_partners?id=eq.${b.id}`, "PATCH", { commission_rate: 0.5 });
  const [snapshot] = await db(`orders?select=referral_rate&id=eq.${cookieOnly.id}`, "GET");
  const snapshotOk = Number(snapshot?.referral_rate) === 0.3;
  console.log(`${snapshotOk ? "PASS" : "FAIL"} order commission snapshot unaffected by partner edit`);
  if (snapshotOk) passed++;

  await db(`referral_partners?id=eq.${b.id}`, "PATCH", { is_active: false });
  const disabledCookie = await createOrder(codeB);
  const disabledOk = !disabledCookie.referral_partner_id && !disabledCookie.referral_code;
  console.log(`${disabledOk ? "PASS" : "FAIL"} inactive cookie partner does not block order or attribute`);
  if (disabledOk) passed++;
} finally {
  for (const id of orderIds) await db(`orders?id=eq.${id}`, "DELETE");
  await db(`profiles?id=eq.${member.profile_id}`, "PATCH", { referral_code: original.referral_code });
  for (const id of partnerIds) await db(`referral_partners?id=eq.${id}`, "DELETE");
}
for (const id of orderIds) {
  const rows = await db(`orders?select=id&id=eq.${id}`, "GET");
  if (rows.length) throw new Error("Local QA order cleanup incomplete");
}
const restored = (await db(`profiles?select=referral_code&id=eq.${member.profile_id}`, "GET"))[0];
if (restored?.referral_code !== original.referral_code) throw new Error("Local QA profile attribution not restored");
for (const id of partnerIds) {
  const rows = await db(`referral_partners?select=id&id=eq.${id}`, "GET");
  if (rows.length) throw new Error("Local QA referral partner cleanup incomplete");
}
console.log(`${passed}/4 referral order assertions passed; inactive bound-partner behavior recorded; fixtures cleaned`);
if (passed !== 4) process.exitCode = 1;

async function createOrder(cookieCode) {
  const response = await fetch(`${baseUrl}/api/orders/create`, { method: "POST", headers: {
    Authorization: `Bearer ${member.access_token}`, "Content-Type": "application/json",
    Cookie: `xf_ref=${cookieCode}`
  }, body: JSON.stringify({ plan_code: plan.code,
    invoice_request: { buyer_type: "personal", buyer_name: "QA", buyer_email: "qa-referral@example.test", carrier_type: "none" } }) });
  const body = await response.json().catch(() => null);
  if (response.status !== 200 || !body?.order?.id) throw new Error(`Local order create failed: HTTP ${response.status}`);
  orderIds.push(body.order.id);
  const [row] = await db(`orders?select=id,referral_partner_id,referral_code,referral_rate&id=eq.${body.order.id}`, "GET");
  if (!row) throw new Error("Created local order not found");
  return row;
}
async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}

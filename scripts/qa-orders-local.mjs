#!/usr/bin/env node
// Local isolated membership checkout: server price, validation and duplicate-submit probe.
// Usage: node scripts/qa-orders-local.mjs --base-url=http://127.0.0.1:3101 \
//   --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"] || !args["members-file"]) {
  throw new Error("Provide local --base-url, --env-file and --members-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8")).split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const split = line.indexOf("=");
    return [line.slice(0, split), line.slice(split + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "") || !env.SERVICE_ROLE_KEY) {
  throw new Error("Refusing non-local Supabase or missing local service key");
}
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members?.[0];
if (!member?.access_token || !member?.profile_id) throw new Error("Missing local QA member");
const plans = await db("plans?select=id,code,price,currency,is_active&is_active=eq.true", "GET");
const plan = plans.find((p) => p.price > 0 && p.currency === "TWD" && !p.code.startsWith("e2e_"));
if (!plan) throw new Error("No purchasable local QA plan");

const created = [];
const invoice = { buyer_type: "personal", buyer_name: "QA", buyer_email: "qa-order@example.test", carrier_type: "none" };
let passed = 0;
try {
  for (const [label, input, expected] of [
    ["empty plan", {}, 400],
    ["SQLi-shaped plan code", { plan_code: "' OR 1=1 --" }, 404],
    ["64-char unknown plan code", { plan_code: "x".repeat(64) }, 404],
    ["65-char plan code", { plan_code: "x".repeat(65) }, 400],
    ["10000-char plan code", { plan_code: "x".repeat(10000) }, 400],
    ["invalid company ID", { plan_code: plan.code, invoice_request: { buyer_type: "company", buyer_name: "QA", buyer_id: "1234567" } }, 400]
  ]) {
    const before = await db(`orders?select=id&user_id=eq.${member.profile_id}`, "GET");
    const response = await create(input);
    const after = await db(`orders?select=id&user_id=eq.${member.profile_id}`, "GET");
    const ok = response.status === expected && after.length === before.length;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${response.status}, order delta=${after.length - before.length}`);
    if (ok) passed++;
  }

  const input = { plan_code: plan.code, amount: 1, currency: "USD", invoice_request: invoice };
  const responses = await Promise.all([create(input), create(input)]);
  created.push(...responses.map((response) => response.body?.order?.id).filter(Boolean));
  const valid = responses.every((response) => response.status === 200 && response.body?.order?.id);
  const rows = valid ? await db(`orders?select=id,user_id,plan_id,amount,currency,status&id=in.(${created.join(",")})`, "GET") : [];
  const pricesCorrect = valid && rows.length === 2 && rows.every((row) =>
    row.user_id === member.profile_id && row.plan_id === plan.id && row.amount === plan.price
    && row.currency === "TWD" && row.status === "pending"
  ) && responses.every((response) => Number(response.body.checkout?.params?.TotalAmount) === plan.price);
  console.log(`${pricesCorrect ? "PASS" : "FAIL"} forged client amount/currency ignored: DB/checkout use server plan price`);
  if (pricesCorrect) passed++;
  const distinct = valid && new Set(created).size === 2;
  console.log(`${distinct ? "OBSERVED" : "UNEXPECTED"} double checkout: HTTP ${responses.map((r) => r.status).join("/")}, pending orders=${rows.length}`);
  console.log(`${passed}/7 membership order checks passed`);
  if (!pricesCorrect || !distinct || passed !== 7) process.exitCode = 1;
} finally {
  for (const id of created) await db(`orders?id=eq.${id}`, "DELETE");
  if (created.length) {
    const remaining = await db(`orders?select=id&id=in.(${created.join(",")})`, "GET");
    if (remaining.length) throw new Error("Local order cleanup incomplete");
  }
}

async function create(input) {
  const response = await fetch(`${baseUrl}/api/orders/create`, {
    method: "POST", headers: { Authorization: `Bearer ${member.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function db(path, method) {
  const response = await fetch(`${restUrl}/${path}`, {
    method,
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, Prefer: "return=representation" }
  });
  if (!response.ok) throw new Error(`Local DB ${method} returned ${response.status}`);
  const result = await response.text();
  return result ? JSON.parse(result) : [];
}

#!/usr/bin/env node
// Isolated local-only B2 regression: one successful redemption among ten and rollback on insert failure.
// Usage: node scripts/qa-redeem-atomic-local.mjs --base-url=http://127.0.0.1:3101 \
//   --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"] || !args["members-file"]) {
  throw new Error("Provide local --base-url, --env-file and --members-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8")).split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => {
    const split = line.indexOf("=");
    return [line.slice(0, split), line.slice(split + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")) {
  throw new Error("Refusing non-local Supabase");
}
const serviceKey = env.SERVICE_ROLE_KEY;
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (!serviceKey || members.length !== 2 || members.some((m) => !m.access_token || !m.profile_id)) {
  throw new Error("Missing local service key or A/B QA members");
}

const [plan] = await db("plans?select=id&code=eq.qa-b2-local", "GET");
if (!plan?.id) throw new Error("Local QA plan missing");
const code = `QA-B2-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
const beforeEntitlements = new Set((await Promise.all(members.map((member) =>
  db(`member_entitlements?select=id&user_id=eq.${member.profile_id}`, "GET")
))).flat().map((row) => row.id));
try {
  await db("activation_codes", "POST", [{ code, plan_id: plan.id, credits: 37, duration_days: 7, status: "unused" }]);
  const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => redeem(code, members[index % 2].access_token)));
  const statuses = responses.map((response) => response.status);
  const [activation] = await db(`activation_codes?select=status,used_by&code=eq.${code}`, "GET");
  const transactions = await db(`credit_transactions?select=id,entitlement_id,user_id,amount&ref_id=eq.${code}`, "GET");
  const entitlementId = transactions[0]?.entitlement_id;
  const entitlements = entitlementId ? await db(`member_entitlements?select=id,user_id,credits_remaining&id=eq.${entitlementId}`, "GET") : [];
  const pass = statuses.filter((status) => status === 200).length === 1
    && statuses.filter((status) => status === 400).length === 9
    && activation?.status === "used"
    && transactions.length === 1 && transactions[0].amount === 37
    && entitlements.length === 1 && entitlements[0].credits_remaining === 37
    && activation.used_by === transactions[0].user_id
    && transactions[0].user_id === entitlements[0].user_id;
  console.log(`${pass ? "PASS" : "FAIL"} N=10 same code: HTTP 200=${statuses.filter((s) => s === 200).length}, 400=${statuses.filter((s) => s === 400).length}, transactions=${transactions.length}, entitlements=${entitlements.length}`);
  if (!pass) process.exitCode = 1;
} finally {
  await db(`credit_transactions?ref_id=eq.${code}`, "DELETE");
  const afterEntitlements = (await Promise.all(members.map((member) =>
    db(`member_entitlements?select=id&user_id=eq.${member.profile_id}`, "GET")
  ))).flat();
  for (const entitlement of afterEntitlements) {
    if (!beforeEntitlements.has(entitlement.id)) await db(`member_entitlements?id=eq.${entitlement.id}`, "DELETE");
  }
  await db(`activation_codes?code=eq.${code}`, "DELETE");
  const remaining = await db(`activation_codes?select=code&code=eq.${code}`, "GET");
  const remainingTransactions = await db(`credit_transactions?select=id&ref_id=eq.${code}`, "GET");
  const finalEntitlements = (await Promise.all(members.map((member) =>
    db(`member_entitlements?select=id&user_id=eq.${member.profile_id}`, "GET")
  ))).flat();
  if (remaining.length || remainingTransactions.length || finalEntitlements.some((row) => !beforeEntitlements.has(row.id))) {
    throw new Error("Concurrent QA cleanup incomplete");
  }
}

const rollbackCode = "QA-B2-ROLLBACK";
const before = await Promise.all([
  db(`activation_codes?select=status,used_by&code=eq.${rollbackCode}`, "GET"),
  db(`credit_transactions?select=id&ref_id=eq.${rollbackCode}`, "GET"),
  db(`member_entitlements?select=id&user_id=eq.${members[0].profile_id}`, "GET")
]);
if (before[0][0]?.status !== "unused") throw new Error("Rollback fixture is not unused");
const rollbackResponse = await redeem(rollbackCode, members[0].access_token);
const after = await Promise.all([
  db(`activation_codes?select=status,used_by&code=eq.${rollbackCode}`, "GET"),
  db(`credit_transactions?select=id&ref_id=eq.${rollbackCode}`, "GET"),
  db(`member_entitlements?select=id&user_id=eq.${members[0].profile_id}`, "GET")
]);
const rollbackPass = rollbackResponse.status === 500
  && after[0][0]?.status === "unused" && !after[0][0]?.used_by
  && after[1].length === before[1].length && after[2].length === before[2].length;
console.log(`${rollbackPass ? "PASS" : "FAIL"} forced transaction failure: HTTP ${rollbackResponse.status}, code=${after[0][0]?.status}, transactions delta=${after[1].length - before[1].length}, entitlements delta=${after[2].length - before[2].length}`);
if (!rollbackPass) process.exitCode = 1;

async function redeem(value, token) {
  const response = await fetch(`${baseUrl}/api/member/redeem`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code: value })
  });
  await response.arrayBuffer();
  return { status: response.status };
}

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  const result = await response.text();
  return result ? JSON.parse(result) : [];
}

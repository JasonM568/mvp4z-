#!/usr/bin/env node
// Local-only public referral lookup validation and response-minimization checks.
// Usage: node scripts/qa-referral-lookup-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env

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
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const code = `QAREF${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
const name = `QA referral ${code}`;
let id;
let passed = 0;
try {
  const [partner] = await db("referral_partners", "POST", [{ code, name,
    contact: "private-qa-contact", commission_rate: 0.3141, note: "private-qa-note", is_active: true }]);
  id = partner.id;
  for (const [label, input, expected] of [
    ["exact code", code, true], ["case-insensitive code", code.toLowerCase(), true],
    ["empty code", "", false], ["SQLi-shaped code", "' OR 1=1 --", false],
    ["LIKE wildcard", "QA%", false], ["overlong code", "x".repeat(33), false]
  ]) {
    const result = await lookup(input);
    const ok = result.status === 200 && result.body?.ok === expected
      && (expected ? result.body.partner?.name === name
        && Object.keys(result.body.partner).join(",") === "name"
        : result.body.partner === null);
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${result.status}, match=${result.body?.ok}`);
    if (ok) passed++;
  }
  await db(`referral_partners?id=eq.${id}`, "PATCH", { is_active: false });
  const inactive = await lookup(code);
  const inactiveOk = inactive.status === 200 && inactive.body?.ok === false && inactive.body.partner === null;
  console.log(`${inactiveOk ? "PASS" : "FAIL"} inactive partner hidden: HTTP ${inactive.status}`);
  if (inactiveOk) passed++;

  const direct = await fetch(`${restUrl}/referral_partners?select=id&code=eq.${code}`, {
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${env.ANON_KEY}` }
  });
  const directOk = [401, 403, 404].includes(direct.status);
  console.log(`${directOk ? "PASS" : "FAIL"} raw anon partner table denied: HTTP ${direct.status}`);
  if (directOk) passed++;
} finally {
  if (id) await db(`referral_partners?id=eq.${id}`, "DELETE");
}
const remaining = await db(`referral_partners?select=id&code=eq.${code}`, "GET");
if (remaining.length) throw new Error("Local QA referral partner cleanup incomplete");
console.log(`${passed}/8 local referral lookup checks passed; fixture cleaned`);
if (passed !== 8) process.exitCode = 1;

async function lookup(value) {
  const query = new URLSearchParams({ code: value });
  const response = await fetch(`${baseUrl}/api/referral/lookup?${query}`);
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}

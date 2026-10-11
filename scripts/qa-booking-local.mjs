#!/usr/bin/env node
// Local isolated consultation booking acceptance and duplicate-submit probe.
// Usage: node scripts/qa-booking-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"]) {
  throw new Error("Provide local --base-url and --env-file");
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

const source = `qa-booking-${crypto.randomBytes(5).toString("hex")}`;
const tests = [];
const base = { name: "QA", phone: "0912345678", source };
try {
  tests.push(await check("empty body", {}, 400));
  tests.push(await check("missing contact", { name: "QA", source }, 400));
  tests.push(await check("invalid email", { name: "QA", email: "' OR 1=1 --", source }, 400));
  tests.push(await check("name 81 chars", { ...base, name: "中".repeat(81) }, 400));
  tests.push(await check("message 4001 chars", { ...base, message: "x".repeat(4001) }, 400));
  tests.push(await check("name 80 and message 4000", { ...base, name: "中".repeat(80), message: "x".repeat(4000) }, 200));
  tests.push(await check("phone-only junk characters", { name: "QA", phone: "@@@", source }, 200));

  const duplicate = await Promise.all([submit(base), submit(base)]);
  const rows = await db(`consultation_bookings?select=id&source=eq.${source}`, "GET");
  const duplicateCount = rows.length - 2; // two accepted boundary/junk probes above
  const duplicateObserved = duplicate.every((response) => response.status === 200) && duplicateCount === 2;
  console.log(`${duplicateObserved ? "OBSERVED" : "UNEXPECTED"} double submit: HTTP ${duplicate.map((r) => r.status).join("/")}, new bookings=${duplicateCount}`);
  console.log(`${tests.filter(Boolean).length}/${tests.length} booking validation checks passed`);
  if (tests.some((pass) => !pass) || !duplicateObserved) process.exitCode = 1;
} finally {
  await db(`consultation_bookings?source=eq.${source}`, "DELETE");
  const remaining = await db(`consultation_bookings?select=id&source=eq.${source}`, "GET");
  if (remaining.length) throw new Error("Local booking cleanup incomplete");
}

async function check(label, payload, expectedStatus) {
  const response = await submit(payload);
  const ok = response.status === expectedStatus;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${response.status}`);
  return ok;
}

async function submit(payload) {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  await response.arrayBuffer();
  return { status: response.status };
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

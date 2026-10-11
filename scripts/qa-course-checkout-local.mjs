#!/usr/bin/env node
// Isolated local course checkout: validation, server price and same-email concurrency.
// Usage: node scripts/qa-course-checkout-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env

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

const courseResponse = await fetch(`${baseUrl}/api/courses/checkout`);
const courseBody = await courseResponse.json();
if (courseResponse.status !== 200 || !courseBody.course?.code) throw new Error("Local active course missing");
const course = courseBody.course;
const runId = crypto.randomBytes(6).toString("hex");
const emails = ["new", "returning", "race"].map((label) => `qa-course-${runId}-${label}@example.test`);
const invoice = { buyer_type: "personal", buyer_name: "QA", buyer_email: emails[0], carrier_type: "none" };
const base = { course_code: course.code, registration_type: "new", name: "QA Course", phone: "0912345678", email: emails[0], invoice_request: invoice };
let passed = 0;
try {
  for (const [label, input, expected] of [
    ["empty body", {}, 400],
    ["invalid registration type", { ...base, registration_type: "vip" }, 400],
    ["invalid email", { ...base, email: "' OR 1=1 --" }, 400],
    ["13 interests", { ...base, interests: Array(13).fill("qa") }, 400],
    ["note 1001 chars", { ...base, note: "x".repeat(1001) }, 400],
    ["invalid company ID", { ...base, invoice_request: { buyer_type: "company", buyer_name: "QA", buyer_id: "1234567" } }, 400]
  ]) {
    const response = await submit(input);
    const ok = response.status === expected;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${response.status}`);
    if (ok) passed++;
  }

  for (const [index, registrationType, price] of [[0, "new", course.price_new], [1, "returning", course.price_returning]]) {
    const email = emails[index];
    const response = await submit({ ...base, email, registration_type: registrationType,
      invoice_request: { ...invoice, buyer_email: email }, amount: 1, currency: "USD" });
    const [profile] = await db(`profiles?select=id&email=eq.${email}`, "GET");
    const [order] = profile ? await db(`orders?select=id,amount,currency,status,order_type&user_id=eq.${profile.id}`, "GET") : [];
    const [registration] = order ? await db(`course_registrations?select=status,amount,registration_type&order_id=eq.${order.id}`, "GET") : [];
    const ok = response.status === 200 && order?.amount === price && order.currency === "TWD"
      && order.status === "pending" && order.order_type === "course"
      && registration?.amount === price && registration?.status === "pending"
      && registration?.registration_type === registrationType
      && Number(response.body?.checkout?.params?.TotalAmount) === price;
    console.log(`${ok ? "PASS" : "FAIL"} ${registrationType} server price: HTTP ${response.status}, order/registration=${Boolean(order)}/${Boolean(registration)}`);
    if (ok) passed++;
  }

  const raceInput = { ...base, email: emails[2], invoice_request: { ...invoice, buyer_email: emails[2] } };
  const race = await Promise.all([submit(raceInput), submit(raceInput)]);
  const profiles = await db(`profiles?select=id&email=eq.${emails[2]}`, "GET");
  const orders = profiles[0] ? await db(`orders?select=id&user_id=eq.${profiles[0].id}`, "GET") : [];
  console.log(`OBSERVED same-email double submit: HTTP ${race.map((r) => r.status).join("/")}, profiles=${profiles.length}, orders=${orders.length}`);
  console.log(`${passed}/8 course validation/pricing checks passed`);
  if (passed !== 8) process.exitCode = 1;
} finally {
  for (const email of emails) {
    const profiles = await db(`profiles?select=id&email=eq.${email}`, "GET");
    for (const profile of profiles) {
      const orders = await db(`orders?select=id&user_id=eq.${profile.id}`, "GET");
      for (const order of orders) {
        await db(`course_registrations?order_id=eq.${order.id}`, "DELETE");
        await db(`orders?id=eq.${order.id}`, "DELETE");
      }
      await db(`profiles?id=eq.${profile.id}`, "DELETE");
    }
    const remaining = await db(`profiles?select=id&email=eq.${email}`, "GET");
    if (remaining.length) throw new Error("Local course QA cleanup incomplete");
  }
}

async function submit(input) {
  const response = await fetch(`${baseUrl}/api/courses/checkout`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
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

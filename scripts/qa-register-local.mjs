#!/usr/bin/env node
// Local isolated signup/trial concurrency. Creates and removes QA Auth users, profiles and trial rows.
// Usage: node scripts/qa-register-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "") || !env.SERVICE_ROLE_KEY) {
  throw new Error("Refusing non-local Supabase or missing local service key");
}
const auth = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const emails = Array.from({ length: 3 }, (_, index) => `qa-trial-${suffix}-${index}@example.test`);
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
let phone;
for (let i = 0; i < 10; i++) {
  const candidate = `09${crypto.randomInt(0, 100_000_000).toString().padStart(8, "0")}`;
  const claim = await db(`trial_phone_claims?select=phone&phone=eq.${candidate}`, "GET");
  if (!claim.length) { phone = candidate; break; }
}
if (!phone) throw new Error("No unused local QA phone found");

const input = (email) => ({ name: "QA Trial", email, phone, password });
let passed = 0;
try {
  for (const [label, payload] of [
    ["invalid phone", { ...input(emails[0]), phone: "@@@" }],
    ["weak password", { ...input(emails[0]), password: "1234567" }],
    ["invalid email", { ...input(emails[0]), email: "' OR 1=1 --" }]
  ]) {
    const result = await post("/api/auth/register", payload);
    const ok = result.status === 400;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${result.status}`);
    if (ok) passed++;
  }

  const registrations = await Promise.all(emails.map((email) => post("/api/auth/register", input(email))));
  const profiles = (await Promise.all(emails.map((email) => db(`profiles?select=id,phone&email=eq.${email}`, "GET")))).flat();
  const claims = await db(`trial_phone_claims?select=phone,profile_id&phone=eq.${phone}`, "GET");
  const entitlements = (await Promise.all(profiles.map((profile) =>
    db(`member_entitlements?select=id,credits_remaining&user_id=eq.${profile.id}`, "GET")
  ))).flat();
  const transactions = (await Promise.all(profiles.map((profile) =>
    db(`credit_transactions?select=id,source,amount&user_id=eq.${profile.id}`, "GET")
  ))).flat();
  const trialPass = registrations.every((result) => result.status === 200 && result.body?.token)
    && registrations.filter((result) => result.body?.trial_granted).length === 1
    && profiles.length === 3 && profiles.every((profile) => profile.phone === phone)
    && claims.length === 1 && entitlements.length === 1 && entitlements[0].credits_remaining === 30
    && transactions.length === 1 && transactions[0].source === "trial_signup" && transactions[0].amount === 30;
  console.log(`${trialPass ? "PASS" : "FAIL"} same-phone N=3 signup: HTTP ${registrations.map((r) => r.status).join("/")}, trial grants=${registrations.filter((r) => r.body?.trial_granted).length}, claims=${claims.length}, entitlements=${entitlements.length}`);
  if (trialPass) passed++;

  const duplicate = await post("/api/auth/register", input(emails[0]));
  const duplicatePass = duplicate.status === 409;
  console.log(`${duplicatePass ? "PASS" : "FAIL"} duplicate email: HTTP ${duplicate.status}`);
  if (duplicatePass) passed++;

  const login = await post("/api/auth/login", { email: emails[0], password });
  const wrong = await post("/api/auth/login", { email: emails[0], password: "wrong-password" });
  const loginPass = login.status === 200 && Boolean(login.body?.token) && [400, 401].includes(wrong.status);
  console.log(`${loginPass ? "PASS" : "FAIL"} login / wrong password: HTTP ${login.status}/${wrong.status}`);
  if (loginPass) passed++;

  const invalidRefresh = await post("/api/auth/refresh", { refresh_token: "qa-invalid-refresh" });
  const invalidRefreshPass = invalidRefresh.status === 401;
  console.log(`${invalidRefreshPass ? "PASS" : "FAIL"} invalid refresh token: HTTP ${invalidRefresh.status}`);
  if (invalidRefreshPass) passed++;

  const refreshed = login.body?.refresh_token
    ? await post("/api/auth/refresh", { refresh_token: login.body.refresh_token })
    : { status: 0, body: null };
  const memberResponse = refreshed.body?.token
    ? await fetch(`${baseUrl}/api/member/me`, { headers: { Authorization: `Bearer ${refreshed.body.token}` } })
    : null;
  const refreshPass = refreshed.status === 200 && Boolean(refreshed.body?.token) && memberResponse?.status === 200;
  if (memberResponse) await memberResponse.arrayBuffer();
  console.log(`${refreshPass ? "PASS" : "FAIL"} valid refresh / member API: HTTP ${refreshed.status}/${memberResponse?.status || 0}`);
  if (refreshPass) passed++;

  const forgotKnown = await post("/api/auth/forgot-password", { email: emails[0] });
  const forgotUnknown = await post("/api/auth/forgot-password", { email: `qa-trial-${suffix}-unknown@example.test` });
  const forgotPass = forgotKnown.status === 200 && forgotUnknown.status === 200;
  console.log(`${forgotPass ? "PASS" : "FAIL"} forgot-password non-enumeration: HTTP ${forgotKnown.status}/${forgotUnknown.status}`);
  if (forgotPass) passed++;
  console.log(`${passed}/9 local signup/auth checks passed`);
  if (passed !== 9) process.exitCode = 1;
} finally {
  await db(`trial_phone_claims?phone=eq.${phone}`, "DELETE");
  for (const email of emails) {
    const profiles = await db(`profiles?select=id&email=eq.${email}`, "GET");
    for (const profile of profiles) {
      await db(`credit_transactions?user_id=eq.${profile.id}`, "DELETE");
      await db(`member_entitlements?user_id=eq.${profile.id}`, "DELETE");
      await db(`profiles?id=eq.${profile.id}`, "DELETE");
    }
  }
  const { data, error } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  for (const user of data.users.filter((user) => emails.includes(user.email || ""))) {
    const { error: deleteError } = await auth.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
  const remainingClaims = await db(`trial_phone_claims?select=phone&phone=eq.${phone}`, "GET");
  const remainingProfiles = (await Promise.all(emails.map((email) => db(`profiles?select=id&email=eq.${email}`, "GET")))).flat();
  const { data: afterUsers, error: afterError } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (afterError) throw afterError;
  if (remainingClaims.length || remainingProfiles.length || afterUsers.users.some((user) => emails.includes(user.email || ""))) {
    throw new Error("Local signup QA cleanup incomplete");
  }
}

async function post(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function db(path, method) {
  const response = await fetch(`${restUrl}/${path}`, {
    method, headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, Prefer: "return=representation" }
  });
  if (!response.ok) throw new Error(`Local DB ${method} returned ${response.status}`);
  const result = await response.text();
  return result ? JSON.parse(result) : [];
}

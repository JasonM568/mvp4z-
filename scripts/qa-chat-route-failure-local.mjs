#!/usr/bin/env node
// B1 route integration without an LLM call. Run with OPENAI_API_KEY unset.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"])
  throw new Error("Provide local --base-url and --env-file");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signer = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(6).toString("hex");
let authId, profileId, entitlementId, checks = 0, passed = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
async function rest(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local REST ${method} ${path.split("?")[0]} HTTP ${response.status}`);
  return response.json().catch(() => []);
}
async function chat(token, body) {
  const response = await fetch(`${baseUrl}/api/ai/chat`, { method: "POST",
    signal: AbortSignal.timeout(30_000), headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json"
    }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function state() {
  const [ent] = await rest(`member_entitlements?select=credits_remaining&id=eq.${entitlementId}`);
  const slots = await rest(`chat_inflight?select=user_id&user_id=eq.${profileId}`);
  const usage = await rest(`usage_logs?select=id&user_id=eq.${profileId}&type=eq.chat`);
  const ledger = await rest(`credit_transactions?select=id&user_id=eq.${profileId}&source=eq.ai_chat`);
  return { balance: ent?.credits_remaining, slots: slots.length, usage: usage.length, ledger: ledger.length };
}
try {
  const email = `qa-b1-route-${tag}@example.test`;
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error("QA Auth creation failed");
  authId = made.data.user.id;
  const [profile] = await rest("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA B1 Route", role: "member" }]);
  profileId = profile.id;
  const [ent] = await rest("member_entitlements", "POST", [{ user_id: profileId,
    credits_remaining: 1, status: "active", expires_at: new Date(Date.now() + 86_400_000).toISOString()
  }]);
  entitlementId = ent.id;
  const login = await signer.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("QA member login failed");
  const token = login.data.session.access_token;
  const anonymous = await chat(null, { message: "QA" });
  check(anonymous.status === 401, "anonymous chat rejected", `HTTP ${anonymous.status}`);
  const invalid = await chat(token, { message: "" });
  check(invalid.status === 400, "empty message rejected before lease", `HTTP ${invalid.status}`);
  const overlong = await chat(token, { message: "a".repeat(4001) });
  check(overlong.status === 400, "overlong message rejected before lease", `HTTP ${overlong.status}`);
  const { data: heldToken, error: holdError } = await service.rpc("acquire_chat_slot", {
    p_user_id: profileId, p_ttl_seconds: 330
  });
  if (holdError || !heldToken) throw new Error("QA held lease setup failed");
  const blocked = await chat(token, { message: "QA held lease" });
  const blockedState = await state();
  check(blocked.status === 409 && blocked.body?.code === "CHAT_IN_PROGRESS"
    && blockedState.balance === 1 && blockedState.slots === 1
    && blockedState.usage === 0 && blockedState.ledger === 0,
  "held lease returns 409 without debit or usage", `HTTP ${blocked.status}, code ${blocked.body?.code}`);
  await service.rpc("release_chat_slot", { p_user_id: profileId, p_lock_token: heldToken });
  const missingModel = await chat(token, { message: "QA no model key" });
  const afterFailure = await state();
  check(missingModel.status >= 500 && afterFailure.balance === 1 && afterFailure.slots === 0
    && afterFailure.usage === 0 && afterFailure.ledger === 0,
  "model configuration failure releases lease and preserves credits", `HTTP ${missingModel.status}`);
  const retry = await chat(token, { message: "QA retry no model key" });
  const afterRetry = await state();
  check(retry.status >= 500 && afterRetry.slots === 0 && afterRetry.balance === 1,
    "retry after failure is not stuck at 409", `HTTP ${retry.status}`);
  await rest(`member_entitlements?id=eq.${entitlementId}`, "PATCH", { credits_remaining: 0 });
  const empty = await chat(token, { message: "QA zero credits" });
  const emptyState = await state();
  check(empty.status === 403 && emptyState.balance === 0 && emptyState.slots === 0,
    "zero-credit request denied before lease", `HTTP ${empty.status}`);
} finally {
  if (profileId) {
    await rest(`chat_inflight?user_id=eq.${profileId}`, "DELETE");
    await rest(`credit_transactions?user_id=eq.${profileId}`, "DELETE");
    await rest(`usage_logs?user_id=eq.${profileId}`, "DELETE");
    await rest(`member_entitlements?user_id=eq.${profileId}`, "DELETE");
    await rest(`profiles?id=eq.${profileId}`, "DELETE");
  }
  if (authId) {
    const deleted = await service.auth.admin.deleteUser(authId);
    if (deleted.error) throw new Error("QA Auth cleanup failed");
  }
  if (profileId && (await rest(`profiles?select=id&id=eq.${profileId}`)).length)
    throw new Error("QA B1 route fixture remains");
  console.log("QA B1 Auth/profile/entitlement/lease/usage/ledger fixtures cleaned");
}
console.log(`${passed}/${checks} B1 route failure checks passed`);
if (passed !== checks) process.exitCode = 1;

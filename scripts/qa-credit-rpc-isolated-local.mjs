#!/usr/bin/env node
// B3 fresh-stack acceptance: attacker A directly calls legacy debit RPCs for B.
// Requires a disposable local Supabase with the candidate migration applied.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (!args["env-file"]) throw new Error("Provide --env-file for a disposable local Supabase");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const memberAuth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(6).toString("hex");
const refs = [`qa-b3-${tag}-chat`, `qa-b3-${tag}-council`];
const fixtures = [];
let entitlementId;
let checks = 0, passed = 0;
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
async function rpc(name, key, bearer, previous, ref) {
  const response = await fetch(`${env.REST_URL}/rpc/${name}`, { method: "POST",
    signal: AbortSignal.timeout(30_000), headers: { apikey: key,
      Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: fixtures[1].profileId, p_entitlement_id: entitlementId,
      p_previous_credits: previous, p_charge: 1, p_ref_id: ref }) });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, code: body.code, body };
}
try {
  for (const label of ["attacker", "victim"]) {
    const email = `qa-b3-${label}-${tag}@example.test`;
    const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error || !made.data.user) throw new Error("Local QA Auth creation failed");
    const fixture = { authId: made.data.user.id, email, password };
    fixtures.push(fixture);
    const [profile] = await rest("profiles", "POST", [{ auth_user_id: fixture.authId,
      email, name: `QA B3 ${label}`, role: "member" }]);
    fixture.profileId = profile.id;
  }
  const [entitlement] = await rest("member_entitlements", "POST", [{
    user_id: fixtures[1].profileId, status: "active", credits_remaining: 5,
    expires_at: new Date(Date.now() + 86_400_000).toISOString()
  }]);
  entitlementId = entitlement.id;
  const login = await memberAuth.auth.signInWithPassword({
    email: fixtures[0].email, password: fixtures[0].password
  });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA attacker login failed");
  const attackerToken = login.data.session.access_token;
  for (const [index, name] of ["commit_chat_credit", "commit_council_credit"].entries()) {
    const anonymous = await rpc(name, env.ANON_KEY, env.ANON_KEY, 5, refs[index]);
    check(anonymous.status === 401 && anonymous.code === "42501", `${name} anonymous cannot execute`,
      `HTTP ${anonymous.status}, ${anonymous.code}`);
    const attack = await rpc(name, env.ANON_KEY, attackerToken, 5, refs[index]);
    const [afterAttack] = await rest(`member_entitlements?select=credits_remaining&id=eq.${entitlementId}`);
    const attackLedger = await rest(`credit_transactions?select=id&entitlement_id=eq.${entitlementId}`);
    check(attack.status === 403 && attack.code === "42501"
      && afterAttack.credits_remaining === 5 && attackLedger.length === 0,
    `${name} attacker denied and victim unchanged`,
    `HTTP ${attack.status}, balance ${afterAttack.credits_remaining}, ledger ${attackLedger.length}`);
  }
  const chat = await rpc("commit_chat_credit", env.SERVICE_ROLE_KEY, env.SERVICE_ROLE_KEY, 5, refs[0]);
  const council = await rpc("commit_council_credit", env.SERVICE_ROLE_KEY, env.SERVICE_ROLE_KEY, 4, refs[1]);
  const [afterService] = await rest(`member_entitlements?select=credits_remaining&id=eq.${entitlementId}`);
  const ledger = await rest(`credit_transactions?select=source,amount,balance_after&entitlement_id=eq.${entitlementId}`);
  check(chat.status === 200 && chat.body.balance_after === 4
    && council.status === 200 && council.body.balance_after === 3
    && afterService.credits_remaining === 3 && ledger.length === 2
    && ledger.some((row) => row.source === "ai_chat" && row.amount === -1 && row.balance_after === 4)
    && ledger.some((row) => row.source === "ai_council" && row.amount === -1 && row.balance_after === 3),
  "service role retains Chat and Council debit with matching ledger",
  `HTTP ${chat.status}/${council.status}, balance ${afterService.credits_remaining}, ledger ${ledger.length}`);
} finally {
  if (entitlementId) {
    await rest(`credit_transactions?entitlement_id=eq.${entitlementId}`, "DELETE");
    await rest(`member_entitlements?id=eq.${entitlementId}`, "DELETE");
  }
  for (const fixture of fixtures) {
    if (fixture.profileId) await rest(`profiles?id=eq.${fixture.profileId}`, "DELETE");
    const deleted = await service.auth.admin.deleteUser(fixture.authId);
    if (deleted.error) throw new Error("Local QA Auth cleanup failed");
  }
  const profiles = await rest(`profiles?select=id&email=like.qa-b3-*-${tag}@example.test`);
  const entitlements = entitlementId ? await rest(`member_entitlements?select=id&id=eq.${entitlementId}`) : [];
  const transactions = entitlementId ? await rest(`credit_transactions?select=id&entitlement_id=eq.${entitlementId}`) : [];
  if (profiles.length || entitlements.length || transactions.length) throw new Error("QA B3 fixtures remain");
  console.log("QA B3 Auth/profile/entitlement/ledger fixtures cleaned");
}
console.log(`${passed}/${checks} B3 isolated role and victim-state checks passed`);
if (passed !== checks) process.exitCode = 1;

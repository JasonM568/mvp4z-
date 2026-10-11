#!/usr/bin/env node
// B1: local-only API/RPC success, fault rollback, retry and stale lease checks.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (!args["env-file"]) throw new Error("Provide --env-file for a disposable local Supabase");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")
  || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase/DB");
const tag = crypto.randomBytes(6).toString("hex");
const faultName = `qa_b1_fault_${tag}`;
let profileId, entitlementId, lockToken, faultInstalled = false, checks = 0, passed = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 30_000
  });
  if (result.status !== 0) throw new Error(`Local SQL failed: ${(result.stderr || "").slice(0, 220)}`);
}
async function api(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function must(path, method, body) {
  const response = await api(path, method, body);
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Local ${method} ${path.split("?")[0]} HTTP ${response.status}`);
  return response.body;
}
async function state() {
  const [ent] = await must(`member_entitlements?select=credits_remaining&id=eq.${entitlementId}`, "GET");
  const usage = await must(`usage_logs?select=id&user_id=eq.${profileId}&type=eq.chat`, "GET");
  const ledger = await must(`credit_transactions?select=id,amount,balance_after,ref_id&user_id=eq.${profileId}&source=eq.ai_chat`, "GET");
  return { balance: ent?.credits_remaining, usage, ledger };
}
async function commit(token, previous, charge, suffix) {
  return api("rpc/commit_chat_request", "POST", {
    p_user_id: profileId, p_entitlement_id: entitlementId, p_lock_token: token,
    p_previous_credits: previous, p_charge: charge,
    p_prompt: `QA ${suffix}`, p_reply: `QA answer ${suffix}`,
    p_tokens_input: 2, p_tokens_output: 3
  });
}
async function acquire() {
  return must("rpc/acquire_chat_slot", "POST", { p_user_id: profileId, p_ttl_seconds: 330 });
}
async function release(token) {
  return must("rpc/release_chat_slot", "POST", { p_user_id: profileId, p_lock_token: token });
}
function installFault() {
  sql(`create function public.${faultName}() returns trigger language plpgsql as $$
    begin if new.user_id = '${profileId}' and new.source = 'ai_chat' then
      raise exception 'QA scoped B1 ledger fault'; end if; return new; end; $$;
    create trigger ${faultName} before insert on public.credit_transactions
    for each row execute function public.${faultName}();`);
  faultInstalled = true;
}
function removeFault() {
  sql(`drop trigger ${faultName} on public.credit_transactions;
    drop function public.${faultName}();`);
  faultInstalled = false;
}
try {
  const [profile] = await must("profiles", "POST", [{
    email: `qa-b1-atomic-${tag}@example.test`, role: "member"
  }]);
  profileId = profile.id;
  const [ent] = await must("member_entitlements", "POST", [{ user_id: profileId,
    credits_remaining: 5, status: "active", expires_at: new Date(Date.now() + 86_400_000).toISOString()
  }]);
  entitlementId = ent.id;
  lockToken = await acquire();
  const first = await commit(lockToken, 5, 3, "first");
  const afterFirst = await state();
  check(first.status === 200 && first.body?.balance_after === 2
    && afterFirst.balance === 2 && afterFirst.usage.length === 1 && afterFirst.ledger.length === 1
    && afterFirst.ledger[0].amount === -3 && afterFirst.ledger[0].balance_after === 2
    && afterFirst.ledger[0].ref_id === afterFirst.usage[0].id,
  "successful 3-point answer has matching usage and ledger", `HTTP ${first.status}, balance ${afterFirst.balance}`);
  await release(lockToken);
  lockToken = await acquire();
  installFault();
  const failed = await commit(lockToken, 2, 1, "fault");
  const afterFault = await state();
  check(failed.status >= 400 && afterFault.balance === 2
    && afterFault.usage.length === 1 && afterFault.ledger.length === 1,
  "ledger fault rolls back debit and usage", `HTTP ${failed.status}, balance ${afterFault.balance}`);
  removeFault();
  const retry = await commit(lockToken, 2, 1, "retry");
  const afterRetry = await state();
  check(retry.status === 200 && retry.body?.balance_after === 1
    && afterRetry.balance === 1 && afterRetry.usage.length === 2 && afterRetry.ledger.length === 2,
  "same owned lease retries after fault", `HTTP ${retry.status}, balance ${afterRetry.balance}`);
  const staleToken = lockToken;
  await release(lockToken);
  lockToken = null;
  const stale = await commit(staleToken, 1, 1, "stale");
  const afterStale = await state();
  check(stale.body?.code === "CR003" && afterStale.balance === 1
    && afterStale.usage.length === 2 && afterStale.ledger.length === 2,
  "released lease cannot commit", `HTTP ${stale.status}, code ${stale.body?.code}`);
  lockToken = await acquire();
  const final = await commit(lockToken, 1, 1, "zero");
  const afterZero = await state();
  check(final.status === 200 && final.body?.balance_after === 0
    && afterZero.balance === 0 && afterZero.usage.length === 3 && afterZero.ledger.length === 3,
  "1-point boundary settles to zero", `HTTP ${final.status}, balance ${afterZero.balance}`);
} finally {
  if (faultInstalled) removeFault();
  if (profileId) {
    await must(`chat_inflight?user_id=eq.${profileId}`, "DELETE");
    await must(`credit_transactions?user_id=eq.${profileId}`, "DELETE");
    await must(`usage_logs?user_id=eq.${profileId}`, "DELETE");
    await must(`member_entitlements?user_id=eq.${profileId}`, "DELETE");
    await must(`profiles?id=eq.${profileId}`, "DELETE");
    const remaining = await must(`profiles?select=id&id=eq.${profileId}`, "GET");
    if (remaining.length) throw new Error("QA B1 profile remains");
  }
  console.log("QA B1 trigger/profile/entitlement/usage/ledger fixtures cleaned");
}
console.log(`${passed}/${checks} B1 atomic commit checks passed`);
if (passed !== checks) process.exitCode = 1;

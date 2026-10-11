#!/usr/bin/env node
// Local-only C13/C14/M16 HTTP + DB regression. Never contacts ECPay.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!args["env-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url and --env-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY
  || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")) {
  throw new Error("Refusing non-local Supabase; private env must contain local API, REST, and DB URLs");
}

const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-refund-c13-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(18).toString("hex")}`;
let authId, profileId, entitlementIds = [], orderIds = [], faultInstalled = false;
let passed = 0;
const tag = suffix.toUpperCase();
const orderNos = new Set();
const faultName = `qa_refund_audit_${suffix}`;

function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (ok) passed++;
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB request failed with HTTP ${response.status}`);
  return response.json().catch(() => []);
}
async function callApi(path, method = "POST", token = "", body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error("Local SQL setup/cleanup failed");
}
async function createOrder(planId, memberToken, index) {
  const orderNo = `QAC13${tag}${String(index).padStart(3, "0")}`;
  orderNos.add(orderNo);
  const [order] = await db("orders", "POST", [{ order_no: orderNo, user_id: profileId,
    plan_id: planId, amount: 199, status: "paid", provider: "ecpay" }]);
  orderIds.push(order.id);
  const granted = await db("rpc/commit_paid_entitlement", "POST", {
    p_order_id: order.id, p_user_id: profileId, p_plan_id: planId,
    p_credits: 20, p_duration_days: 30, p_ref_id: orderNo, p_is_addon: true
  });
  const result = Array.isArray(granted) ? granted[0] : granted;
  if (!result?.entitlement_id) throw new Error("Local test order entitlement setup failed");
  entitlementIds.push(result.entitlement_id);
  return { id: order.id, orderNo, path: `/api/admin/orders/${order.id}/refund` };
}
async function readOrder(order) {
  const [refunds, txs, audits, currentOrder] = await Promise.all([
    db(`refunds?select=id,amount,idempotency_key,credits_expected,credits_reclaimed&order_id=eq.${order.id}`),
    db(`credit_transactions?select=id,amount,source,ref_id&ref_id=eq.${order.orderNo}`),
    db(`admin_audit_logs?select=id,admin_user_id,action,metadata&target_id=eq.${order.id}`),
    db(`orders?select=id,status&id=eq.${order.id}`).then((rows) => rows[0])
  ]);
  return { refunds, txs: txs.filter((row) => row.source === "order_refund"), audits, currentOrder };
}

try {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create local QA user");
  authId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId,
    email, name: "QA refund C13/C14", role: "admin" }]);
  profileId = profile.id;
  const signedIn = await anon.auth.signInWithPassword({ email, password });
  const token = signedIn.data.session?.access_token;
  if (signedIn.error || !token) throw new Error("Could not sign in local QA admin");
  const [plan] = await db("plans?select=id&code=eq.single_report&limit=1");
  if (!plan?.id) throw new Error("Local single_report plan missing");

  const rounds = Math.max(1, Number(args.rounds) || 20);
  let concurrentRoundsPassed = true;
  for (let round = 1; round <= rounds; round++) {
    const order = await createOrder(plan.id, token, round);
    const key = crypto.randomUUID();
    const payload = { amount: 99, idempotency_key: key, reason: `QA replay ${round}`,
      provider_reference: `QA-${tag}-${round}`, confirmed_in_ecpay: true };
    const responses = await Promise.all(Array.from({ length: 10 }, () => callApi(order.path, "POST", token, payload)));
    const state = await readOrder(order);
    const oneResult = responses.every((response) => response.status === 200
      && response.body.refund_id === state.refunds[0]?.id);
    const reconciled = state.refunds.length === 1 && state.refunds[0].amount === 99
      && state.refunds[0].idempotency_key === key && state.txs.length === 1
      && state.txs[0].amount === -9 && state.audits.length === 1
      && state.audits[0].admin_user_id === profileId
      && state.audits[0].metadata?.refundId === state.refunds[0].id
      && state.currentOrder.status === "partially_refunded";
    if (!oneResult || !reconciled) concurrentRoundsPassed = false;
    if (round === 1 || round === rounds) {
      console.log(`Round ${round}: HTTP ${responses.map((x) => x.status).join(",")}; effects refund=${state.refunds.length}, ledger=${state.txs.length}, audit=${state.audits.length}`);
    }
  }
  check(concurrentRoundsPassed, `same-key N=10 concurrent retries × ${rounds} rounds all resolve to one refund_id/effect`);

  const conflictOrder = await createOrder(plan.id, token, 21);
  const conflictKey = crypto.randomUUID();
  const initial = { amount: 99, idempotency_key: conflictKey, reason: "QA same-key mismatch",
    provider_reference: "", confirmed_in_ecpay: true };
  const first = await callApi(conflictOrder.path, "POST", token, initial);
  const conflict = await callApi(conflictOrder.path, "POST", token, { ...initial, amount: 100 });
  const conflictState = await readOrder(conflictOrder);
  check(first.status === 200 && conflict.status === 409 && conflictState.refunds.length === 1
    && conflictState.txs.length === 1 && conflictState.audits.length === 1,
    "same idempotency key with a different amount returns 409 without a second effect",
    `HTTP ${first.status}/${conflict.status}; refunds ${conflictState.refunds.length}; ledger ${conflictState.txs.length}; audit ${conflictState.audits.length}`);

  const missingKeyOrder = await createOrder(plan.id, token, 22);
  const missingKey = await callApi(missingKeyOrder.path, "POST", token, {
    amount: 99, reason: "QA missing key", confirmed_in_ecpay: true
  });
  const missingKeyState = await readOrder(missingKeyOrder);
  check(missingKey.status === 400 && missingKeyState.refunds.length === 0
    && missingKeyState.txs.length === 0 && missingKeyState.audits.length === 0
    && missingKeyState.currentOrder.status === "paid",
    "new refund request without idempotency key returns 400 with no writes");

  const amountOrder = await createOrder(plan.id, token, 23);
  const amountKey = crypto.randomUUID();
  const tooMuch = await callApi(amountOrder.path, "POST", token, { amount: 200,
    idempotency_key: amountKey, reason: "QA M16 over amount", confirmed_in_ecpay: true });
  const amountState = await readOrder(amountOrder);
  check(tooMuch.status === 400 && amountState.refunds.length === 0 && amountState.txs.length === 0
    && amountState.audits.length === 0 && amountState.currentOrder.status === "paid",
    "M16 amount 200/199 returns 400 with no writes");

  const fullOrder = await createOrder(plan.id, token, 24);
  const fullKey = crypto.randomUUID();
  const full = await callApi(fullOrder.path, "POST", token, { amount: 199,
    idempotency_key: fullKey, reason: "QA M16 full", confirmed_in_ecpay: true });
  const afterFull = await callApi(fullOrder.path, "POST", token, { amount: 1,
    idempotency_key: crypto.randomUUID(), reason: "QA M16 after full", confirmed_in_ecpay: true });
  const fullState = await readOrder(fullOrder);
  check(full.status === 200 && afterFull.status === 409 && fullState.refunds.length === 1
    && fullState.txs.length === 1 && fullState.audits.length === 1
    && fullState.currentOrder.status === "refunded",
    "M16 a new refund after a full refund returns 409 without writes");

  const faultOrder = await createOrder(plan.id, token, 25);
  const faultKey = crypto.randomUUID();
  const faultPayload = { amount: 99, idempotency_key: faultKey, reason: "QA atomic audit fault",
    provider_reference: `QA-FAULT-${tag}`, confirmed_in_ecpay: true };
  const faultEntitlementId = entitlementIds.at(-1);
  const [balanceBeforeFault] = await db(`member_entitlements?select=credits_remaining&id=eq.${faultEntitlementId}`);
  sql(`begin;
    create function public.${faultName}() returns trigger language plpgsql as $$
    begin
      if new.target_id = '${faultOrder.id}' and new.action = 'order_refund_manual' then
        raise exception 'QA_REFUND_AUDIT_FAILURE';
      end if;
      return new;
    end $$;
    create trigger ${faultName} before insert on public.admin_audit_logs
      for each row execute function public.${faultName}();
    commit;`);
  faultInstalled = true;
  const failed = await callApi(faultOrder.path, "POST", token, faultPayload);
  const failedState = await readOrder(faultOrder);
  const [faultEntitlement] = await db(`member_entitlements?select=credits_remaining&id=eq.${faultEntitlementId}`);
  const rollback = failed.status === 500 && failedState.refunds.length === 0
    && failedState.txs.length === 0 && failedState.audits.length === 0
    && faultEntitlement.credits_remaining === balanceBeforeFault.credits_remaining && failedState.currentOrder.status === "paid";
  sql(`drop trigger ${faultName} on public.admin_audit_logs; drop function public.${faultName}();`);
  faultInstalled = false;
  const retry = await callApi(faultOrder.path, "POST", token, faultPayload);
  const retriedState = await readOrder(faultOrder);
  check(rollback && retry.status === 200 && retriedState.refunds.length === 1
    && retriedState.txs.length === 1 && retriedState.audits.length === 1
    && retriedState.currentOrder.status === "partially_refunded",
    "audit insert fault rolls back all effects and the same key can retry",
    `failed HTTP ${failed.status}; rolled back ${rollback}; balance ${balanceBeforeFault.credits_remaining}->${faultEntitlement.credits_remaining}; retry HTTP ${retry.status}; refunds ${retriedState.refunds.length}; ledger ${retriedState.txs.length}; audit ${retriedState.audits.length}; order ${retriedState.currentOrder.status}`);
} finally {
  if (faultInstalled) sql(`drop trigger if exists ${faultName} on public.admin_audit_logs; drop function if exists public.${faultName}();`);
  for (const id of orderIds) {
    await db(`admin_audit_logs?target_id=eq.${id}`, "DELETE");
    await db(`refunds?order_id=eq.${id}`, "DELETE");
  }
  for (const orderNo of orderNos) await db(`credit_transactions?ref_id=eq.${orderNo}`, "DELETE");
  for (const id of entitlementIds) await db(`member_entitlements?id=eq.${id}`, "DELETE");
  for (const id of orderIds) await db(`orders?id=eq.${id}`, "DELETE");
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error("Local QA Auth cleanup failed");
  }
  if (profileId && (await db(`profiles?select=id&id=eq.${profileId}`)).length) {
    throw new Error("Local QA profile cleanup failed");
  }
}

console.log(`${passed}/6 local refund idempotency/atomicity/boundary checks passed; fixtures cleaned`);
if (passed !== 6) process.exitCode = 1;

#!/usr/bin/env node
// Local-only named-admin refund HTTP/DB regression; never contacts ECPay.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
const replay = args.replay === "true";
const concurrentReplay = args.replay === "concurrent";
const auditFault = args["audit-fault"] === "true";
if (!args["env-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url and --env-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
if (auditFault && !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")) {
  throw new Error("Audit fault injection requires local DB_URL");
}

const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const orderNo = `QARAPI${suffix.toUpperCase()}`;
const users = [
  { email: `qa-refund-admin-${suffix}@example.test`, role: "admin" },
  { email: `qa-refund-member-${suffix}@example.test`, role: "member" }
];
let orderId, entitlementId, passed = 0;
let faultInstalled = false;
const faultName = `qa_refund_fault_${suffix}`;
function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (ok) passed++;
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return response.json().catch(() => []);
}
async function api(path, method = "GET", token = "", body, shared = false) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(shared ? { "X-Admin-Key": "qa-face-shared-only" } : {}),
    "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Local SQL fault setup failed: ${(result.stderr || "").slice(0, 180)}`);
}
try {
  for (const user of users) {
    user.password = `QA-${crypto.randomBytes(12).toString("hex")}`;
    const created = await service.auth.admin.createUser({ email: user.email,
      password: user.password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Cannot create local ${user.role}`);
    user.authId = created.data.user.id;
    const [profile] = await db("profiles", "POST", [{ auth_user_id: user.authId,
      email: user.email, name: `QA Refund ${user.role}`, role: user.role }]);
    user.profileId = profile.id;
    const login = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
    if (login.error || !login.data.session?.access_token) throw new Error(`Cannot sign in ${user.role}`);
    user.token = login.data.session.access_token;
  }
  const [admin, member] = users;
  const [plan] = await db("plans?select=id&code=eq.single_report&limit=1");
  if (!plan?.id) throw new Error("Local single_report plan missing");
  const [order] = await db("orders", "POST", [{ order_no: orderNo, user_id: member.profileId,
    plan_id: plan.id, amount: 199, status: "paid", provider: "ecpay" }]);
  orderId = order.id;
  const [grant] = await db("rpc/commit_paid_entitlement", "POST", {
    p_order_id: orderId, p_user_id: member.profileId, p_plan_id: plan.id,
    p_credits: 20, p_duration_days: 30, p_ref_id: orderNo, p_is_addon: true
  });
  entitlementId = grant.entitlement_id;
  if (!entitlementId) throw new Error("Could not provision local paid entitlement");
  const path = `/api/admin/orders/${orderId}/refund`;

  check((await api(path)).status === 401, "anonymous preview rejected 401");
  check((await api(path, "GET", member.token)).status === 403, "member preview rejected 403");
  check((await api(path, "GET", "", undefined, true)).status === 403,
    "shared key preview cannot replace named admin bearer");
  const preview = await api(path, "GET", admin.token);
  check(preview.status === 200 && preview.body.preview?.order_amount === 199
    && preview.body.preview?.refundable_amount === 199 && preview.body.preview?.credits_granted === 20
    && preview.body.preview?.credits_available === 20 && preview.body.refunds?.length === 0,
  "named admin preview matches paid order and grant", `HTTP ${preview.status}`);

  const payload = (amount) => ({ amount, reason: "QA isolated ECPay refund registration",
    provider_reference: `QA-${suffix}`, confirmed_in_ecpay: true });
  check((await api(path, "POST", "", payload(99))).status === 401,
    "anonymous refund rejected 401");
  check((await api(path, "POST", member.token, payload(99))).status === 403,
    "member refund rejected 403");
  check((await api(path, "POST", "", payload(99), true)).status === 403,
    "shared key refund cannot replace named admin bearer");
  for (const [label, body] of [
    ["missing ECPay confirmation", { ...payload(99), confirmed_in_ecpay: false }],
    ["string amount", payload("99")], ["zero amount", payload(0)],
    ["oversize reason", { ...payload(99), reason: "x".repeat(501) }]
  ]) check((await api(path, "POST", admin.token, body)).status === 400,
    `${label} rejected 400 before refund`);
  const tooMuch = await api(path, "POST", admin.token, payload(200));
  check(tooMuch.status === 400, "refund above remaining order amount rejected 400",
    `HTTP ${tooMuch.status}`);
  check((await db(`refunds?select=id&order_id=eq.${orderId}`)).length === 0,
    "invalid requests leave no refund rows");

  if (auditFault) {
    sql(`begin;
      create function public.${faultName}() returns trigger language plpgsql as $$
      begin
        if new.target_id = '${orderId}' and new.action = 'order_refund_manual' then
          raise exception 'QA_REFUND_AUDIT_FAILURE';
        end if;
        return new;
      end $$;
      create trigger ${faultName} before insert on public.admin_audit_logs
        for each row execute function public.${faultName}();
      commit;`);
    faultInstalled = true;
    const result = await api(path, "POST", admin.token, payload(99));
    const [refunds, transactions, audits, [entitlement], [currentOrder]] = await Promise.all([
      db(`refunds?select=id&order_id=eq.${orderId}`),
      db(`credit_transactions?select=id,source&ref_id=eq.${orderNo}`),
      db(`admin_audit_logs?select=id&target_id=eq.${orderId}`),
      db(`member_entitlements?select=id,credits_remaining&id=eq.${entitlementId}`),
      db(`orders?select=id,status&id=eq.${orderId}`)
    ]);
    check(result.status === 500 && refunds.length === 0
      && transactions.filter((row) => row.source === "order_refund").length === 0
      && audits.length === 0 && entitlement.credits_remaining === 20
      && currentOrder.status === "paid",
      "audit failure rolls back refund, credits and order together",
      `HTTP ${result.status}, refunds ${refunds.length}, refundTx ${transactions.filter((row) => row.source === "order_refund").length}, audits ${audits.length}, balance ${entitlement.credits_remaining}, status ${currentOrder.status}`);
    sql(`drop trigger ${faultName} on public.admin_audit_logs; drop function public.${faultName}();`);
    faultInstalled = false;
  } else if (concurrentReplay) {
    const responses = await Promise.all(Array.from({ length: 10 }, () =>
      api(path, "POST", admin.token, payload(99))));
    const [rows, transactions, audits, [entitlement], [currentOrder]] = await Promise.all([
      db(`refunds?select=id,amount&order_id=eq.${orderId}`),
      db(`credit_transactions?select=id,amount,source&ref_id=eq.${orderNo}`),
      db(`admin_audit_logs?select=id,action&target_id=eq.${orderId}`),
      db(`member_entitlements?select=id,credits_remaining&id=eq.${entitlementId}`),
      db(`orders?select=id,status&id=eq.${orderId}`)
    ]);
    const refundTx = transactions.filter((row) => row.source === "order_refund");
    check(responses.every((response) => [200, 409].includes(response.status))
      && rows.length === 1 && rows[0].amount === 99
      && refundTx.length === 1 && refundTx[0].amount === -9
      && audits.filter((row) => row.action === "order_refund_manual").length === 1
      && entitlement.credits_remaining === 11 && currentOrder.status === "partially_refunded",
      "concurrent identical refund N=10 has one financial effect",
      `statuses ${JSON.stringify(responses.map((response) => response.status))}, refunds ${rows.length}, refundTx ${refundTx.length}, audits ${audits.length}, balance ${entitlement.credits_remaining}`);
  } else {
  const first = await api(path, "POST", admin.token, payload(99));
  check(first.status === 200 && first.body.order_status === "partially_refunded"
    && first.body.credits_expected === 9 && first.body.credits_reclaimed === 9,
    "first 99/199 refund reclaims 9 credits", `HTTP ${first.status}`);
  if (replay) {
    const repeated = await api(path, "POST", admin.token, payload(99));
    const [rows, transactions, audits, [entitlement], [currentOrder]] = await Promise.all([
      db(`refunds?select=id,amount&order_id=eq.${orderId}`),
      db(`credit_transactions?select=id,amount,source&ref_id=eq.${orderNo}`),
      db(`admin_audit_logs?select=id,action&target_id=eq.${orderId}`),
      db(`member_entitlements?select=id,credits_remaining&id=eq.${entitlementId}`),
      db(`orders?select=id,status&id=eq.${orderId}`)
    ]);
    const refundTx = transactions.filter((row) => row.source === "order_refund");
    check([200, 409].includes(repeated.status) && rows.length === 1 && rows[0].amount === 99
      && refundTx.length === 1 && refundTx[0].amount === -9
      && audits.filter((row) => row.action === "order_refund_manual").length === 1
      && entitlement.credits_remaining === 11 && currentOrder.status === "partially_refunded",
      "identical 99 refund replay does not double-book cash or credits",
      `HTTP ${repeated.status}, refunds ${rows.length}, refundTx ${refundTx.length}, audits ${audits.length}, balance ${entitlement.credits_remaining}, status ${currentOrder.status}`);
  } else {
  const middle = await api(path, "GET", admin.token);
  check(middle.status === 200 && middle.body.preview?.already_refunded === 99
    && middle.body.preview?.refundable_amount === 100 && middle.body.refunds?.length === 1,
    "preview and history show 100 remaining");
  const second = await api(path, "POST", admin.token, payload(100));
  check(second.status === 200 && second.body.order_status === "refunded"
    && second.body.credits_expected === 11 && second.body.credits_reclaimed === 11,
    "second 100/199 refund reclaims final 11 credits", `HTTP ${second.status}`);
  const afterFull = await api(path, "POST", admin.token, payload(1));
  check(afterFull.status === 409, "refund after fully refunded order rejected 409",
    `HTTP ${afterFull.status}`);

  const [refunds, transactions, audits, [entitlement], [finalOrder]] = await Promise.all([
    db(`refunds?select=id,amount,credits_expected,credits_reclaimed,credits_shortfall,admin_profile_id&order_id=eq.${orderId}`),
    db(`credit_transactions?select=id,type,amount,balance_after,source,ref_id&ref_id=eq.${orderNo}`),
    db(`admin_audit_logs?select=id,admin_user_id,action,metadata&target_id=eq.${orderId}`),
    db(`member_entitlements?select=id,credits_remaining&id=eq.${entitlementId}`),
    db(`orders?select=id,status&id=eq.${orderId}`)
  ]);
  const refundTx = transactions.filter((row) => row.source === "order_refund");
  check(refunds.length === 2 && refunds.reduce((n, row) => n + row.amount, 0) === 199
    && refunds.reduce((n, row) => n + row.credits_expected, 0) === 20
    && refunds.reduce((n, row) => n + row.credits_reclaimed, 0) === 20
    && refunds.every((row) => row.credits_shortfall === 0 && row.admin_profile_id === admin.profileId)
    && refundTx.length === 2 && refundTx.reduce((n, row) => n + row.amount, 0) === -20
    && entitlement.credits_remaining === 0 && finalOrder.status === "refunded",
    "refund, ledger, entitlement and order reconcile");
  check(audits.length === 2 && audits.every((row) => row.admin_user_id === admin.profileId
    && row.action === "order_refund_manual")
    && audits.some((row) => row.metadata?.creditsReclaimed === 9)
    && audits.some((row) => row.metadata?.creditsReclaimed === 11),
    "two refund audits name the admin and match reclaimed credits");
  }
  }
} finally {
  if (faultInstalled) {
    sql(`drop trigger if exists ${faultName} on public.admin_audit_logs; drop function if exists public.${faultName}();`);
  }
  if (orderId) {
    await db(`admin_audit_logs?target_id=eq.${orderId}`, "DELETE");
    await db(`refunds?order_id=eq.${orderId}`, "DELETE");
    await db(`credit_transactions?ref_id=eq.${orderNo}`, "DELETE");
    if (entitlementId) await db(`member_entitlements?id=eq.${entitlementId}`, "DELETE");
    await db(`orders?id=eq.${orderId}`, "DELETE");
  }
  for (const user of users) {
    if (user.profileId) await db(`profiles?id=eq.${user.profileId}`, "DELETE");
    if (user.authId) {
      const removed = await service.auth.admin.deleteUser(user.authId);
      if (removed.error) throw new Error(`Local ${user.role} Auth cleanup failed`);
    }
  }
}
for (const [table, filter] of [
  ["orders", `order_no=eq.${orderNo}`], ["refunds", `order_id=eq.${orderId}`],
  ["member_entitlements", `id=eq.${entitlementId}`], ["credit_transactions", `ref_id=eq.${orderNo}`],
  ["admin_audit_logs", `target_id=eq.${orderId}`]
]) if ((await db(`${table}?select=id&${filter}`)).length) throw new Error(`QA ${table} fixture remains`);
const total = auditFault || concurrentReplay ? 14 : replay ? 15 : 19;
console.log(`${passed}/${total} named-admin refund HTTP/DB checks passed; fixtures cleaned`);
if (passed !== total) process.exitCode = 1;

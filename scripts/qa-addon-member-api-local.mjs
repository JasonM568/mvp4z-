#!/usr/bin/env node
// Isolated local Supabase + Next API: paid add-on after a zero-credit VIP entitlement.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
const apiUrl = (env.NEXT_PUBLIC_SUPABASE_URL || env.API_URL)?.replace(/\/$/, "");
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(apiUrl || "")
    || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")
    || !anonKey || !serviceKey) throw new Error("Refusing non-local Supabase");
const authAdmin = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });
const authMember = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-addon-api-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const orderNo = `QAADDAPI${suffix.toUpperCase()}`;
const expiry = new Date(Date.now() + 30 * 86400000).toISOString();
const tierFeatures = { qa_marker: suffix };
let authUserId, profileId, orderId, faceRunId, token;
let passed = 0;
function check(ok, label) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); passed++; }

const [vip] = await db("plans?select=id,code&code=eq.vip&limit=1");
const [addon] = await db("plans?select=id,code&code=eq.single_report&limit=1");
if (!vip?.id || !addon?.id) throw new Error("Isolated DB needs vip and single_report plans");

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA member");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Add-on Member", role: "member" }]);
  profileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA member login failed");
  token = login.data.session.access_token;

  const [old] = await db("member_entitlements", "POST", [{ user_id: profileId, plan_id: vip.id,
    status: "active", credits_remaining: 0, expires_at: expiry, tier_features: tierFeatures }]);
  const [order] = await db("orders", "POST", [{ order_no: orderNo, user_id: profileId,
    plan_id: addon.id, amount: 0, currency: "TWD", status: "paid" }]);
  orderId = order.id;

  const grant = await db("rpc/commit_paid_entitlement", "POST", {
    p_order_id: orderId, p_user_id: profileId, p_plan_id: addon.id,
    p_credits: 20, p_duration_days: 30, p_ref_id: orderNo, p_is_addon: true
  });
  const granted = grant[0];
  check(granted?.provisioned === true && granted?.carried_credits === 0
    && granted?.total_credits === 20 && granted?.entitlement_id,
  "paid add-on provisions exactly 20 credits without carryover");

  const rows = await db(`member_entitlements?select=id,plan_id,status,credits_remaining,expires_at,tier_features&user_id=eq.${profileId}`);
  const active = rows.filter((row) => row.status === "active");
  check(rows.length === 2 && active.length === 1 && active[0].id === granted.entitlement_id
    && active[0].plan_id === vip.id && active[0].credits_remaining === 20
    && rows.find((row) => row.id === old.id)?.status === "expired",
  "one active VIP entitlement supersedes expired zero-credit row");
  check(Date.parse(active[0].expires_at) === Date.parse(expiry)
    && active[0].tier_features?.qa_marker === suffix,
  "add-on preserves original expiry and tier features");

  // Legacy/refund data may retain a later expiry even after it was invalidated.
  // The old API sorted by expiry alone and would deterministically hide the
  // current 20-credit row. This catches that bug even when equal-expiry ties
  // happen to select the new row on a particular PostgreSQL plan.
  const [historical] = await db("member_entitlements", "POST", [{ user_id: profileId,
    plan_id: vip.id, status: "expired", credits_remaining: 0,
    expires_at: new Date(Date.parse(expiry) + 86400000).toISOString() }]);
  check(Boolean(historical?.id), "later-expiring but inactive historical row created");

  for (let i = 0; i < 5; i++) {
    const member = await api("/api/member/me", token);
    check(member.status === 200 && member.body.member?.plan === "vip"
      && member.body.member?.status === "active"
      && member.body.member?.credits_remaining === 20
      && member.body.member?.entitlement_id === granted.entitlement_id,
    `member API repeat ${i + 1} selects active VIP/20 (HTTP ${member.status}, status=${member.body.member?.status}, credits=${member.body.member?.credits_remaining}, new_id=${member.body.member?.entitlement_id === granted.entitlement_id})`);
  }
  const face = await api("/api/face-analysis/runs", token, "POST", {
    requestId: crypto.randomUUID(), mode: "self", consentVersion: "2026-08-01"
  });
  faceRunId = face.body.runId;
  const [faceRow] = faceRunId ? await db(`face_analysis_runs?select=id,entitlement_id,status&id=eq.${faceRunId}`) : [];
  check(face.status === 201 && faceRow?.status === "created"
    && faceRow?.entitlement_id === granted.entitlement_id,
  `face-analysis creation uses new active VIP entitlement (HTTP ${face.status})`);
  const repeatGrant = await db("rpc/commit_paid_entitlement", "POST", {
    p_order_id: orderId, p_user_id: profileId, p_plan_id: addon.id,
    p_credits: 20, p_duration_days: 30, p_ref_id: orderNo, p_is_addon: true
  });
  const transactions = await db(`credit_transactions?select=id,type,amount,entitlement_id&user_id=eq.${profileId}`);
  check(repeatGrant[0]?.provisioned === false && repeatGrant[0]?.entitlement_id === granted.entitlement_id
    && transactions.length === 1 && transactions[0].amount === 20,
  "duplicate grant is idempotent and credit ledger has one 20-point grant");
} finally {
  if (faceRunId) {
    await db(`face_analysis_events?run_id=eq.${faceRunId}`, "DELETE");
    await db(`face_analysis_runs?id=eq.${faceRunId}`, "DELETE");
  }
  if (profileId) {
    await db(`credit_transactions?user_id=eq.${profileId}`, "DELETE");
    await db(`member_entitlements?user_id=eq.${profileId}`, "DELETE");
  }
  if (orderId) await db(`orders?id=eq.${orderId}`, "DELETE");
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA Auth cleanup failed");
  }
}
for (const table of ["face_analysis_runs", "credit_transactions", "member_entitlements", "orders", "profiles"]) {
  const path = table === "orders" ? `orders?select=id&id=eq.${orderId}`
    : table === "profiles" ? `profiles?select=id&id=eq.${profileId}`
      : table === "face_analysis_runs" ? `face_analysis_runs?select=id&id=eq.${faceRunId}`
      : `${table}?select=id&user_id=eq.${profileId}`;
  if ((await db(path)).length) throw new Error(`${table} QA fixture remains`);
}
console.log(`${passed}/11 add-on member/face API checks passed; fixtures cleaned`);
if (passed !== 11) process.exitCode = 1;

async function db(path, method = "GET", body) {
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, { method, headers: {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return response.json().catch(() => []);
}
async function api(path, bearer, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    Authorization: `Bearer ${bearer}`, "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

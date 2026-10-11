#!/usr/bin/env node
// Local-only named-admin activation-code creation and audit regression.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!args["env-file"] || !args["members-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url, --env-file and --members-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members?.[0];
if (!member?.access_token) throw new Error("Missing local QA member token");
const [plan] = await db("plans?select=id,code&code=eq.vip&limit=1", "GET");
if (!plan?.id) throw new Error("Local vip plan fixture missing");
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-code-admin-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let authUserId, profileId, token;
const codes = [];
let passed = 0;
function check(ok, label) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email, name: "QA Code Admin", role: "admin" }]);
  profileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  check((await api("", "POST", {}, "")).status === 401, "anonymous POST rejected 401");
  check((await api("", "POST", {}, member.access_token)).status === 403, "member POST rejected 403");

  for (const [label, body, status] of [
    ["zero days", { plan: plan.code, days: 0 }, 400],
    ["too many days", { plan: plan.code, days: 3651 }, 400],
    ["negative credits", { plan: plan.code, credits: -1 }, 400],
    ["too many credits", { plan: plan.code, credits: 100001 }, 400],
    ["noninteger days", { plan: plan.code, days: 1.5 }, 400],
    ["oversize note", { plan: plan.code, note: "x".repeat(501) }, 400],
    ["unknown plan", { plan: "__qa_absent__" }, 404],
    ["SQLi-shaped plan", { plan: "' OR 1=1 --" }, 404]
  ]) {
    const response = await api("", "POST", body, token);
    check(response.status === status, `${label} rejected ${status}`);
  }

  const happy = await api("", "POST", { plan: plan.code, days: 1, credits: 0, note: "QA boundary" }, token);
  if (happy.status === 200 && happy.body.code) codes.push(happy.body.code);
  const [codeRow] = codes.length ? await db(`activation_codes?select=code,plan_id,credits,duration_days,status,created_by&code=eq.${codes[0]}`, "GET") : [];
  const audit = codes.length ? await db(`admin_audit_logs?select=admin_user_id,action,target_id&target_id=eq.${codes[0]}`, "GET") : [];
  check(happy.status === 200 && codeRow?.plan_id === plan.id && codeRow.credits === 0
    && codeRow.duration_days === 1 && codeRow.status === "unused" && codeRow.created_by === profileId
    && audit.length === 1 && audit[0].admin_user_id === profileId
    && audit[0].action === "activation_code.create", "boundary code, DB and named audit agree");

  const concurrent = await Promise.all(Array.from({ length: 10 }, () =>
    api("", "POST", { plan: plan.code, days: 3650, credits: 100000 }, token)));
  for (const result of concurrent) if (result.body.code) codes.push(result.body.code);
  const uniqueCodes = new Set(concurrent.map((result) => result.body.code));
  const rows = await db(`activation_codes?select=code,credits,duration_days,status,created_by&code=in.(${codes.slice(1).join(",")})`, "GET");
  check(concurrent.every((result) => result.status === 200) && uniqueCodes.size === 10
    && rows.length === 10 && rows.every((row) => row.credits === 100000 && row.duration_days === 3650
      && row.status === "unused" && row.created_by === profileId), "N=10 concurrent codes unique and DB bounds correct");

  const allAudit = await Promise.all(codes.map((code) => db(`admin_audit_logs?select=id&target_id=eq.${code}`, "GET")));
  check(codes.length === 11 && allAudit.every((rows) => rows.length === 1), "every created code has one audit entry");
} finally {
  for (const code of codes) {
    await db(`admin_audit_logs?target_id=eq.${code}`, "DELETE");
    await db(`activation_codes?code=eq.${code}`, "DELETE");
  }
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
for (const code of codes) {
  if ((await db(`activation_codes?select=code&code=eq.${code}`, "GET")).length
      || (await db(`admin_audit_logs?select=id&target_id=eq.${code}`, "GET")).length) {
    throw new Error("Activation-code fixture remains");
  }
}
if ((await db(`profiles?select=id&id=eq.${profileId}`, "GET")).length) throw new Error("Admin profile fixture remains");
console.log(`${passed}/13 admin activation-code checks passed; fixtures cleaned`);
if (passed !== 13) process.exitCode = 1;

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(_path, method, body, bearer) {
  const response = await fetch(`${baseUrl}/api/admin/create-code`, { method, headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

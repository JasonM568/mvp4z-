#!/usr/bin/env node
// Local-only named-admin referral partner create/update/list/audit regression.
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
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-ref-admin-${suffix}@example.test`;
const code = `QA_REF_${suffix}`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let authUserId, adminProfileId, partnerId, token;
let passed = 0;
function check(ok, label) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Referral Admin", role: "admin" }]);
  adminProfileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  check((await api("", "", "POST", { code })).status === 401, "anonymous create rejected 401");
  check((await api("", member.access_token, "POST", { code })).status === 403, "member create rejected 403");
  for (const [label, body, expected] of [
    ["invalid code", { code: "' OR 1=1 --", name: "QA" }, 400],
    ["empty name", { code, name: "" }, 400],
    ["invalid rate", { code, name: "QA", commission_rate: 1.01 }, 400],
    ["81-character name", { code, name: "x".repeat(81) }, 400]
  ]) {
    const result = await api("", token, "POST", body);
    check(result.status === expected, `${label} rejected ${expected} (actual ${result.status})`);
  }
  const preRows = await db(`referral_partners?select=id&code=eq.${code}`, "GET");
  check(preRows.length === 0, "invalid creates left no partner");

  const create = await api("", token, "POST", { code, name: "QA Partner", commission_rate: 0.25 });
  if (create.status === 200 && create.body.partner?.id) partnerId = create.body.partner.id;
  const [row] = partnerId ? await db(`referral_partners?select=code,name,commission_rate,is_active&id=eq.${partnerId}`, "GET") : [];
  check(create.status === 200 && row?.code === code && row.name === "QA Partner"
    && Number(row.commission_rate) === 0.25 && row.is_active === true, "named admin creates active partner");

  const duplicate = await api("", token, "POST", { code: code.toLowerCase(), name: "QA Other", commission_rate: 0.1 });
  check(duplicate.status === 409, "case-insensitive duplicate code rejected 409");
  const list = await api("", token);
  const detail = await api(`?partner=${partnerId}`, token);
  check(list.status === 200 && list.body.partners?.some((p) => p.id === partnerId)
    && detail.status === 200 && detail.body.partner?.id === partnerId
    && detail.body.stats?.orders_total === 0, "admin list and empty partner detail");

  const patch = await api("", token, "PATCH", { id: partnerId, commission_rate: 0.3, is_active: false });
  const [after] = await db(`referral_partners?select=commission_rate,is_active&id=eq.${partnerId}`, "GET");
  check(patch.status === 200 && Number(after?.commission_rate) === 0.3 && after.is_active === false,
    "rate change and deactivation persist");
  const audit = await db(`admin_audit_logs?select=id,action,admin_user_id,metadata&target_id=eq.${partnerId}`, "GET");
  const createdAudit = audit.find((entry) => /creat/i.test(entry.action));
  const updatedAudit = audit.find((entry) => /updat|chang/i.test(entry.action));
  const changes = JSON.stringify(updatedAudit?.metadata || {});
  check(audit.length >= 2 && audit.every((entry) => entry.admin_user_id === adminProfileId)
    && createdAudit && updatedAudit && changes.includes("0.25") && changes.includes("0.3")
    && changes.includes("false"), "create and commission/deactivation update have named before/after audit");

  const rates = Array.from({ length: 10 }, (_, i) => Number((0.31 + i / 100).toFixed(2)));
  const concurrent = await Promise.all(rates.map((commission_rate) =>
    api("", token, "PATCH", { id: partnerId, commission_rate })));
  const raceAudits = await db(`admin_audit_logs?select=action,admin_user_id,metadata&target_id=eq.${partnerId}`, "GET");
  const raceUpdates = raceAudits.filter((entry) => entry.action === "referral_partner_updated");
  const [raceFinal] = await db(`referral_partners?select=commission_rate&id=eq.${partnerId}`, "GET");
  const observed = raceUpdates.map((entry) => Number(entry.metadata?.after?.commission_rate));
  check(concurrent.every((response) => response.status === 200) && raceAudits.length === 12
    && raceAudits.every((entry) => entry.admin_user_id === adminProfileId)
    && rates.every((rate) => observed.some((value) => Math.abs(value - rate) < 0.00001))
    && observed.some((value) => Math.abs(value - Number(raceFinal.commission_rate)) < 0.00001),
    "N=10 concurrent rate edits retain every named audit and final value");
} finally {
  if (partnerId) {
    await db(`admin_audit_logs?target_id=eq.${partnerId}`, "DELETE");
    await db(`referral_partners?id=eq.${partnerId}`, "DELETE");
  }
  if (adminProfileId) await db(`profiles?id=eq.${adminProfileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
if ((await db(`referral_partners?select=id&code=eq.${code}`, "GET")).length
    || (await db(`profiles?select=id&id=eq.${adminProfileId}`, "GET")).length) {
  throw new Error("Referral QA fixtures remain");
}
console.log(`${passed}/13 admin referral checks passed; fixtures cleaned`);
if (passed !== 13) process.exitCode = 1;

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(query, bearer, method = "GET", body) {
  const response = await fetch(`${baseUrl}/api/admin/referrals${query}`, { method, headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

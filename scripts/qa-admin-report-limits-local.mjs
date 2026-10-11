#!/usr/bin/env node
// Isolated named-admin pagination checks for face and Council report lists.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"]) {
  throw new Error("Provide localhost --base-url and local --env-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "") ||
    !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")) {
  throw new Error("Refusing non-local Supabase");
}
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signIn = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const created = { auth: [], profiles: [], entitlements: [], face: [], council: [] };
const suffix = crypto.randomBytes(5).toString("hex");
let adminToken, memberToken, memberProfileId;
let passed = 0;
function check(ok, label, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${detail}`);
  if (ok) passed += 1;
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, {
    method,
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`DB ${path} HTTP ${response.status}`);
  return result;
}
async function makeUser(role) {
  const email = `qa-${role}-report-list-${suffix}@example.test`;
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error(`Cannot create ${role}`);
  created.auth.push(made.data.user.id);
  const [profile] = await db("profiles", "POST", {
    auth_user_id: made.data.user.id, email, name: `QA ${role} list`, role
  });
  created.profiles.push(profile.id);
  const login = await signIn.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error(`Cannot login ${role}`);
  return { id: profile.id, token: login.data.session.access_token };
}
async function api(path, token) {
  const response = await fetch(baseUrl + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  const admin = await makeUser("admin");
  const member = await makeUser("member");
  memberProfileId = member.id;
  adminToken = admin.token;
  memberToken = member.token;
  const [plan] = await db("plans?select=id&limit=1");
  if (!plan?.id) throw new Error("Missing local plan fixture");
  const [entitlement] = await db("member_entitlements", "POST", {
    user_id: member.id, plan_id: plan.id, status: "active", credits_remaining: 0,
    expires_at: new Date(Date.now() + 86400000).toISOString()
  });
  created.entitlements.push(entitlement.id);
  const face = Array.from({ length: 101 }, () => ({
    id: crypto.randomUUID(), request_id: crypto.randomUUID(), user_id: member.id,
    mode: "self", consent_version: "qa-local", status: "completed",
    report_structured: { qa: true }, report_text: "QA isolated report",
    completed_at: new Date().toISOString()
  }));
  await db("face_analysis_runs", "POST", face);
  created.face.push(...face.map((row) => row.id));
  const council = Array.from({ length: 201 }, () => ({
    id: crypto.randomUUID(), user_id: member.id, entitlement_id: entitlement.id,
    request: { qa: true }, final_label: "qa", final_text: "QA isolated Council report",
    final_ok: true, credits_charged: 0
  }));
  await db("council_runs", "POST", council);
  created.council.push(...council.map((row) => row.id));

  for (const [label, path, key, max] of [
    ["admin face", "/api/admin/face-analysis", "runs", 100],
    ["admin Council", "/api/admin/council-runs", "runs", 200]
  ]) {
    const noAuth = await api(path, "");
    check(noAuth.status === 401, `${label} anonymous denied`, `HTTP ${noAuth.status}`);
    const forbidden = await api(path, memberToken);
    check(forbidden.status === 403, `${label} member denied`, `HTTP ${forbidden.status}`);
    for (const [name, query, status, count] of [
      ["limit 1", "?limit=1", 200, 1],
      [`limit ${max}`, `?limit=${max}`, 200, max],
      ["limit abc", "?limit=abc", 400, null],
      ["limit SQLi shape", "?limit=1%20OR%201%3D1", 400, null],
      ["limit overlong", `?limit=${"9".repeat(500)}`, 400, null]
    ]) {
      const result = await api(path + query, adminToken);
      const countOk = count === null || (Array.isArray(result.body[key]) && result.body[key].length === count);
      check(result.status === status && countOk, `${label} ${name}`,
        `HTTP ${result.status}, items=${result.body[key]?.length ?? "n/a"}`);
    }
  }
  console.log(`${passed}/14 admin report list checks passed`);
  if (passed !== 14) process.exitCode = 1;
} finally {
  if (memberProfileId) await db(`council_runs?user_id=eq.${memberProfileId}`, "DELETE");
  if (memberProfileId) await db(`face_analysis_runs?user_id=eq.${memberProfileId}`, "DELETE");
  for (const id of created.entitlements) await db(`member_entitlements?id=eq.${id}`, "DELETE");
  for (const id of created.profiles) await db(`profiles?id=eq.${id}`, "DELETE");
  for (const id of created.auth) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
  }
  for (const [table, ids] of [["member_entitlements", created.entitlements], ["profiles", created.profiles]]) {
    for (const id of ids) {
      if ((await db(`${table}?select=id&id=eq.${id}`)).length) throw new Error(`${table} QA cleanup failed`);
    }
  }
  if (memberProfileId && (await db(`council_runs?select=id&user_id=eq.${memberProfileId}`)).length) {
    throw new Error("Council QA cleanup failed");
  }
  if (memberProfileId && (await db(`face_analysis_runs?select=id&user_id=eq.${memberProfileId}`)).length) {
    throw new Error("Face QA cleanup failed");
  }
  console.log("QA Auth/profiles/entitlement/reports cleanup verified");
}

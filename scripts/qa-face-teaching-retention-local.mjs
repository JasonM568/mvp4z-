#!/usr/bin/env node
// Local-only published face-teaching retention regression; uses one isolated rule.
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
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(6).toString("hex");
const email = `qa-face-retain-${tag}@example.test`;
const ruleId = `QA_FACE_RETAIN_${tag.toUpperCase()}`;
let authId, profileId, ruleUuid, passed = 0;
function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (ok) passed++;
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}: ${(await response.text()).slice(0, 150)}`);
  return response.json().catch(() => []);
}
async function api(path, method, token, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
try {
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local admin");
  authId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Face Retention Admin", role: "admin" }]);
  profileId = profile.id;
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local admin");
  const token = login.data.session.access_token;
  const createPath = "/api/admin/face-teachings";
  const input = { kind: "surface", ruleId, target: "forehead", memberText: "QA isolated teaching",
    teacherText: "QA traceability", status: "published" };
  check((await api(createPath, "POST", "", input)).status === 401, "anonymous create rejected 401");
  const createdRule = await api(createPath, "POST", token, input);
  ruleUuid = createdRule.body.rule?.id;
  check(createdRule.status === 200 && ruleUuid, "named admin publishes isolated rule", `HTTP ${createdRule.status}`);
  if (!ruleUuid) throw new Error("Published rule fixture missing");
  const path = `${createPath}/${ruleUuid}`;
  const directDelete = await api(path, "DELETE", token);
  check(directDelete.status === 409, "published rule direct DELETE rejected 409", `HTTP ${directDelete.status}`);
  const archive = await api(path, "PATCH", token, { status: "archived" });
  check(archive.status === 200, "published rule can be archived", `HTTP ${archive.status}`);
  const archived = await db(`face_teaching_rules?select=id,rule_id,status&rule_id=eq.${ruleId}`);
  check(archived.length === 1 && archived[0].status === "archived", "archived rule retained before DELETE");
  const deleteAfterArchive = await api(path, "DELETE", token);
  const after = await db(`face_teaching_rules?select=id,rule_id,status&rule_id=eq.${ruleId}`);
  check(deleteAfterArchive.status === 409 && after.length === 1,
    "once-published rule remains traceable after archive and DELETE attempt",
    `HTTP ${deleteAfterArchive.status}, rows ${after.length}`);
} finally {
  if (ruleUuid) await db(`face_teaching_rules?id=eq.${ruleUuid}`, "DELETE");
  await db(`admin_audit_logs?target_id=eq.${ruleId}`, "DELETE");
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`face_teaching_rules?select=id&rule_id=eq.${ruleId}`)).length
    || (await db(`admin_audit_logs?select=id&target_id=eq.${ruleId}`)).length
    || (await db(`profiles?select=id&email=eq.${email}`)).length) throw new Error("QA fixture remains");
  console.log("QA rule/audit/Auth/profile fixtures cleaned");
}
console.log(`${passed}/6 face teaching retention checks passed`);
if (passed !== 6) process.exitCode = 1;

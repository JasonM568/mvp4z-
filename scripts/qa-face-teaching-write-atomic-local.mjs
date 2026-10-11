#!/usr/bin/env node
// Local-only fault injection for face teaching PATCH publish and built-in import.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
  || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase/DB");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signer = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(5).toString("hex");
const email = `qa-face-write-${tag}@example.test`;
const ruleId = `QA_FACE_WRITE_${tag.toUpperCase()}`;
const faultName = `qa_face_write_fault_${tag}`;
let authId, profileId, ruleUuid, faultInstalled = false, passed = 0, checks = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 30_000
  });
  if (result.status !== 0) throw new Error(`Local SQL failed: ${(result.stderr || "").slice(0, 170)}`);
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(30_000), headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} HTTP ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, method, token, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, signal: AbortSignal.timeout(30_000), headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
function installFault(action, targetCheck) {
  sql(`begin; create function public.${faultName}() returns trigger language plpgsql as $$
    begin if new.admin_user_id = '${profileId}' and new.action = '${action}' ${targetCheck} then
      raise exception 'QA scoped C18 audit failure'; end if; return new; end; $$;
    create trigger ${faultName} before insert on public.admin_audit_logs
    for each row execute function public.${faultName}(); commit;`);
  faultInstalled = true;
}
function removeFault() {
  sql(`drop trigger ${faultName} on public.admin_audit_logs; drop function public.${faultName}();`);
  faultInstalled = false;
}
try {
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error("Cannot create local admin");
  authId = made.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Face Write", role: "admin" }]);
  profileId = profile.id;
  const login = await signer.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local admin");
  const token = login.data.session.access_token;

  const direct = await fetch(`${env.REST_URL}/rpc/manage_face_teaching_rule_write`, {
    method: "POST", signal: AbortSignal.timeout(30_000), headers: {
      apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json"
    }, body: JSON.stringify({ p_action: "create", p_payload: { rule_id: `${ruleId}_DIRECT` }, p_admin_user_id: profileId })
  });
  check([401, 403, 404].includes(direct.status), "admin token cannot call privileged write RPC directly",
  `HTTP ${direct.status}`);
  const create = await api("/api/admin/face-teachings", "POST", token, {
    kind: "surface", ruleId, target: "forehead", memberText: "QA isolated draft",
    teacherText: "QA atomic publish", status: "draft"
  });
  ruleUuid = create.body.rule?.id;
  check(create.status === 200 && Boolean(ruleUuid), "named admin creates isolated draft",
  `HTTP ${create.status}, error ${String(create.body.error || "none").slice(0, 90)}`);
  if (!ruleUuid) throw new Error("Draft fixture missing");
  const [before] = await db(`face_teaching_rules?select=status,version,published_at&id=eq.${ruleUuid}`);

  installFault("face_teaching_rule_publish", `and new.target_id = '${ruleId}'`);
  const denied = await api(`/api/admin/face-teachings/${ruleUuid}`, "PATCH", token, { status: "published" });
  const [afterFault] = await db(`face_teaching_rules?select=status,version,published_at&id=eq.${ruleUuid}`);
  const faultAudits = await db(`admin_audit_logs?select=id&target_id=eq.${ruleId}&action=eq.face_teaching_rule_publish`);
  check(denied.status >= 500 && afterFault?.status === "draft" && afterFault.version === before.version
    && afterFault.published_at === null && faultAudits.length === 0,
  "publish audit fault rolls back status and version",
  `HTTP ${denied.status}, status ${afterFault?.status}, audits ${faultAudits.length}`);
  removeFault();
  const publish = await api(`/api/admin/face-teachings/${ruleUuid}`, "PATCH", token, { status: "published" });
  const [afterPublish] = await db(`face_teaching_rules?select=status,version,published_at&id=eq.${ruleUuid}`);
  const publishAudits = await db(`admin_audit_logs?select=id,admin_user_id&target_id=eq.${ruleId}&action=eq.face_teaching_rule_publish`);
  check(publish.status === 200 && afterPublish?.status === "published" && Boolean(afterPublish.published_at)
    && afterPublish.version === before.version && publishAudits.length === 1
    && publishAudits[0].admin_user_id === profileId,
  "healthy publish writes one named audit", `HTTP ${publish.status}, audits ${publishAudits.length}`);

  const beforeImport = await db(`face_teaching_rules?select=id&created_by=eq.${profileId}`);
  installFault("face_teaching_rule_import_builtin", "");
  const importFault = await api("/api/admin/face-teachings/import-builtin", "POST", token);
  const afterImportFault = await db(`face_teaching_rules?select=id&created_by=eq.${profileId}`);
  const importFaultAudits = await db(`admin_audit_logs?select=id&admin_user_id=eq.${profileId}&action=eq.face_teaching_rule_import_builtin`);
  check(importFault.status >= 500 && afterImportFault.length === beforeImport.length
    && importFaultAudits.length === 0, "import audit fault rolls back all inserted rules",
  `HTTP ${importFault.status}, rules ${afterImportFault.length}`);
  removeFault();
  const imported = await api("/api/admin/face-teachings/import-builtin", "POST", token);
  const afterImport = await db(`face_teaching_rules?select=id&created_by=eq.${profileId}`);
  check(imported.status === 200 && imported.body.attempted > 0 && imported.body.inserted > 0
    && imported.body.skipped === imported.body.attempted - imported.body.inserted
    && afterImport.length === beforeImport.length + imported.body.inserted,
  "healthy import inserts all available built-ins", `HTTP ${imported.status}, inserted ${imported.body.inserted}`);
  const repeated = await api("/api/admin/face-teachings/import-builtin", "POST", token);
  const afterRepeat = await db(`face_teaching_rules?select=id&created_by=eq.${profileId}`);
  const importAudits = await db(`admin_audit_logs?select=id,admin_user_id&admin_user_id=eq.${profileId}&action=eq.face_teaching_rule_import_builtin`);
  check(repeated.status === 200 && repeated.body.inserted === 0
    && repeated.body.skipped === repeated.body.attempted && afterRepeat.length === afterImport.length
    && importAudits.length === 2 && importAudits.every((row) => row.admin_user_id === profileId),
  "repeated import is idempotent with named audit", `HTTP ${repeated.status}, audits ${importAudits.length}`);
} finally {
  if (faultInstalled) sql(`drop trigger if exists ${faultName} on public.admin_audit_logs; drop function if exists public.${faultName}();`);
  if (profileId) sql(`begin;
    delete from public.face_teaching_rules where created_by = '${profileId}';
    delete from public.admin_audit_logs where admin_user_id = '${profileId}';
    delete from public.profiles where id = '${profileId}';
    delete from auth.users where id = '${authId}';
    commit;`);
  else if (authId) sql(`delete from auth.users where id = '${authId}';`);
  if (profileId && ((await db(`face_teaching_rules?select=id&created_by=eq.${profileId}`)).length
    || (await db(`admin_audit_logs?select=id&admin_user_id=eq.${profileId}`)).length)) {
    throw new Error("QA rule/audit fixtures remain");
  }
  console.log("QA trigger/rules/audit/Auth/profile fixtures cleaned");
}
console.log(`${passed}/${checks} face teaching write atomicity checks passed`);
if (passed !== checks) process.exitCode = 1;

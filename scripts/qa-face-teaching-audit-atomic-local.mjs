#!/usr/bin/env node
// Local-only fault injection: published teaching must not exist without audit.
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
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(5).toString("hex");
const ruleId = `QA_FACE_AUDIT_${tag.toUpperCase()}`;
const faultName = `qa_face_audit_fault_${tag}`;
const email = `qa-face-audit-${tag}@example.test`;
let authId, profileId, triggerInstalled = false, passed = 0;
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
async function api(token, body) {
  const response = await fetch(`${baseUrl}/api/admin/face-teachings`, { method: "POST", headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json"
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Local audit trigger SQL failed: ${(result.stderr || "").slice(0, 170)}`);
}
const payload = { kind: "surface", ruleId, target: "forehead", memberText: "QA audit fail isolated",
  teacherText: "QA audit integrity", status: "published" };
try {
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local admin");
  authId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Face Audit Admin", role: "admin" }]);
  profileId = profile.id;
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local admin");
  const token = login.data.session.access_token;
  check((await api("", payload)).status === 401, "anonymous publish rejected 401");

  sql(`begin; create function public.${faultName}() returns trigger language plpgsql as $$
    begin if new.target_id = '${ruleId}' and new.action = 'face_teaching_rule_create' then
      raise exception 'QA scoped face audit failure'; end if; return new; end; $$;
    create trigger ${faultName} before insert on public.admin_audit_logs
    for each row execute function public.${faultName}(); commit;`);
  triggerInstalled = true;
  const fault = await api(token, payload);
  const duringFault = await db(`face_teaching_rules?select=id,status&rule_id=eq.${ruleId}`);
  const auditDuringFault = await db(`admin_audit_logs?select=id&target_id=eq.${ruleId}`);
  check(fault.status >= 500, "audit failure prevents publish success", `HTTP ${fault.status}`);
  check(duringFault.length === 0 || duringFault.every((row) => row.status !== "published"),
    "audit failure leaves no published teaching", `rows ${duringFault.length}, status ${duringFault[0]?.status || "none"}`);
  check(auditDuringFault.length === 0, "scoped audit fault inserted no audit", `rows ${auditDuringFault.length}`);

  sql(`drop trigger ${faultName} on public.admin_audit_logs; drop function public.${faultName}();`);
  triggerInstalled = false;
  await db(`face_teaching_rules?rule_id=eq.${ruleId}`, "DELETE");
  const retry = await api(token, payload);
  const afterRetry = await db(`face_teaching_rules?select=id,status&rule_id=eq.${ruleId}`);
  const auditAfterRetry = await db(`admin_audit_logs?select=id,admin_user_id&target_id=eq.${ruleId}`);
  check(retry.status === 200, "healthy publish succeeds after fault removed", `HTTP ${retry.status}`);
  check(afterRetry.length === 1 && afterRetry[0].status === "published"
    && auditAfterRetry.length === 1 && auditAfterRetry[0].admin_user_id === profileId,
  "healthy publish has one named audit", `rules ${afterRetry.length}, audits ${auditAfterRetry.length}`);
} finally {
  if (triggerInstalled) sql(`drop trigger if exists ${faultName} on public.admin_audit_logs; drop function if exists public.${faultName}();`);
  await db(`face_teaching_rules?rule_id=eq.${ruleId}`, "DELETE");
  await db(`admin_audit_logs?target_id=eq.${ruleId}`, "DELETE");
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`face_teaching_rules?select=id&rule_id=eq.${ruleId}`)).length
    || (await db(`admin_audit_logs?select=id&target_id=eq.${ruleId}`)).length
    || (await db(`profiles?select=id&email=eq.${email}`)).length) throw new Error("QA fixture remains");
  console.log("QA trigger/rule/audit/Auth/profile fixtures cleaned");
}
console.log(`${passed}/6 face teaching audit atomicity checks passed`);
if (passed !== 6) process.exitCode = 1;

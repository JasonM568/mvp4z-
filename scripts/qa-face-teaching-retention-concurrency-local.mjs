#!/usr/bin/env node
// Local-only C17 checks for cited-rule retention and concurrent PATCH/DELETE.
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
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase/DB");

const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(6).toString("hex").toUpperCase();
const emails = [0, 1].map((n) => `qa-c17-${tag}-${n}@example.test`);
const ruleIds = [`QA_C17_CITED_${tag}`, `QA_C17_RACE_${tag}`, `QA_C17_AUDIT_${tag}`];
const faultName = `qa_c17_delete_audit_fault_${tag.toLowerCase()}`;
const authIds = [];
const profileIds = [];
const ruleUuids = [];
const runIds = [];
let passed = 0, checks = 0, faultInstalled = false;

function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  checks++;
  if (ok) passed++;
}

function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Local audit trigger SQL failed: ${(result.stderr || "").slice(0, 170)}`);
}

async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, {
    method,
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} HTTP ${response.status}`);
  return result;
}

async function api(path, method, token, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  const tokens = [];
  for (const [index, email] of emails.entries()) {
    const password = `QA-${crypto.randomBytes(16).toString("hex")}`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Cannot create local C17 admin");
    authIds.push(created.data.user.id);
    const [profile] = await db("profiles", "POST", [{
      auth_user_id: created.data.user.id, email, name: `QA C17 Admin ${index + 1}`, role: "admin"
    }]);
    profileIds.push(profile.id);
    const login = await anon.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local C17 admin");
    tokens.push(login.data.session.access_token);
  }

  const create = async (ruleId, status) => {
    const result = await api("/api/admin/face-teachings", "POST", tokens[0], {
      kind: "surface", ruleId, target: "forehead", memberText: "C17 isolated citation",
      teacherText: "C17 audit trace", status
    });
    if (result.status !== 200 || !result.body.rule?.id) throw new Error(`C17 fixture create failed: HTTP ${result.status}`);
    ruleUuids.push(result.body.rule.id);
    return result.body.rule.id;
  };

  const citedUuid = await create(ruleIds[0], "published");
  const [run] = await db("face_analysis_runs", "POST", [{
    request_id: crypto.randomUUID(), user_id: profileIds[0], mode: "self", consent_version: "c17-test",
    report_structured: { lifeAreas: { career: { citedTeachings: [ruleIds[0]] } } }
  }]);
  runIds.push(run.id);
  const citedPath = `/api/admin/face-teachings/${citedUuid}`;
  const archive = await api(citedPath, "PATCH", tokens[0], { status: "archived" });
  const retainedDelete = await api(citedPath, "DELETE", tokens[0]);
  const [citedRule] = await db(`face_teaching_rules?select=id,rule_id,status,published_at&id=eq.${citedUuid}`);
  const [savedRun] = await db(`face_analysis_runs?select=report_structured&id=eq.${run.id}`);
  check(archive.status === 200 && retainedDelete.status === 409 && citedRule?.status === "archived"
    && citedRule?.published_at && savedRun?.report_structured?.lifeAreas?.career?.citedTeachings?.[0] === ruleIds[0],
  "archived cited teaching remains resolvable from the historical report",
  `archive=${archive.status}, delete=${retainedDelete.status}`);

  const raceUuid = await create(ruleIds[1], "draft");
  const racePath = `/api/admin/face-teachings/${raceUuid}`;
  const outcomes = await Promise.all([
    api(racePath, "PATCH", tokens[0], { status: "published" }),
    api(racePath, "DELETE", tokens[1])
  ]);
  const statuses = outcomes.map((item) => item.status).sort((a, b) => a - b);
  const [raceRule] = await db(`face_teaching_rules?select=id,rule_id,status,published_at&id=eq.${raceUuid}`);
  const raceAudits = await db(`admin_audit_logs?select=action,admin_user_id,target_id&target_id=eq.${ruleIds[1]}`);
  // DELETE may finish first, so PATCH can see a missing row (404) or lose its update (409).
  const finalStateConsistent = statuses[0] === 200 && [404, 409].includes(statuses[1])
    && ((raceRule && raceRule.published_at && raceRule.status === "published"
      && raceAudits.length === 2
      && raceAudits.some((row) => row.action === "face_teaching_rule_publish" && row.admin_user_id === profileIds[0])
      && !raceAudits.some((row) => row.action === "face_teaching_rule_delete"))
      || (!raceRule && raceAudits.length === 2
        && raceAudits.some((row) => row.action === "face_teaching_rule_delete" && row.admin_user_id === profileIds[1])
        && !raceAudits.some((row) => row.action === "face_teaching_rule_publish")));
  check(finalStateConsistent, "concurrent named-admin publish/delete serializes with matching audit",
    `statuses=${outcomes.map((item) => item.status).join(",")}, retained=${Boolean(raceRule)}, audit_rows=${raceAudits.length}`);

  const auditUuid = await create(ruleIds[2], "draft");
  const auditPath = `/api/admin/face-teachings/${auditUuid}`;
  const directRpc = await fetch(`${env.REST_URL}/rpc/delete_face_teaching_rule_if_never_published`, {
    method: "POST", headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${tokens[1]}`,
      "Content-Type": "application/json" },
    body: JSON.stringify({ p_rule_uuid: auditUuid, p_admin_user_id: profileIds[1] })
  });
  const afterDirectRpc = await db(`face_teaching_rules?select=id&id=eq.${auditUuid}`);
  check([401, 403, 404].includes(directRpc.status) && afterDirectRpc.length === 1,
    "authenticated admin token cannot call privileged delete RPC directly",
  `HTTP ${directRpc.status}, rule=${afterDirectRpc.length}`);
  sql(`begin; create function public.${faultName}() returns trigger language plpgsql as $$
    begin if new.target_id = '${ruleIds[2]}' and new.action = 'face_teaching_rule_delete' then
      raise exception 'QA scoped C17 delete audit failure'; end if; return new; end; $$;
    create trigger ${faultName} before insert on public.admin_audit_logs
    for each row execute function public.${faultName}(); commit;`);
  faultInstalled = true;
  const rejectedDelete = await api(auditPath, "DELETE", tokens[0]);
  const duringFault = await db(`face_teaching_rules?select=id&id=eq.${auditUuid}`);
  const auditDuringFault = await db(`admin_audit_logs?select=id&target_id=eq.${ruleIds[2]}&action=eq.face_teaching_rule_delete`);
  check(rejectedDelete.status >= 500 && duringFault.length === 1 && auditDuringFault.length === 0,
    "delete audit fault rolls back draft deletion", `HTTP ${rejectedDelete.status}, rule=${duringFault.length}, audit=${auditDuringFault.length}`);
  sql(`drop trigger ${faultName} on public.admin_audit_logs; drop function public.${faultName}();`);
  faultInstalled = false;
  const healthyDelete = await api(auditPath, "DELETE", tokens[0]);
  const afterDelete = await db(`face_teaching_rules?select=id&id=eq.${auditUuid}`);
  const auditAfterDelete = await db(`admin_audit_logs?select=id,admin_user_id&target_id=eq.${ruleIds[2]}&action=eq.face_teaching_rule_delete`);
  check(healthyDelete.status === 200 && afterDelete.length === 0 && auditAfterDelete.length === 1
    && auditAfterDelete[0].admin_user_id === profileIds[0], "healthy draft delete leaves one named audit",
  `HTTP ${healthyDelete.status}, rule=${afterDelete.length}, audit=${auditAfterDelete.length}`);
} finally {
  if (faultInstalled) sql(`drop trigger if exists ${faultName} on public.admin_audit_logs; drop function if exists public.${faultName}();`);
  for (const id of runIds) await db(`face_analysis_runs?id=eq.${id}`, "DELETE");
  for (const id of ruleUuids) await db(`face_teaching_rules?id=eq.${id}`, "DELETE");
  for (const id of ruleIds) await db(`admin_audit_logs?target_id=eq.${id}`, "DELETE");
  for (const id of profileIds) await db(`profiles?id=eq.${id}`, "DELETE");
  for (const id of authIds) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) throw new Error("Local C17 Auth cleanup failed");
  }
  const rulesRemain = await db(`face_teaching_rules?select=id&rule_id=in.(${ruleIds.join(",")})`);
  const auditsRemain = await db(`admin_audit_logs?select=id&target_id=in.(${ruleIds.join(",")})`);
  if (rulesRemain.length || auditsRemain.length) throw new Error("C17 test fixtures remain");
  console.log("C17 local report/rule/audit/Auth/profile fixtures cleaned");
}

console.log(`${passed}/${checks} C17 QA retention concurrency checks passed`);
if (passed !== checks) process.exitCode = 1;

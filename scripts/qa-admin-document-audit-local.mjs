#!/usr/bin/env node
// Local isolated fault injection: enabling a document for AI prompts needs an audit in the same outcome.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"])
  throw new Error("Provide local --base-url and --env-file");
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
const email = `qa-document-audit-${tag}@example.test`;
const documentId = crypto.randomUUID();
const triggerName = `qa_document_audit_${tag}`;
let authId, profileId, triggerInstalled = false, checks = 0, passed = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method,
    signal: AbortSignal.timeout(20_000), headers: {
      apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation"
    }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} HTTP ${response.status}`);
  return response.json().catch(() => []);
}
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Local scoped audit SQL failed: ${(result.stderr || "").slice(0, 180)}`);
}
async function patch(token, body) {
  const response = await fetch(`${baseUrl}/api/admin/documents/${documentId}`, {
    method: "PATCH", signal: AbortSignal.timeout(20_000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return response.status;
}
async function state() {
  const rows = await db(`ai_documents?select=id,title,include_in_prompt&id=eq.${documentId}`);
  const audits = await db(`admin_audit_logs?select=id,admin_user_id,action&target_id=eq.${documentId}`);
  return { row: rows[0], audits };
}
try {
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error("Cannot create QA admin");
  authId = made.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Document Audit", role: "admin" }]);
  profileId = profile.id;
  const login = await signer.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot login QA admin");
  const token = login.data.session.access_token;
  const preflight = await fetch(`${baseUrl}/api/admin/documents`, {
    signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}` }
  });
  if (preflight.status !== 200) throw new Error(`QA admin preflight HTTP ${preflight.status}`);
  await db("ai_documents", "POST", [{ id: documentId, title: `QA scoped ${tag}`,
    category: "reference", term: "qimen", storage_path: `qa/document-audit/${tag}.md`,
    original_name: "qa.md", mime_type: "text/markdown", size_bytes: 2,
    extracted_text: "QA", char_count: 2, include_in_prompt: false, created_by: profileId }]);
  check((await patch("", { include_in_prompt: true })) === 401, "anonymous PATCH denied");
  check((await state()).row.include_in_prompt === false, "anonymous left document disabled");

  sql(`begin; create function public.${triggerName}() returns trigger language plpgsql as $$
    begin if new.target_id = '${documentId}' and new.action = 'documents.update' then
      raise exception 'QA scoped document audit failure'; end if; return new; end; $$;
    create trigger ${triggerName} before insert on public.admin_audit_logs
    for each row execute function public.${triggerName}(); commit;`);
  triggerInstalled = true;
  const faultStatus = await patch(token, { include_in_prompt: true });
  const faultState = await state();
  check(faultStatus >= 500, "audit failure prevents API success", `HTTP ${faultStatus}`);
  check(faultState.row?.include_in_prompt === false, "audit failure leaves prompt selection unchanged",
    `included ${faultState.row?.include_in_prompt}`);
  check(faultState.audits.length === 0, "fault inserts no audit", `rows ${faultState.audits.length}`);

  sql(`drop trigger ${triggerName} on public.admin_audit_logs; drop function public.${triggerName}();`);
  triggerInstalled = false;
  const healthyStatus = await patch(token, { title: `QA updated ${tag}` });
  const healthyState = await state();
  check(healthyStatus === 200, "healthy PATCH succeeds", `HTTP ${healthyStatus}`);
  check(healthyState.row?.title === `QA updated ${tag}` && healthyState.audits.length === 1
    && healthyState.audits[0].admin_user_id === profileId, "healthy PATCH has named audit",
  `audits ${healthyState.audits.length}`);
} finally {
  if (triggerInstalled) sql(`drop trigger if exists ${triggerName} on public.admin_audit_logs; drop function if exists public.${triggerName}();`);
  await db(`admin_audit_logs?target_id=eq.${documentId}`, "DELETE");
  await db(`ai_documents?id=eq.${documentId}`, "DELETE");
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error("QA Auth cleanup failed");
  }
  if ((await db(`ai_documents?select=id&id=eq.${documentId}`)).length
    || (await db(`admin_audit_logs?select=id&target_id=eq.${documentId}`)).length
    || (await db(`profiles?select=id&email=eq.${email}`)).length)
    throw new Error("QA document/audit/profile remains");
  console.log("QA trigger/document/audit/Auth/profile fixtures cleaned");
}
console.log(`${passed}/${checks} document audit atomicity checks passed`);
if (passed !== checks) process.exitCode = 1;

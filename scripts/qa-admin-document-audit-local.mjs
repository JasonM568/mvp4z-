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
const uploadName = `qa-audit-upload-${tag}.md`;
const fixturePath = `qa/document-audit/${tag}.md`;
const triggerName = `qa_document_audit_${tag}`;
let authId, profileId, triggerInstalled = false, checks = 0, passed = 0;
const uploadedPaths = [];
const uploadedDocumentIds = [];
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
function sqlValue(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], {
    encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Local scoped SQL query failed: ${(result.stderr || "").slice(0, 180)}`);
  return result.stdout.trim();
}
function installFault(condition) {
  sql(`begin; create function public.${triggerName}() returns trigger language plpgsql as $$
    begin if ${condition} then raise exception 'QA scoped document audit failure'; end if;
      return new; end; $$;
    create trigger ${triggerName} before insert on public.admin_audit_logs
    for each row execute function public.${triggerName}(); commit;`);
  triggerInstalled = true;
}
function dropFault() {
  sql(`drop trigger ${triggerName} on public.admin_audit_logs; drop function public.${triggerName}();`);
  triggerInstalled = false;
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
async function objectExists(path) {
  const result = await service.storage.from("yixue-documents").download(path);
  return !result.error && Boolean(result.data);
}
async function upload(token) {
  const form = new FormData();
  form.set("file", new Blob(["QA"], { type: "text/markdown" }), uploadName);
  form.set("title", `QA upload ${tag}`);
  const response = await fetch(`${baseUrl}/api/admin/documents`, {
    method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}` }, body: form
  });
  return response.status;
}
async function remove(token, id = documentId) {
  const response = await fetch(`${baseUrl}/api/admin/documents/${id}`, {
    method: "DELETE", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.status;
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
  const preflightBody = await preflight.json();
  const charBudget = Number(preflightBody.char_budget);
  if (!Number.isSafeInteger(charBudget) || charBudget < 2)
    throw new Error("QA document character budget unavailable");
  await db("ai_documents", "POST", [{ id: documentId, title: `QA scoped ${tag}`,
    category: "reference", term: "qimen", storage_path: fixturePath,
    original_name: "qa.md", mime_type: "text/markdown", size_bytes: 2,
    extracted_text: "QA", char_count: 2, include_in_prompt: false, created_by: profileId }]);
  check((await patch("", { include_in_prompt: true })) === 401, "anonymous PATCH denied");
  check((await state()).row.include_in_prompt === false, "anonymous left document disabled");

  installFault(`new.target_id = '${documentId}' and new.action = 'documents.update'`);
  const faultStatus = await patch(token, { include_in_prompt: true });
  const faultState = await state();
  check(faultStatus >= 500, "audit failure prevents API success", `HTTP ${faultStatus}`);
  check(faultState.row?.include_in_prompt === false, "audit failure leaves prompt selection unchanged",
    `included ${faultState.row?.include_in_prompt}`);
  check(faultState.audits.length === 0, "fault inserts no audit", `rows ${faultState.audits.length}`);

  dropFault();
  const healthyStatus = await patch(token, { title: `QA updated ${tag}` });
  const healthyState = await state();
  check(healthyStatus === 200, "healthy PATCH succeeds", `HTTP ${healthyStatus}`);
  check(healthyState.row?.title === `QA updated ${tag}` && healthyState.audits.length === 1
    && healthyState.audits[0].admin_user_id === profileId, "healthy PATCH has named audit",
  `audits ${healthyState.audits.length}`);

  // A legacy included document may already exceed today's budget. Editing its
  // title must remain possible; an explicit re-enable must still hit the gate.
  await db(`ai_documents?id=eq.${documentId}`, "PATCH", {
    include_in_prompt: true, char_count: charBudget + 1
  });
  const legacyTitleStatus = await patch(token, { title: `QA legacy title ${tag}` });
  const legacyTitleState = await state();
  check(legacyTitleStatus === 200 && legacyTitleState.row?.title === `QA legacy title ${tag}`
    && legacyTitleState.row.include_in_prompt === true,
    "title-only PATCH works on pre-existing over-budget included document",
    `HTTP ${legacyTitleStatus}`);
  check(legacyTitleState.audits.length === 2
    && legacyTitleState.audits.every((audit) => audit.admin_user_id === profileId),
    "title-only legacy PATCH has named audit", `audits ${legacyTitleState.audits.length}`);
  const explicitEnableStatus = await patch(token, { include_in_prompt: true });
  const explicitEnableState = await state();
  check(explicitEnableStatus === 400 && explicitEnableState.audits.length === 2
    && explicitEnableState.row?.include_in_prompt === true,
    "explicit re-enable still enforces character budget without extra audit",
    `HTTP ${explicitEnableStatus}`);
  await db(`ai_documents?id=eq.${documentId}`, "PATCH", {
    include_in_prompt: false, char_count: 2
  });

  installFault(`new.admin_user_id = '${profileId}' and new.action = 'documents.upload'`);
  const uploadStatus = await upload(token);
  const uploadedRows = await db(`ai_documents?select=id,storage_path&original_name=eq.${uploadName}`);
  for (const row of uploadedRows) uploadedPaths.push(row.storage_path);
  const uploadAudits = uploadedRows.length ? await db(
    `admin_audit_logs?select=id&target_id=eq.${uploadedRows[0].id}&action=eq.documents.upload`) : [];
  check(uploadStatus >= 500, "audit failure prevents upload success", `HTTP ${uploadStatus}`);
  check(uploadedRows.length === 0, "audit failure leaves no uploaded document", `rows ${uploadedRows.length}`);
  check(uploadAudits.length === 0, "upload audit fault writes no audit", `rows ${uploadAudits.length}`);
  const faultOrphans = Number(sqlValue(`select count(*) from storage.objects o
    where o.bucket_id = 'yixue-documents' and o.name like '${profileId}/%'
    and not exists (select 1 from public.ai_documents d where d.storage_path = o.name)`));
  check(faultOrphans === 0, "failed upload leaves no scoped Storage orphan", `objects ${faultOrphans}`);
  dropFault();

  const stored = await service.storage.from("yixue-documents").upload(fixturePath,
    new TextEncoder().encode("QA"), { contentType: "text/markdown", upsert: false });
  if (stored.error) throw new Error(`QA fixture Storage upload failed: ${stored.error.message}`);
  uploadedPaths.push(fixturePath);
  installFault(`new.target_id = '${documentId}' and new.action = 'documents.delete'`);
  const deleteStatus = await remove(token);
  const afterDelete = await db(`ai_documents?select=id&id=eq.${documentId}`);
  const deleteAudits = await db(`admin_audit_logs?select=id&target_id=eq.${documentId}&action=eq.documents.delete`);
  const storageStillExists = await objectExists(fixturePath);
  check(deleteStatus >= 500, "audit failure prevents delete success", `HTTP ${deleteStatus}`);
  check(afterDelete.length === 1 && storageStillExists,
    "audit failure retains document and Storage object",
    `documents ${afterDelete.length}, object ${storageStillExists}`);
  check(deleteAudits.length === 0, "delete audit fault writes no audit", `rows ${deleteAudits.length}`);
  dropFault();

  const goodUploadStatus = await upload(token);
  const goodUploads = await db(`ai_documents?select=id,storage_path&original_name=eq.${uploadName}`);
  if (goodUploads[0]) {
    uploadedDocumentIds.push(goodUploads[0].id);
    uploadedPaths.push(goodUploads[0].storage_path);
  }
  check(goodUploadStatus === 201 && goodUploads.length === 1,
    "healthy POST creates one document", `HTTP ${goodUploadStatus}, rows ${goodUploads.length}`);
  const goodUploadAudit = goodUploads[0] ? await db(
    `admin_audit_logs?select=id,admin_user_id&target_id=eq.${goodUploads[0].id}&action=eq.documents.upload`) : [];
  check(goodUploadAudit.length === 1 && goodUploadAudit[0].admin_user_id === profileId
    && await objectExists(goodUploads[0].storage_path),
  "healthy POST has named audit and private Storage object");
  const goodDeleteStatus = await remove(token, goodUploads[0].id);
  const goodDeleteRows = await db(`ai_documents?select=id&id=eq.${goodUploads[0].id}`);
  const goodDeleteAudit = await db(`admin_audit_logs?select=id&target_id=eq.${goodUploads[0].id}&action=eq.documents.delete`);
  check(goodDeleteStatus === 200 && goodDeleteRows.length === 0
    && goodDeleteAudit.length === 1, "healthy DELETE removes row with audit", `HTTP ${goodDeleteStatus}`);
  check(!(await objectExists(goodUploads[0].storage_path)),
    "healthy DELETE removes private Storage object");
  const finalOrphans = Number(sqlValue(`select count(*) from storage.objects o
    where o.bucket_id = 'yixue-documents' and o.name like '${profileId}/%'
    and not exists (select 1 from public.ai_documents d where d.storage_path = o.name)`));
  check(finalOrphans === 0, "normal document lifecycle leaves no scoped Storage orphan",
    `objects ${finalOrphans}`);
} finally {
  if (triggerInstalled) sql(`drop trigger if exists ${triggerName} on public.admin_audit_logs; drop function if exists public.${triggerName}();`);
  await db(`admin_audit_logs?target_id=eq.${documentId}`, "DELETE");
  for (const id of uploadedDocumentIds) await db(`admin_audit_logs?target_id=eq.${id}`, "DELETE");
  await db(`ai_documents?id=eq.${documentId}`, "DELETE");
  const other = await db(`ai_documents?select=id,storage_path&original_name=eq.${uploadName}`);
  for (const row of other) {
    await db(`admin_audit_logs?target_id=eq.${row.id}`, "DELETE");
    await db(`ai_documents?id=eq.${row.id}`, "DELETE");
    uploadedPaths.push(row.storage_path);
  }
  for (const path of new Set(uploadedPaths)) {
    const removed = await service.storage.from("yixue-documents").remove([path]);
    if (removed.error) throw new Error("QA Storage cleanup failed");
    if (await objectExists(path)) throw new Error("QA Storage object remains");
  }
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error("QA Auth cleanup failed");
  }
  if ((await db(`ai_documents?select=id&id=eq.${documentId}`)).length
    || (await db(`admin_audit_logs?select=id&target_id=eq.${documentId}`)).length
    || (await db(`ai_documents?select=id&original_name=eq.${uploadName}`)).length
    || (await db(`profiles?select=id&email=eq.${email}`)).length)
    throw new Error("QA document/audit/profile remains");
  console.log("QA trigger/document/audit/Auth/profile fixtures cleaned");
}
console.log(`${passed}/${checks} document audit atomicity checks passed`);
if (passed !== checks) process.exitCode = 1;

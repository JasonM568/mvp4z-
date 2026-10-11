#!/usr/bin/env node
// Local-only C6 HTTP coverage: named-admin bulk/import revision and audit trail.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
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
const apiUrl = (env.API_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
const anonKey = env.ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(apiUrl || "")
    || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || "")
    || !anonKey || !serviceKey) throw new Error("Refusing non-local Supabase");
const sharedKey = "qa-face-shared-only";
const authAdmin = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });
const authMember = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-face-bulk-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const cardCode = `QA-FKB-${suffix}`;
const importCode = `QA-FKI-${suffix}`;
const duplicateCode = `QA-FKD-${suffix}`;
let authUserId, profileId, token, cardId, importedId, faultInstalled = false;
const faultName = `qa_face_fault_${suffix}`;
let passed = 0;
function check(ok, label) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Face Bulk Admin", role: "admin" }]);
  profileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  const createdCard = await api("POST", "/api/admin/face-knowledge", {
    cardId: cardCode, title: "QA bulk card", category: "qa", observation: "isolated"
  });
  cardId = createdCard.body.item?.id;
  if (createdCard.status !== 201 || !cardId) throw new Error(`Cannot create QA card: HTTP ${createdCard.status}`);
  check(await revisionAudit(cardId, 1, "draft", "face_knowledge_created"), "named create has v1 revision/audit");

  for (const [label, method, path, body] of [
    ["create", "POST", "/api/admin/face-knowledge", { cardId: `${cardCode}-shared`, title: "Shared", category: "qa" }],
    ["patch", "PATCH", `/api/admin/face-knowledge/${cardId}`, { expectedVersion: 1, title: "Shared" }],
    ["delete", "DELETE", `/api/admin/face-knowledge/${cardId}`, undefined],
    ["bulk", "POST", "/api/admin/face-knowledge/bulk", { ids: [cardId], action: "publish" }],
    ["import", "POST", "/api/admin/face-knowledge/import", { items: [importItem(`${cardCode}-shared`)] }]
  ]) {
    const response = await api(method, path, body, "shared");
    check(response.status === 403, `shared ADMIN_KEY ${label} rejected 403`);
  }
  check(await revisionAudit(cardId, 1, "draft", "face_knowledge_created"),
    "shared-key attempts leave card/version/revision/audit unchanged");

  sql(`begin;
    create function public.${faultName}() returns trigger language plpgsql as $$
    begin
      if new.target_id = '${cardId}' and new.action = 'face_knowledge_bulk_submit_review' then
        raise exception 'QA_C6_AUDIT_FAILURE';
      end if;
      return new;
    end $$;
    create trigger ${faultName} before insert on public.admin_audit_logs
      for each row execute function public.${faultName}();
    commit;`);
  faultInstalled = true;
  const failedBulk = await api("POST", "/api/admin/face-knowledge/bulk", {
    ids: [cardId], action: "submit_review"
  });
  check(failedBulk.status === 500 && await revisionAudit(cardId, 1, "draft", "face_knowledge_created"),
    "injected audit failure rolls back bulk status/version/revision/audit together");
  sql(`drop trigger ${faultName} on public.admin_audit_logs; drop function public.${faultName}();`);
  faultInstalled = false;

  for (const [action, status, version] of [
    ["submit_review", "teacher_review", 2], ["publish", "published", 3], ["archive", "archived", 4]
  ]) {
    const response = await api("POST", "/api/admin/face-knowledge/bulk", { ids: [cardId], action });
    check(response.status === 200 && response.body.updated === 1
      && await revisionAudit(cardId, version, status, `face_knowledge_bulk_${action}`),
    `bulk ${action} creates v${version} snapshot and named audit`);
  }

  const newImport = await api("POST", "/api/admin/face-knowledge/import", {
    items: [importItem(importCode)]
  });
  [importedId] = (await db(`face_knowledge_cards?select=id&card_id=eq.${importCode}`)).map((row) => row.id);
  check(newImport.status === 200 && newImport.body.imported === 1 && importedId
    && await revisionAudit(importedId, 1, "draft", "face_knowledge_imported"),
  "import new card creates v1 draft, snapshot and named audit");

  const existingImport = await api("POST", "/api/admin/face-knowledge/import", {
    items: [{ ...importItem(cardCode), title: "QA imported revision" }]
  });
  const [upserted] = await db(`face_knowledge_cards?select=id,title,created_by&card_id=eq.${cardCode}`);
  check(existingImport.status === 200 && existingImport.body.imported === 1
    && upserted?.id === cardId && upserted?.title === "QA imported revision"
    && upserted?.created_by === profileId
    && await revisionAudit(cardId, 5, "draft", "face_knowledge_imported"),
  "import upsert keeps creator and increments to v5 with snapshot/audit");

  const duplicate = await api("POST", "/api/admin/face-knowledge/import", {
    items: [importItem(duplicateCode), { ...importItem(duplicateCode), title: "duplicate" }]
  });
  check(duplicate.status === 400, `duplicate card_id in one import rejected 400 (HTTP ${duplicate.status})`);
  check((await db(`face_knowledge_cards?select=id&card_id=eq.${duplicateCode}`)).length === 0,
    "duplicate import leaves no partial card");
} finally {
  if (faultInstalled) sql(`drop trigger if exists ${faultName} on public.admin_audit_logs; drop function if exists public.${faultName}();`);
  for (const code of [cardCode, importCode, duplicateCode, `${cardCode}-shared`]) {
    const rows = await db(`face_knowledge_cards?select=id&card_id=eq.${code}`);
    for (const row of rows) {
      await db(`admin_audit_logs?target_id=eq.${row.id}`, "DELETE");
      await db(`face_knowledge_cards?id=eq.${row.id}`, "DELETE");
    }
  }
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA Auth cleanup failed");
  }
}
for (const code of [cardCode, importCode, duplicateCode, `${cardCode}-shared`]) {
  if ((await db(`face_knowledge_cards?select=id&card_id=eq.${code}`)).length) throw new Error(`QA card ${code} remains`);
}
if (profileId && (await db(`profiles?select=id&id=eq.${profileId}`)).length) throw new Error("QA profile remains");
console.log(`${passed}/15 face-knowledge bulk/import checks passed; fixtures cleaned`);
if (passed !== 15) process.exitCode = 1;

function importItem(code) { return { card_id: code, title: "QA import", category: "qa", observation: "isolated" }; }
function sql(statement) {
  const result = spawnSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-q"], {
    input: statement, encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Local SQL fault setup failed: ${(result.stderr || "").slice(0, 180)}`);
}
async function revisionAudit(id, version, status, action) {
  const [card] = await db(`face_knowledge_cards?select=id,status,version,created_by,updated_by&id=eq.${id}`);
  const revisions = await db(`face_knowledge_revisions?select=version,snapshot,changed_by&knowledge_id=eq.${id}`);
  const audits = await db(`admin_audit_logs?select=action,admin_user_id,metadata&target_id=eq.${id}`);
  return card?.status === status && card?.version === version && card?.created_by === profileId
    && revisions.length === version && revisions.some((row) => row.version === version
      && row.snapshot?.status === status && row.snapshot?.version === version
      && row.changed_by === profileId)
    && audits.length === version && audits.some((row) => row.action === action && row.admin_user_id === profileId);
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, { method, headers: {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json().catch(() => []);
}
async function api(method, path, body, auth = "named") {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    ...(auth === "shared" ? { "X-Admin-Key": sharedKey } : { Authorization: `Bearer ${token}` }),
    "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

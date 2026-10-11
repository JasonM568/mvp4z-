#!/usr/bin/env node
// Local-only named-admin API/DB regression. Never publishes a knowledge card.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
const cas = args.cas === "true";
const twoAdmins = args["two-admins"] === "true";
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
const email = `qa-face-admin-${suffix}@example.test`;
const cardCode = `QA-FACE-${suffix}`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let authUserId, profileId, authUserId2, profileId2, cardId, token, token2;
let passed = 0;
function check(ok, label) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email, name: "QA Face Admin", role: "admin" }]);
  profileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;
  if (twoAdmins) {
    const secondEmail = `qa-face-admin2-${suffix}@example.test`;
    const secondPassword = `QA-${crypto.randomBytes(12).toString("hex")}`;
    const second = await authAdmin.auth.admin.createUser({ email: secondEmail, password: secondPassword, email_confirm: true });
    if (second.error || !second.data.user) throw new Error("Cannot create second local QA admin");
    authUserId2 = second.data.user.id;
    const [secondProfile] = await db("profiles", "POST", [{ auth_user_id: authUserId2, email: secondEmail, name: "QA Face Admin 2", role: "admin" }]);
    profileId2 = secondProfile.id;
    const secondLogin = await authMember.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
    if (secondLogin.error || !secondLogin.data.session?.access_token) throw new Error("Second local QA admin login failed");
    token2 = secondLogin.data.session.access_token;
  }

  const noAuth = await api("/api/admin/face-knowledge", "", "POST", { cardId: cardCode });
  check(noAuth.status === 401, "anonymous POST rejected 401");
  const memberWrite = await api("/api/admin/face-knowledge", member.access_token, "POST", { cardId: cardCode });
  check(memberWrite.status === 403, "member POST rejected 403");

  for (const [label, input] of [
    ["empty title", { cardId: cardCode, title: "", category: "qa" }],
    ["oversize title", { cardId: cardCode, title: "x".repeat(201), category: "qa" }],
    ["invalid safety level", { cardId: cardCode, title: "QA", category: "qa", safetyLevel: "unsafe" }],
    ["extra field", { cardId: cardCode, title: "QA", category: "qa", injected: "x" }]
  ]) {
    const response = await api("/api/admin/face-knowledge", token, "POST", input);
    check(response.status === 400, `${label} rejected 400`);
  }
  const before = await db(`face_knowledge_cards?select=id&card_id=eq.${cardCode}`, "GET");
  check(before.length === 0, "invalid POSTs left no card");

  const createdCard = await api("/api/admin/face-knowledge", token, "POST", {
    cardId: cardCode, title: "QA draft", category: "qa", observation: "isolated", changeNote: "QA create"
  });
  if (createdCard.status === 201 && createdCard.body.item?.id) cardId = createdCard.body.item.id;
  const initialRevisions = cardId ? await db(`face_knowledge_revisions?select=version,change_note&knowledge_id=eq.${cardId}`, "GET") : [];
  check(createdCard.status === 201 && createdCard.body.item?.status === "draft"
    && initialRevisions.length === 1 && initialRevisions[0].version === 1, "draft POST created card and revision v1");

  const list = await api(`/api/admin/face-knowledge?search=${cardCode}`, token);
  check(list.status === 200 && list.body.items?.some((row) => row.id === cardId), "admin search finds draft card");
  const memberList = await api(`/api/admin/face-knowledge?search=${cardCode}`, member.access_token);
  check(memberList.status === 403, "member list rejected 403");

  const invalidPatch = await api(`/api/admin/face-knowledge/${cardId}`, token, "PATCH",
    { ...(cas ? { expectedVersion: 1 } : {}), title: "x".repeat(201) });
  const [unchanged] = await db(`face_knowledge_cards?select=title,version&id=eq.${cardId}`, "GET");
  check(invalidPatch.status === 400 && unchanged.title === "QA draft" && unchanged.version === 1,
    "oversize PATCH rejected without DB change");

  const patched = await api(`/api/admin/face-knowledge/${cardId}`, token, "PATCH",
    { ...(cas ? { expectedVersion: 1 } : {}), title: "QA revised", changeNote: "QA update" });
  const revisions = await api(`/api/admin/face-knowledge/${cardId}/revisions`, token);
  check(patched.status === 200 && patched.body.item?.version === 2 && revisions.status === 200
    && revisions.body.revisions?.length === 2 && revisions.body.revisions[0].change_note === "QA update",
    "PATCH increments version and revisions API returns v2/v1");

  const archived = await api(`/api/admin/face-knowledge/${cardId}`, token, "DELETE");
  const [afterArchive] = await db(`face_knowledge_cards?select=status,auto_report&id=eq.${cardId}`, "GET");
  check(archived.status === 200 && afterArchive.status === "archived" && afterArchive.auto_report === false,
    "DELETE archives card and disables auto report");

  const audit = await db(`admin_audit_logs?select=action,admin_user_id&target_id=eq.${cardId}`, "GET");
  check(audit.length === 3 && audit.every((row) => row.admin_user_id === profileId)
    && ["face_knowledge_created", "face_knowledge_updated", "face_knowledge_archived"].every(
      (action) => audit.some((row) => row.action === action)), "create/update/archive audit belongs to named admin");

  // A successful edit needs one unique revision and audit; stale edits may return 409.
  const [beforeRace] = await db(`face_knowledge_cards?select=version&id=eq.${cardId}`, "GET");
  const baselineVersion = beforeRace.version;
  const concurrent = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    api(`/api/admin/face-knowledge/${cardId}`, twoAdmins && i % 2 ? token2 : token, "PATCH", {
      ...(cas ? { expectedVersion: baselineVersion } : {}),
      title: `QA race ${i}`, changeNote: `QA race ${i}`
    })));
  const [raceCard] = await db(`face_knowledge_cards?select=title,version&id=eq.${cardId}`, "GET");
  const raceRevisions = await db(`face_knowledge_revisions?select=version,snapshot,change_note&knowledge_id=eq.${cardId}`, "GET");
  const raceAudit = await db(`admin_audit_logs?select=action,admin_user_id,metadata&target_id=eq.${cardId}`, "GET");
  const matching = raceRevisions.filter((row) => row.version === raceCard.version
    && row.snapshot?.title === raceCard.title);
  const responseVersions = concurrent.map((r) => r.body.item?.version ?? null);
  const successes = concurrent.filter((r) => r.status === 200).length;
  const winner = concurrent.findIndex((r) => r.status === 200);
  const expectedWinner = twoAdmins && winner % 2 ? profileId2 : profileId;
  const consistent = concurrent.every((r) => [200, 409].includes(r.status))
    && new Set(responseVersions.filter((version) => version !== null)).size === successes
    && raceCard.version === baselineVersion + successes && raceRevisions.length === raceCard.version
    && matching.length === 1 && raceAudit.length === 3 + successes
    && raceAudit.filter((row) => row.action === "face_knowledge_updated"
      && row.metadata?.version === raceCard.version && row.admin_user_id === expectedWinner).length === 1;
  console.log(`${consistent ? "PASS" : "FAIL"} concurrent PATCH N=10: statuses=${JSON.stringify(concurrent.map((r) => r.status))}, response_versions=${JSON.stringify(responseVersions)}, card_version=${raceCard.version}, revisions=${raceRevisions.length}, audit=${raceAudit.length}, matching_latest=${matching.length}`);
  if (consistent) passed++;
} finally {
  if (cardId) {
    await db(`admin_audit_logs?target_id=eq.${cardId}`, "DELETE");
    await db(`face_knowledge_cards?id=eq.${cardId}`, "DELETE");
  }
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (profileId2) await db(`profiles?id=eq.${profileId2}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
  if (authUserId2) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId2);
    if (removed.error) throw new Error("Second local QA admin Auth cleanup failed");
  }
}
for (const [table, query] of [["face_knowledge_cards", `card_id=eq.${cardCode}`],
  ["face_knowledge_revisions", `knowledge_id=eq.${cardId}`],
  ["admin_audit_logs", `target_id=eq.${cardId}`], ["profiles", `id=eq.${profileId}`]]) {
  const rows = await db(`${table}?select=id&${query}`, "GET");
  if (rows.length) throw new Error(`${table} QA row remains`);
}
if (profileId2) {
  const rows = await db(`profiles?select=id&id=eq.${profileId2}`, "GET");
  if (rows.length) throw new Error("Second QA admin profile remains");
}
console.log(`${passed}/15 face-knowledge admin API checks passed; fixtures cleaned`);
if (passed !== 15) process.exitCode = 1;

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, bearer, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

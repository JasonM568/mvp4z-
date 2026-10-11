#!/usr/bin/env node
// Local-only M2 face knowledge RLS and service-role CRUD regression.
// Usage: node scripts/qa-face-knowledge-rls-local.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (!args["env-file"] || !args["members-file"]) throw new Error("Provide --env-file and --members-file");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
const dbUrl = new URL(env.DB_URL || "postgresql://invalid.invalid/");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !["localhost", "127.0.0.1"].includes(dbUrl.hostname)
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members?.[0];
if (!member?.access_token || !member?.profile_id) throw new Error("Missing local QA member");

const memberPreflight = await request(`profiles?select=id&id=eq.${member.profile_id}`, member.access_token);
if (memberPreflight.status !== 200 || memberPreflight.body.length !== 1) {
  throw new Error("Local member token invalid; authz checks would be misleading");
}
const rlsRows = execFileSync("psql", ["-X", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c",
  "select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('face_knowledge_cards','face_knowledge_revisions') order by relname"], {
  env: { ...process.env, PGHOST: dbUrl.hostname, PGPORT: dbUrl.port,
    PGUSER: decodeURIComponent(dbUrl.username), PGPASSWORD: decodeURIComponent(dbUrl.password),
    PGDATABASE: dbUrl.pathname.slice(1) }, encoding: "utf8"
}).trim().split("\n");
if (rlsRows.length !== 2 || rlsRows.some((row) => !row.endsWith("|t"))) {
  throw new Error("Face knowledge RLS is not enabled on both tables");
}
console.log("PASS face knowledge cards/revisions: RLS enabled");
let passed = 1;
for (const table of ["face_knowledge_cards", "face_knowledge_revisions"]) {
  const service = await request(`${table}?select=id&limit=1`, env.SERVICE_ROLE_KEY);
  const anon = await request(`${table}?select=id&limit=1`, env.ANON_KEY);
  const authenticated = await request(`${table}?select=id&limit=1`, member.access_token);
  if (service.status !== 200 || ![401, 403, 404].includes(anon.status)
      || ![401, 403, 404].includes(authenticated.status)) {
    throw new Error(`${table} access mismatch: service=${service.status} anon=${anon.status} member=${authenticated.status}`);
  }
  console.log(`PASS ${table}: service 200, anon ${anon.status}, member ${authenticated.status}`); passed++;
}

const tag = `qa-m2-${crypto.randomBytes(6).toString("hex")}`;
let cardId;
try {
  const card = await request("face_knowledge_cards", env.SERVICE_ROLE_KEY, "POST", [{
    card_id: tag, title: "QA local M2", category: "qa", observation: "local only", status: "draft"
  }]);
  if (card.status !== 201 || card.body.length !== 1) throw new Error(`Service card INSERT failed: ${card.status}`);
  cardId = card.body[0].id;
  const revision = await request("face_knowledge_revisions", env.SERVICE_ROLE_KEY, "POST", [{
    knowledge_id: cardId, version: 1, snapshot: { qa: true }, change_note: tag
  }]);
  if (revision.status !== 201 || revision.body.length !== 1) throw new Error(`Service revision INSERT failed: ${revision.status}`);
  const updated = await request(`face_knowledge_cards?id=eq.${cardId}`, env.SERVICE_ROLE_KEY,
    "PATCH", { title: "QA local M2 updated" });
  if (updated.status !== 200 || updated.body[0]?.title !== "QA local M2 updated") {
    throw new Error(`Service card UPDATE failed: ${updated.status}`);
  }
  console.log("PASS service role card INSERT/UPDATE + revision INSERT"); passed++;
} finally {
  if (cardId) {
    const removed = await request(`face_knowledge_cards?id=eq.${cardId}`, env.SERVICE_ROLE_KEY, "DELETE");
    if (![200, 204].includes(removed.status)) throw new Error("Service card DELETE failed");
  }
}
const cardAfter = await request(`face_knowledge_cards?select=id&card_id=eq.${tag}`, env.SERVICE_ROLE_KEY);
const revisionAfter = cardId
  ? await request(`face_knowledge_revisions?select=id&knowledge_id=eq.${cardId}`, env.SERVICE_ROLE_KEY)
  : { status: 200, body: [] };
if (cardAfter.status !== 200 || cardAfter.body.length || revisionAfter.status !== 200 || revisionAfter.body.length) {
  throw new Error("M2 QA card/revision cleanup incomplete");
}
console.log(`${passed}/${passed} face knowledge RLS/CRUD checks passed; fixtures cleaned`);

async function request(path, token, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: token === env.SERVICE_ROLE_KEY ? env.SERVICE_ROLE_KEY : env.ANON_KEY,
    Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => []) };
}

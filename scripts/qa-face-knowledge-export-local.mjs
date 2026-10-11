#!/usr/bin/env node
// Isolated named-admin export authorization and completeness; reads existing QA cards only.
import { readFile } from "node:fs/promises";
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
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signer = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(5).toString("hex");
const created = { users: [], profiles: [] };
let checks = 0, passed = 0;
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
async function makeUser(role) {
  const email = `qa-face-export-${role}-${tag}@example.test`;
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error(`Cannot create ${role}`);
  created.users.push(made.data.user.id);
  const [profile] = await db("profiles", "POST", [{ auth_user_id: made.data.user.id,
    email, name: `QA Face Export ${role}`, role }]);
  created.profiles.push(profile.id);
  const login = await signer.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error(`Cannot login ${role}`);
  return login.data.session.access_token;
}
async function exportCards(token) {
  return fetch(`${baseUrl}/api/admin/face-knowledge/export`, {
    signal: AbortSignal.timeout(20_000), headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}
try {
  const admin = await makeUser("admin");
  const member = await makeUser("member");
  const existing = await db("face_knowledge_cards?select=card_id&order=card_id.asc");
  check((await exportCards()).status === 401, "anonymous export denied");
  check((await exportCards("bad-token")).status === 401, "bad bearer denied");
  check((await exportCards(member)).status === 403, "ordinary member denied");
  const response = await exportCards(admin);
  const payload = await response.json().catch(() => ({}));
  check(response.status === 200 && Array.isArray(payload.items)
    && !Number.isNaN(Date.parse(payload.exportedAt || "")), "named admin gets JSON export",
  `HTTP ${response.status}, items ${payload.items?.length ?? "missing"}`);
  check(response.headers.get("content-type")?.startsWith("application/json")
    && response.headers.get("content-disposition") === "attachment; filename=face-knowledge-export.json"
    && response.headers.get("cache-control") === "no-store", "download headers are private",
  `cache ${response.headers.get("cache-control") || "missing"}`);
  const exportedIds = (payload.items || []).map((row) => row.card_id);
  check(exportedIds.length === existing.length && exportedIds.every((id, i) => id === existing[i].card_id),
    "export IDs match local database order", `export ${exportedIds.length}, DB ${existing.length}`);
  check(new Set(exportedIds).size === exportedIds.length, "export has no duplicate card IDs");
  const again = await exportCards(admin);
  const repeated = await again.json().catch(() => ({}));
  check(again.status === 200 && JSON.stringify(repeated.items) === JSON.stringify(payload.items),
    "repeat export has stable items", `HTTP ${again.status}`);
} finally {
  for (const id of created.profiles) await db(`profiles?id=eq.${id}`, "DELETE");
  for (const id of created.users) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) throw new Error("Local QA Auth cleanup failed");
  }
  for (const id of created.profiles) {
    if ((await db(`profiles?select=id&id=eq.${id}`)).length) throw new Error("QA profile remains");
  }
  console.log("QA Auth and profile fixtures cleaned");
}
console.log(`${passed}/${checks} face-knowledge export checks passed`);
if (passed !== checks) process.exitCode = 1;

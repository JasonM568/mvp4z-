#!/usr/bin/env node
// Isolated face-report list pagination and malformed input checks.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"]) {
  throw new Error("Provide localhost --base-url and local --env-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "") ||
    !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")) {
  throw new Error("Refusing non-local Supabase");
}
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const member = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(5).toString("hex");
const email = `qa-face-list-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
let authId, profileId, token;
const runIds = [];
let passed = 0;
function check(ok, label, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${detail}`);
  if (ok) passed += 1;
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, {
    method,
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`DB ${path} HTTP ${response.status}`);
  return result;
}
async function list(query = "", bearer = token) {
  const response = await fetch(`${baseUrl}/api/face-analysis/runs${query}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA member");
  authId = created.data.user.id;
  const profile = await db("profiles", "POST", { auth_user_id: authId, email, name: "QA Face List", role: "member" });
  profileId = profile[0].id;
  const login = await member.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error("Cannot login local QA member");
  token = login.data.session.access_token;
  const runs = Array.from({ length: 51 }, () => ({
    id: crypto.randomUUID(), request_id: crypto.randomUUID(), user_id: profileId,
    mode: "self", consent_version: "qa-local", status: "completed",
    report_structured: { qa: true }, report_text: "QA isolated report",
    completed_at: new Date().toISOString()
  }));
  await db("face_analysis_runs", "POST", runs);
  runIds.push(...runs.map((run) => run.id));

  const anonymous = await list("", null);
  check(anonymous.status === 401, "anonymous denied", `HTTP ${anonymous.status}`);
  for (const [name, query, expected] of [
    ["default list", "", 200],
    ["limit 1", "?limit=1", 200],
    ["limit 50", "?limit=50", 200],
    ["limit abc", "?limit=abc", 400],
    ["limit SQLi shape", "?limit=1%20OR%201%3D1", 400],
    ["limit 100-digit overlong", `?limit=${"9".repeat(100)}`, 400],
    ["limit 500-digit overlong", `?limit=${"9".repeat(500)}`, 400]
  ]) {
    const result = await list(query);
    const expectedItems = name === "limit 1" ? 1 : name === "limit 50" ? 50 : 20;
    const countOk = expected !== 200 || (Array.isArray(result.body.items) && result.body.items.length === expectedItems);
    check(result.status === expected && countOk, name, `HTTP ${result.status}, items=${result.body.items?.length ?? "n/a"}`);
  }
  console.log(`${passed}/8 face-report list checks passed`);
  if (passed !== 8) process.exitCode = 1;
} finally {
  if (runIds.length) await db(`face_analysis_runs?id=in.(${runIds.join(",")})`, "DELETE");
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const deleted = await service.auth.admin.deleteUser(authId);
    if (deleted.error) throw deleted.error;
  }
  if (profileId) {
    const remaining = await db(`profiles?select=id&id=eq.${profileId}`);
    if (remaining.length) throw new Error("QA profile cleanup failed");
  }
  if (runIds.length && (await db(`face_analysis_runs?select=id&id=in.(${runIds.join(",")})`)).length) {
    throw new Error("QA report cleanup failed");
  }
  console.log("QA Auth/profile/report cleanup verified");
}

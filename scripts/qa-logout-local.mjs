#!/usr/bin/env node
// Local-only logout/session regression. Creates and removes one isolated Auth user.
import { readFile } from "node:fs/promises";
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
    || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-logout-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
let authId, profileId, passed = 0;
function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (ok) passed++;
}
async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA user");
  authId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Logout", role: "member" }]);
  profileId = profile.id;
  const login = await post("/api/auth/login", { email, password });
  check(login.status === 200 && Boolean(login.body.token) && Boolean(login.body.refresh_token),
    "login grants access and refresh token", `HTTP ${login.status}`);
  if (!login.body.token || !login.body.refresh_token) throw new Error("Cannot continue without tokens");

  const before = await fetch(`${baseUrl}/api/member/me`, {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  check(before.status === 200, "member API accepts access token before logout", `HTTP ${before.status}`);
  await before.arrayBuffer();

  const logout = await post("/api/auth/logout", { refresh_token: login.body.refresh_token });
  check(logout.status === 200 && logout.body.ok === true, "logout endpoint reports success", `HTTP ${logout.status}`);
  const oldAccessAfter = await fetch(`${baseUrl}/api/member/me`, {
    headers: { Authorization: `Bearer ${login.body.token}` }
  });
  await oldAccessAfter.arrayBuffer();
  check(oldAccessAfter.status === 401, "logout rejects old access token immediately",
    `member HTTP ${oldAccessAfter.status}`);

  const refreshed = await post("/api/auth/refresh", { refresh_token: login.body.refresh_token });
  const after = refreshed.body.token ? await fetch(`${baseUrl}/api/member/me`, {
    headers: { Authorization: `Bearer ${refreshed.body.token}` }
  }) : null;
  if (after) await after.arrayBuffer();
  check(refreshed.status === 401 && !refreshed.body.token && after === null,
    "logout revokes refresh token", `refresh HTTP ${refreshed.status}; member HTTP ${after?.status ?? "not called"}`);
  const repeated = await post("/api/auth/logout", { refresh_token: login.body.refresh_token });
  check(repeated.status === 200 && repeated.body.ok === true,
    "repeated logout with revoked refresh token is idempotent", `HTTP ${repeated.status}`);
  console.log(`${passed}/6 logout/session checks passed`);
  if (passed !== 6) process.exitCode = 1;
} finally {
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await admin.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error("QA Auth cleanup failed");
  }
  const remaining = await db(`profiles?select=id&email=eq.${email}`);
  if (remaining.length) throw new Error("QA logout profile remains");
}

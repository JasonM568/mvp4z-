#!/usr/bin/env node
// Named-admin GET smoke on a local isolated stack. No external provider calls.
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
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const endpoints = [
  "/api/admin/bookings", "/api/admin/council-runs", "/api/admin/course-product",
  "/api/admin/course-registrations", "/api/admin/documents", "/api/admin/effective-settings",
  "/api/admin/face-analysis", "/api/admin/face-knowledge", "/api/admin/face-knowledge/export",
  "/api/admin/face-provider-approval", "/api/admin/face-review-questions", "/api/admin/face-rules",
  "/api/admin/face-teachings", "/api/admin/gemini-provider-approval", "/api/admin/invoices",
  "/api/admin/members", "/api/admin/orders", "/api/admin/prompt-settings",
  "/api/admin/provider-health", "/api/admin/qimen-review", "/api/admin/referrals",
  "/api/admin/school-settings", "/api/admin/token-usage"
];
const tag = crypto.randomBytes(6).toString("hex");
const email = `qa-admin-reads-${tag}@example.test`;
let authId, profileId, passed = 0;
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
try {
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local admin");
  authId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Admin Reads", role: "admin" }]);
  profileId = profile.id;
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local admin");
  for (const path of endpoints) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${login.data.session.access_token}` }
    });
    const type = response.headers.get("content-type") || "";
    const body = type.includes("json") ? await response.json() : await response.text();
    const okay = response.status === 200 && type.includes("json") && body?.error === undefined;
    console.log(`${okay ? "PASS" : "FAIL"} ${path}: HTTP ${response.status}, ${type}${okay ? "" : `, ${JSON.stringify(body).slice(0, 130)}`}`);
    if (okay) passed++;
  }
} finally {
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`profiles?select=id&email=eq.${email}`)).length) throw new Error("QA profile remains");
  console.log("QA Auth/profile fixture cleaned");
}
console.log(`${passed}/${endpoints.length} named-admin GET endpoints passed`);
if (passed !== endpoints.length) process.exitCode = 1;

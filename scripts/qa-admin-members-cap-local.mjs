#!/usr/bin/env node
// Reproduces the admin member-list 200-row cap against a disposable local DB.
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
const tag = crypto.randomBytes(6).toString("hex");
const emailPrefix = `qa-admin-cap-${tag}-`;
let adminAuthId, adminProfileId, fixtureIds = [];
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json().catch(() => []);
}
function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  return ok;
}
let passed = 0;
try {
  const email = `${emailPrefix}admin@example.test`;
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local admin");
  adminAuthId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: adminAuthId, email, name: "QA Member Cap Admin", role: "admin" }]);
  adminProfileId = profile.id;
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local admin");
  const authHeader = { Authorization: `Bearer ${login.data.session.access_token}` };

  const before = await fetch(`${baseUrl}/api/admin/members`, { headers: authHeader });
  const beforeBody = await before.json();
  if (!before.ok || !Array.isArray(beforeBody.members)) throw new Error(`Admin list preflight HTTP ${before.status}`);
  if (check(beforeBody.summary.total === beforeBody.members.length,
    "preflight summary agrees with returned rows", `${beforeBody.summary.total}/${beforeBody.members.length}`)) passed++;

  const baseTime = Date.now() + 60_000;
  for (let batch = 0; batch < 5; batch++) {
    const rows = Array.from({ length: 41 }, (_, i) => {
      const n = batch * 41 + i;
      return { email: `${emailPrefix}${String(n).padStart(3, "0")}@example.test`,
        name: `QA Member Cap ${n}`, role: "member", created_at: new Date(baseTime + n * 1000).toISOString() };
    });
    const inserted = await db("profiles", "POST", rows);
    fixtureIds.push(...inserted.map((row) => row.id));
  }
  if (check(fixtureIds.length === 205, "205 isolated members inserted")) passed++;

  const response = await fetch(`${baseUrl}/api/admin/members`, { headers: authHeader });
  const body = await response.json();
  const visible = body.members?.filter((row) => row.email?.startsWith(emailPrefix) && row.role === "member") || [];
  const missing = fixtureIds.filter((id) => !body.members?.some((row) => row.id === id));
  if (check(response.status === 200 && Array.isArray(body.members), "named admin list returns 200")) passed++;
  if (check(missing.length === 0 && body.summary?.total >= 206,
    "all 205 created members are visible and summary reflects all members",
    `HTTP ${response.status}, listed ${body.members?.length}, QA visible ${visible.length}, QA missing ${missing.length}, summary.total ${body.summary?.total}`)) passed++;
} finally {
  if (fixtureIds.length) {
    for (let i = 0; i < fixtureIds.length; i += 100) {
      await db(`profiles?id=in.(${fixtureIds.slice(i, i + 100).join(",")})`, "DELETE");
    }
  }
  if (adminProfileId) await db(`profiles?id=eq.${adminProfileId}`, "DELETE");
  if (adminAuthId) {
    const removed = await service.auth.admin.deleteUser(adminAuthId);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`profiles?select=id&email=like.${emailPrefix}*`)).length) throw new Error("QA member fixtures remain");
  console.log("QA Auth/profile fixtures cleaned");
}
console.log(`${passed}/4 admin member-list cap checks passed`);
if (passed !== 4) process.exitCode = 1;

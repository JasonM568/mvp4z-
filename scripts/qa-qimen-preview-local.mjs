#!/usr/bin/env node
// Local-only qimen preview API checks. No LLM, credits, or signoff writes.
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
const email = `qa-qimen-preview-${tag}@example.test`;
let authId, profileId, passed = 0;
const checks = [];
function check(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  checks.push(ok); if (ok) passed++;
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function post(token, body) {
  const response = await fetch(`${baseUrl}/api/admin/qimen-review/preview`, { method: "POST", headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json"
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
const valid = { year: 2026, month: 10, day: 11, hour: 12, minute: 34 };
try {
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local admin");
  authId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authId, email,
    name: "QA Qimen Preview", role: "admin" }]);
  profileId = profile.id;
  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in local admin");
  const token = login.data.session.access_token;

  check((await post("", valid)).status === 401, "anonymous request rejected");
  check((await post("invalid-token", valid)).status === 401, "invalid token rejected");
  const success = await post(token, valid);
  check(success.status === 200 && success.body.ok === true && success.body.error === null
    && Array.isArray(success.body.grid) && success.body.grid.length === 3
    && success.body.grid.every((row) => Array.isArray(row) && row.length === 3)
    && Array.isArray(success.body.headlines), "valid time yields nine-palace chart",
  `HTTP ${success.status}, grid ${success.body.grid?.length}`);
  for (const [label, body] of [
    ["empty body", {}],
    ["month zero", { ...valid, month: 0 }],
    ["hour 24", { ...valid, hour: 24 }],
    ["year below minimum", { ...valid, year: 1899 }],
    ["SQLi shaped year", { ...valid, year: "2026 OR 1=1" }],
    ["overlong year", { ...valid, year: "9".repeat(500) }]
  ]) {
    const result = await post(token, body);
    check(result.status === 400, `${label} rejected`, `HTTP ${result.status}`);
  }
  const invalidDate = await post(token, { ...valid, month: 2, day: 30 });
  check(invalidDate.status === 200 && invalidDate.body.ok === true
    && typeof invalidDate.body.error === "string" && invalidDate.body.error.length > 0
    && invalidDate.body.grid?.length === 0, "impossible date handled without chart",
  `HTTP ${invalidDate.status}, grid ${invalidDate.body.grid?.length}, error ${Boolean(invalidDate.body.error)}`);
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => post(token, valid)));
  check(concurrent.every((r) => r.status === 200 && r.body.error === null
    && JSON.stringify(r.body.grid) === JSON.stringify(success.body.grid)),
  "five concurrent previews deterministic", concurrent.map((r) => r.status).join(","));
} finally {
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`profiles?select=id&email=eq.${email}`)).length) throw new Error("QA profile remains");
  console.log("QA Auth/profile fixture cleaned");
}
console.log(`${passed}/${checks.length} qimen preview API checks passed`);
if (passed !== checks.length) process.exitCode = 1;

#!/usr/bin/env node
// Local isolated upload validation: empty multipart requests must not consume quality checks.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")
  || !args["env-file"] || !args["members-file"])
  throw new Error("Provide local --base-url, --env-file and --members-file");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2 || !members.every((m) => m.profile_id && m.email && m.password))
  throw new Error("Expected two local QA members");
const [a, b] = members;
const auth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
async function token(member) {
  const result = await auth.auth.signInWithPassword({ email: member.email, password: member.password });
  if (result.error || !result.data.session?.access_token) throw new Error("QA login failed");
  return result.data.session.access_token;
}
async function rest(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(15_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local REST ${method} HTTP ${response.status}`);
  return response.json().catch(() => []);
}
const id = crypto.randomUUID();
let checks = 0, passed = 0;
function check(ok, label, detail) {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${detail}`);
}
async function attempts() {
  const rows = await rest(`face_analysis_runs?select=upload_attempts,status&id=eq.${id}`);
  if (rows.length !== 1) throw new Error("QA run missing");
  return rows[0];
}
async function upload(runId, bearer) {
  const form = new FormData();
  const response = await fetch(`${baseUrl}/api/face-analysis/runs/${runId}/upload`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, body: form
  });
  return response.status;
}
try {
  const aToken = await token(a), bToken = await token(b);
  const preflight = await fetch(`${baseUrl}/api/member/me`, {
    signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${aToken}` }
  });
  if (preflight.status !== 200) throw new Error(`Member preflight HTTP ${preflight.status}`);
  await rest("face_analysis_runs", "POST", [{ id, request_id: crypto.randomUUID(),
    user_id: a.profile_id, mode: "self", consent_version: "qa-local", status: "created" }]);
  check(await upload(id) === 401, "anonymous denied", `attempts ${(await attempts()).upload_attempts}`);
  check(await upload(id, bToken) === 404, "other member denied", `attempts ${(await attempts()).upload_attempts}`);
  check(await upload("bad-id", aToken) === 404, "malformed ID denied", `attempts ${(await attempts()).upload_attempts}`);
  check(await upload(crypto.randomUUID(), aToken) === 404, "unknown UUID denied", `attempts ${(await attempts()).upload_attempts}`);
  for (let i = 1; i <= 6; i++) {
    const status = await upload(id, aToken);
    const row = await attempts();
    check(status === 400 && row.upload_attempts === 0 && row.status === "created",
      `empty upload ${i} does not consume quality attempt`, `HTTP ${status}, attempts ${row.upload_attempts}, state ${row.status}`);
  }
} finally {
  await rest(`face_analysis_runs?id=eq.${id}`, "DELETE");
  const residual = await rest(`face_analysis_runs?select=id&id=eq.${id}`);
  if (residual.length) throw new Error("QA run fixture remains");
  console.log("QA run fixture cleaned");
}
console.log(`${passed}/${checks} empty-upload checks passed`);
if (passed !== checks) process.exitCode = 1;

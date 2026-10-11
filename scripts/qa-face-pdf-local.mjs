#!/usr/bin/env node
// Isolated face-report PDF access and state checks. Creates only two QA runs.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"] || !args["members-file"])
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
  throw new Error("Expected two QA members with local credentials");
const [a, b] = members;
const auth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
async function freshToken(member) {
  const result = await auth.auth.signInWithPassword({ email: member.email, password: member.password });
  if (result.error || !result.data.session?.access_token) throw new Error("Cannot sign in QA member");
  return result.data.session.access_token;
}
const now = new Date().toISOString();
const completed = { id: crypto.randomUUID(), request_id: crypto.randomUUID(), user_id: a.profile_id,
  mode: "self", consent_version: "qa-local", status: "completed", report_structured: { qa: true },
  report_text: "QA isolated PDF report", completed_at: now };
const pending = { id: crypto.randomUUID(), request_id: crypto.randomUUID(), user_id: a.profile_id,
  mode: "self", consent_version: "qa-local", status: "created" };
let checks = 0, passed = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
async function rest(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`Local REST ${method} HTTP ${response.status}: ${String(failure.code || failure.message || "unknown").slice(0, 160)}`);
  }
  return response.json().catch(() => []);
}
async function pdf(id, token) {
  return fetch(`${baseUrl}/api/face-analysis/runs/${id}/pdf`, { signal: AbortSignal.timeout(30_000),
    headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
try {
  const aToken = await freshToken(a);
  const bToken = await freshToken(b);
  const preflight = await fetch(`${baseUrl}/api/member/me`, { signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${aToken}` } });
  if (preflight.status !== 200) throw new Error(`QA member token preflight HTTP ${preflight.status}`);
  await rest("face_analysis_runs", "POST", [completed]);
  await rest("face_analysis_runs", "POST", [pending]);
  const anonymous = await pdf(completed.id);
  check(anonymous.status === 401, "anonymous PDF request rejected", `HTTP ${anonymous.status}`);
  const invalid = await pdf(completed.id, "bad-token");
  check(invalid.status === 401, "invalid token rejected", `HTTP ${invalid.status}`);
  const other = await pdf(completed.id, bToken);
  check(other.status === 404, "other member cannot download PDF", `HTTP ${other.status}`);
  const unready = await pdf(pending.id, aToken);
  check(unready.status === 409, "unfinished report cannot download PDF", `HTTP ${unready.status}`);
  const missing = await pdf(crypto.randomUUID(), aToken);
  check(missing.status === 404, "unknown report rejected", `HTTP ${missing.status}`);
  for (const [label, id] of [
    ["malformed report ID", "bad-id"],
    ["SQLi-shaped report ID", "sql'OR'1=1"],
    ["overlong report ID", "a".repeat(500)]
  ]) {
    const malformed = await pdf(id, aToken);
    check(malformed.status === 400, `${label} rejected`, `HTTP ${malformed.status}`);
  }
  const own = await pdf(completed.id, aToken);
  const bytes = Buffer.from(await own.arrayBuffer());
  check(own.status === 200 && own.headers.get("content-type")?.startsWith("application/pdf")
    && own.headers.get("content-disposition")?.includes("attachment")
    && own.headers.get("cache-control") === "private, no-store"
    && bytes.subarray(0, 5).toString() === "%PDF-"
    && Number(own.headers.get("content-length")) === bytes.length,
  "owner receives private PDF bytes", `HTTP ${own.status}, bytes ${bytes.length}`);
  const again = await pdf(completed.id, aToken);
  const againBytes = Buffer.from(await again.arrayBuffer());
  check(again.status === 200 && againBytes.equals(bytes), "repeat PDF download stable",
    `HTTP ${again.status}, bytes ${againBytes.length}`);
  const analyzeAgain = await fetch(`${baseUrl}/api/face-analysis/runs/${completed.id}/analyze`, {
    method: "POST", signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${aToken}`, "Content-Type": "application/json" }, body: "{}"
  });
  const analyzeBody = await analyzeAgain.json().catch(() => ({}));
  check(analyzeAgain.status === 200 && analyzeBody.ok === true
    && analyzeBody.run?.id === completed.id && analyzeBody.run?.status === "completed",
    "completed analyze retry returns existing report", `HTTP ${analyzeAgain.status}`);
} finally {
  await rest(`face_analysis_runs?id=in.(${completed.id},${pending.id})`, "DELETE");
  // The PDF route may cache in private Storage. Delete only this unique QA path.
  const storage = await fetch(`${env.API_URL}/storage/v1/object/face-analysis-reports/${a.profile_id}/${completed.id}/report.pdf`, {
    method: "DELETE", signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` }
  });
  if (![200, 204, 400, 404].includes(storage.status)) throw new Error(`QA PDF cleanup HTTP ${storage.status}`);
  const cached = await fetch(`${env.API_URL}/storage/v1/object/face-analysis-reports/${a.profile_id}/${completed.id}/report.pdf`, {
    signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` }
  });
  if (cached.status === 200) throw new Error("QA PDF object remains in Storage");
  const remains = await rest(`face_analysis_runs?select=id&id=in.(${completed.id},${pending.id})`);
  if (remains.length) throw new Error("QA face run fixtures remain");
  console.log("QA face run and PDF fixtures cleaned");
}
console.log(`${passed}/${checks} face PDF checks passed`);
if (passed !== checks) process.exitCode = 1;

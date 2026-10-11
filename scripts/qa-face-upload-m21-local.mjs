#!/usr/bin/env node
// M21 isolated HTTP regression. Uses fresh local Auth users, synthetic PNG,
// real local DB/Storage, and a loopback quality-provider stub; never paid AI.
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import crypto from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("=");
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
const providerPort = Number(args["provider-port"] || 3297);
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "") || !args["env-file"]
  || !Number.isInteger(providerPort) || providerPort < 1024 || providerPort > 65535) {
  throw new Error("Use local --base-url, --env-file and --provider-port");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const prefix = `qa-m21-${crypto.randomUUID()}`;
const users = [];
const runs = [];
const tempDir = await mkdtemp(join(tmpdir(), "qa-m21-"));
let checks = 0;
let passed = 0;
let providerCalls = 0;
let providerMode = "pass";
let providerDelay = 0;

function check(value, name, details = "") {
  checks++;
  if (value) passed++;
  console.log(`${value ? "PASS" : "FAIL"} ${name}${details ? `: ${details}` : ""}`);
}
function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function row(runId) {
  return assertNoError(await admin.from("face_analysis_runs")
    .select("id,status,upload_attempts,storage_path,upload_claim_token,upload_claimed_at")
    .eq("id", runId).single(), "run read");
}
async function events(runId) {
  return assertNoError(await admin.from("face_analysis_events")
    .select("event_type").eq("run_id", runId), "event read") || [];
}
async function balanceFootprint(profileId) {
  const [entitlements, transactions, usage] = await Promise.all([
    admin.from("member_entitlements").select("id,credits_remaining").eq("user_id", profileId),
    admin.from("credit_transactions").select("id").eq("user_id", profileId),
    admin.from("usage_logs").select("id").eq("user_id", profileId)
  ]);
  return JSON.stringify([
    assertNoError(entitlements, "entitlements"),
    assertNoError(transactions, "transactions"),
    assertNoError(usage, "usage")
  ]);
}
async function makeRun(profileId) {
  const id = crypto.randomUUID();
  assertNoError(await admin.from("face_analysis_runs").insert({
    id, request_id: crypto.randomUUID(), user_id: profileId,
    mode: "self", consent_version: "qa-local", status: "created"
  }), "run create");
  runs.push({ id, profileId });
  return id;
}
async function upload(runId, token, image) {
  const form = new FormData();
  form.append("image", new File([image], "synthetic-control.png", { type: "image/png" }));
  const response = await fetch(`${baseUrl}/api/face-analysis/runs/${runId}/upload`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function storagePaths(profileId, runId) {
  const result = await admin.storage.from("face-analysis-uploads").list(`${profileId}/${runId}`);
  assertNoError(result, "Storage list");
  return (result.data || []).map((entry) => `${profileId}/${runId}/${entry.name}`);
}
async function createMember(label) {
  const email = `${prefix}-${label}@example.test`;
  const password = crypto.randomBytes(24).toString("hex");
  const created = assertNoError(await admin.auth.admin.createUser({
    email, password, email_confirm: true
  }), "Auth create");
  const member = { email, password, authId: created.user.id, profileId: "", token: "" };
  users.push(member);
  const session = assertNoError(await anon.auth.signInWithPassword({ email, password }), "Auth login");
  member.token = session.session.access_token;
  const response = await fetch(`${baseUrl}/api/member/me`, {
    headers: { Authorization: `Bearer ${member.token}` }, signal: AbortSignal.timeout(15_000)
  });
  if (response.status !== 200) throw new Error(`member preflight ${response.status}`);
  const profiles = assertNoError(await admin.from("profiles").select("id")
    .eq("auth_user_id", member.authId).single(), "profile read");
  member.profileId = profiles.id;
  return member;
}
function runEmptyScript(membersFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL("./qa-face-upload-empty-local.mjs", import.meta.url)),
      `--base-url=${baseUrl}`, `--env-file=${args["env-file"]}`, `--members-file=${membersFile}`
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      process.stdout.write(stdout);
      if (code) reject(new Error(`empty-upload script exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout);
    });
  });
}
const provider = createServer(async (request, response) => {
  providerCalls++;
  for await (const _chunk of request) { /* consume synthetic image */ }
  if (providerDelay) await new Promise((resolve) => setTimeout(resolve, providerDelay));
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    faceCount: providerMode === "reject" ? 0 : 1,
    faceCoverage: providerMode === "reject" ? 0 : 0.5,
    pose: { yaw: 0, pitch: 0, roll: 0 },
    occlusion: { eyes: false, nose: false, mouth: false }
  }));
});

try {
  await new Promise((resolve, reject) => provider.listen(providerPort, "127.0.0.1", (error) =>
    error ? reject(error) : resolve()));
  const a = await createMember("a");
  const b = await createMember("b");
  const membersFile = join(tempDir, "members.private.json");
  await writeFile(membersFile, JSON.stringify({ members: [a, b].map((member) => ({
    email: member.email, password: member.password, profile_id: member.profileId
  })) }), { mode: 0o600 });
  await runEmptyScript(membersFile);
  check(providerCalls === 0, "empty upload never calls quality provider", `calls ${providerCalls}`);

  // Sharp really decodes this non-uniform image; only the face geometry is stubbed.
  const pixels = Buffer.alloc(512 * 512 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = 70 + ((i * 73 + Math.floor(i / 37) * 41) % 130);
  const image = await sharp(pixels, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer();
  const baseline = await balanceFootprint(a.profileId);
  const runId = await makeRun(a.profileId);
  check((await upload(runId, b.token, image)).status === 404, "B cannot upload to A run");
  providerMode = "reject";
  const rejected = await upload(runId, a.token, image);
  const rejectedRow = await row(runId);
  check(rejected.status === 200 && rejected.body.status === "quality_rejected"
    && rejectedRow.status === "quality_rejected" && rejectedRow.upload_attempts === 1,
  "valid image quality rejection consumes one attempt", `HTTP ${rejected.status}, attempts ${rejectedRow.upload_attempts}`);
  check((await storagePaths(a.profileId, runId)).length === 0 && rejectedRow.storage_path === null,
    "rejected image leaves no Storage object");
  providerMode = "pass";
  const accepted = await upload(runId, a.token, image);
  const acceptedRow = await row(runId);
  check(accepted.status === 200 && accepted.body.status === "uploaded"
    && acceptedRow.status === "uploaded" && acceptedRow.upload_attempts === 2
    && !acceptedRow.upload_claim_token && !acceptedRow.upload_claimed_at,
  "accepted image stores once and releases claim", `HTTP ${accepted.status}, attempts ${acceptedRow.upload_attempts}`);
  check((await storagePaths(a.profileId, runId)).length === 1,
    "accepted image has one private Storage object");
  check(JSON.stringify((await events(runId)).map((event) => event.event_type).sort())
    === JSON.stringify(["quality_passed", "quality_rejected"]),
  "one reject and one pass event");
  check(await balanceFootprint(a.profileId) === baseline, "upload does not charge credits");

  providerDelay = 200;
  for (let round = 1; round <= 10; round++) {
    const concurrentId = await makeRun(a.profileId);
    const callsBefore = providerCalls;
    const responses = await Promise.all([
      upload(concurrentId, a.token, image), upload(concurrentId, a.token, image)
    ]);
    const current = await row(concurrentId);
    const storage = await storagePaths(a.profileId, concurrentId);
    const eventRows = await events(concurrentId);
    check(JSON.stringify(responses.map((x) => x.status).sort()) === JSON.stringify([200, 409])
      && current.status === "uploaded" && current.upload_attempts === 1
      && !current.upload_claim_token && storage.length === 1 && eventRows.length === 1
      && providerCalls - callsBefore === 1,
    `same-run N=2 round ${round}: one claim, one image, one event`,
    `HTTP ${responses.map((x) => x.status).sort().join("/")}, attempts ${current.upload_attempts}`);
  }
  check(await balanceFootprint(a.profileId) === baseline,
    "all concurrent uploads preserve credit footprint");
} finally {
  provider.close();
  for (const run of runs) {
    const paths = await storagePaths(run.profileId, run.id).catch(() => []);
    if (paths.length) assertNoError(await admin.storage.from("face-analysis-uploads").remove(paths), "Storage cleanup");
    assertNoError(await admin.from("face_analysis_runs").delete().eq("id", run.id), "run cleanup");
  }
  for (const user of users) {
    if (user.profileId) assertNoError(await admin.from("profiles").delete().eq("id", user.profileId), "profile cleanup");
    assertNoError(await admin.auth.admin.deleteUser(user.authId), "Auth cleanup");
  }
  await rm(tempDir, { recursive: true, force: true });
  for (const run of runs) {
    const rowResult = assertNoError(await admin.from("face_analysis_runs").select("id").eq("id", run.id), "run cleanup verify");
    const eventRows = assertNoError(await admin.from("face_analysis_events").select("id").eq("run_id", run.id), "event cleanup verify");
    const storage = await storagePaths(run.profileId, run.id);
    if (rowResult.length || eventRows.length || storage.length) throw new Error("M21 run/event/Storage fixture remains");
  }
  for (const user of users) {
    const profileRows = assertNoError(await admin.from("profiles").select("id").eq("auth_user_id", user.authId), "profile cleanup verify");
    const [entitlements, transactions, usage] = await Promise.all([
      admin.from("member_entitlements").select("id").eq("user_id", user.profileId),
      admin.from("credit_transactions").select("id").eq("user_id", user.profileId),
      admin.from("usage_logs").select("id").eq("user_id", user.profileId)
    ]);
    if (profileRows.length || assertNoError(entitlements, "entitlement cleanup verify").length
      || assertNoError(transactions, "ledger cleanup verify").length
      || assertNoError(usage, "usage cleanup verify").length) {
      throw new Error("M21 profile/accounting fixture remains");
    }
  }
  console.log(`QA fixtures cleaned: runs/events ${runs.length}, Auth/profile ${users.length}, Storage/accounting 0`);
}
console.log(`${passed}/${checks} M21 supplemental checks passed`);
if (passed !== checks) process.exitCode = 1;

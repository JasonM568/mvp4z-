#!/usr/bin/env node
// Local-only owner deletion and concurrent retry checks for a disposable face report.
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
const signer = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(5).toString("hex");
const runId = crypto.randomUUID();
const created = { auth: [], profiles: [] };
let photoPath, pdfPath;
let passed = 0, checks = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
async function db(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function makeMember(index) {
  const email = `qa-face-delete-${tag}-${index}@example.test`;
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error("Cannot create local member");
  created.auth.push(made.data.user.id);
  const [profile] = await db("profiles", "POST", [{ auth_user_id: made.data.user.id,
    email, name: `QA Face Delete ${index}`, role: "member" }]);
  created.profiles.push(profile.id);
  const login = await signer.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Cannot login local member");
  return { id: profile.id, token: login.data.session.access_token };
}
async function api(method, id, token) {
  const response = await fetch(`${baseUrl}/api/face-analysis/runs/${encodeURIComponent(id)}`, {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
try {
  const owner = await makeMember(1);
  const other = await makeMember(2);
  const privateText = `QA private face content ${tag}`;
  await db("face_analysis_runs", "POST", [{ id: runId, request_id: crypto.randomUUID(),
    user_id: owner.id, mode: "self", consent_version: "qa-local", status: "completed",
    report_structured: { qa: privateText }, report_text: privateText, credits_charged: 20,
    completed_at: new Date().toISOString() }]);
  photoPath = `${owner.id}/${runId}/source.png`;
  pdfPath = `${owner.id}/${runId}/report.pdf`;
  const photo = await service.storage.from("face-analysis-uploads").upload(photoPath,
    Buffer.from("89504e470d0a1a0a", "hex"), { contentType: "image/png" });
  const pdf = await service.storage.from("face-analysis-reports").upload(pdfPath,
    Buffer.from("%PDF-1.4\n%%EOF\n"), { contentType: "application/pdf" });
  if (photo.error || pdf.error) throw new Error("Cannot create local photo/PDF fixtures");
  await db(`face_analysis_runs?id=eq.${runId}`, "PATCH", {
    storage_path: photoPath, mime_type: "image/png",
    image_expires_at: new Date(Date.now() + 60_000).toISOString()
  });

  check((await api("GET", runId, "")).status === 401, "anonymous detail denied");
  check((await api("DELETE", runId, "")).status === 401, "anonymous delete denied");
  check((await api("GET", runId, other.token)).status === 404, "other member detail hidden");
  check((await api("DELETE", runId, other.token)).status === 404, "other member delete denied");
  check((await api("DELETE", "not-a-uuid", owner.token)).status === 404, "malformed ID hidden");
  const before = await api("GET", runId, owner.token);
  check(before.status === 200 && before.body.run?.report_text === privateText,
    "owner sees own report before delete", `HTTP ${before.status}`);
  const direct = await fetch(`${env.REST_URL}/rpc/redact_face_analysis_run`, { method: "POST", headers: {
    apikey: env.ANON_KEY, Authorization: `Bearer ${other.token}`, "Content-Type": "application/json"
  }, body: JSON.stringify({ p_run_id: runId, p_user_id: owner.id }) });
  check([401, 403, 404].includes(direct.status), "other member cannot call redact RPC directly", `HTTP ${direct.status}`);

  const attempts = await Promise.all(Array.from({ length: 20 }, () => api("DELETE", runId, owner.token)));
  check(attempts.some((r) => r.status === 200)
    && attempts.every((r) => [200, 409].includes(r.status)),
  "twenty simultaneous owner deletes return success or in-progress",
  attempts.map((r) => r.status).join(","));
  const [row] = await db(`face_analysis_runs?select=id,status,report_text,report_structured,vision_result,storage_path,credits_charged,deletion_pending,deleted_at&id=eq.${runId}`);
  check(row?.status === "deleted" && row.report_text === null && row.report_structured === null
    && row.vision_result === null && row.storage_path === null && row.credits_charged === 20
    && row.deletion_pending === false && Boolean(row.deleted_at),
    "database row redacted while charged count remains", `status ${row?.status}`);
  const events = await db(`face_analysis_events?select=event_type&run_id=eq.${runId}`);
  check(events.filter((row) => row.event_type === "run_deleted").length === 1,
    "exactly one deletion event", `events ${events.length}`);
  const [removedPhoto, removedPdf] = await Promise.all([
    service.storage.from("face-analysis-uploads").download(photoPath),
    service.storage.from("face-analysis-reports").download(pdfPath)
  ]);
  check(Boolean(removedPhoto.error) && Boolean(removedPdf.error),
    "private photo and PDF objects removed");
  const after = await api("GET", runId, owner.token);
  check(after.status === 200 && after.body.run?.status === "deleted"
    && !JSON.stringify(after.body).includes(privateText), "owner detail no longer reveals report content",
  `HTTP ${after.status}`);
  const retry = await api("DELETE", runId, owner.token);
  check(retry.status === 200 && retry.body.deleted?.id === runId, "later duplicate delete idempotent",
  `HTTP ${retry.status}`);
  const finalEvents = await db(`face_analysis_events?select=event_type&run_id=eq.${runId}`);
  check(finalEvents.filter((row) => row.event_type === "run_deleted").length === 1,
    "later retry creates no extra event", `events ${finalEvents.length}`);
  // Reproduce the stale-read window directly: a caller that read "completed"
  // before the first delete may reach this claim after the row became deleted.
  const staleClaim = await db(`face_analysis_runs?id=eq.${runId}&user_id=eq.${owner.id}&deletion_pending=eq.false&status=neq.analyzing&status=neq.deleted`,
    "PATCH", { deletion_pending: true });
  check(staleClaim.length === 0, "deleted row cannot be claimed by stale request",
  `claimed ${staleClaim.length}`);
  const repeatedRpc = await fetch(`${env.REST_URL}/rpc/redact_face_analysis_run`, { method: "POST", headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  }, body: JSON.stringify({ p_run_id: runId, p_user_id: owner.id }) });
  check(!repeatedRpc.ok, "redaction RPC rejects already deleted row",
  `HTTP ${repeatedRpc.status}`);
} finally {
  if (photoPath) await service.storage.from("face-analysis-uploads").remove([photoPath]);
  if (pdfPath) await service.storage.from("face-analysis-reports").remove([pdfPath]);
  await db(`face_analysis_events?run_id=eq.${runId}`, "DELETE");
  await db(`face_analysis_runs?id=eq.${runId}`, "DELETE");
  for (const id of created.profiles) await db(`profiles?id=eq.${id}`, "DELETE");
  for (const id of created.auth) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`face_analysis_runs?select=id&id=eq.${runId}`)).length
    || (await db(`face_analysis_events?select=id&run_id=eq.${runId}`)).length) {
    throw new Error("QA report/events remain");
  }
  console.log("QA Auth/profiles/report/events fixtures cleaned");
}
console.log(`${passed}/${checks} face delete checks passed`);
if (passed !== checks) process.exitCode = 1;

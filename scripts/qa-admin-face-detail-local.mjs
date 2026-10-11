#!/usr/bin/env node
// Local-only named-admin face report detail, authorization, and malformed ID checks.
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
const ids = { auth: [], profiles: [], run: crypto.randomUUID() };
let imagePath;
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
async function makeUser(role) {
  const email = `qa-face-detail-${role}-${tag}@example.test`;
  const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
  const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error(`Cannot create ${role}`);
  ids.auth.push(made.data.user.id);
  const [profile] = await db("profiles", "POST", [{ auth_user_id: made.data.user.id, email,
    name: `QA Face Detail ${role}`, role }]);
  ids.profiles.push(profile.id);
  const login = await signer.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error(`Cannot login ${role}`);
  return { id: profile.id, email, token: login.data.session.access_token };
}
async function get(id, token) {
  const response = await fetch(`${baseUrl}/api/admin/face-analysis/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: response.status, body: await response.json().catch(() => ({})),
    cache: response.headers.get("cache-control") || "" };
}
async function preview(id, token) {
  const response = await fetch(`${baseUrl}/api/admin/face-analysis/${encodeURIComponent(id)}/preview`, {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
try {
  const admin = await makeUser("admin");
  const member = await makeUser("member");
  await db("face_analysis_runs", "POST", [{ id: ids.run, request_id: crypto.randomUUID(),
    user_id: member.id, mode: "self", consent_version: "qa-local", status: "completed",
    report_structured: { qa: true }, report_text: "QA isolated report",
    completed_at: new Date().toISOString() }]);
  await db("face_analysis_events", "POST", [{ run_id: ids.run, user_id: member.id,
    event_type: "qa_detail_probe", metadata: { tag } }]);

  check((await get(ids.run, "")).status === 401, "anonymous denied");
  check((await get(ids.run, "invalid-token")).status === 401, "invalid token denied");
  check((await get(ids.run, member.token)).status === 403, "member denied");
  const detail = await get(ids.run, admin.token);
  check(detail.status === 200 && detail.body.ok === true && detail.body.run?.id === ids.run
    && detail.body.run?.profiles?.email === member.email, "named admin sees owner report",
  `HTTP ${detail.status}, owner ${detail.body.run?.profiles?.email === member.email}`);
  check(detail.body.events?.some((e) => e.event_type === "qa_detail_probe")
    && detail.body.audit && typeof detail.body.audit === "object", "events and audit returned");
  check(!Object.hasOwn(detail.body.run || {}, "storage_path") && detail.cache.includes("no-store"),
    "storage path hidden and response not cached", detail.cache);
  check((await get(crypto.randomUUID(), admin.token)).status === 404, "unknown UUID returns 404");
  for (const [label, id] of [["malformed ID", "not-a-uuid"],
    ["SQLi shaped ID", "' OR 1=1 --"], ["overlong ID", "9".repeat(500)]]) {
    const result = await get(id, admin.token);
    check(result.status === 400, `${label} rejected`, `HTTP ${result.status}`);
  }
  check((await preview(ids.run, "")).status === 401, "preview anonymous denied");
  check((await preview(ids.run, member.token)).status === 403, "preview member denied");
  check((await preview(ids.run, admin.token)).status === 410, "preview with no image returns 410");
  check((await preview(crypto.randomUUID(), admin.token)).status === 404, "preview unknown UUID returns 404");
  for (const [label, id] of [["malformed ID", "not-a-uuid"],
    ["SQLi shaped ID", "' OR 1=1 --"], ["overlong ID", "9".repeat(500)]]) {
    const result = await preview(id, admin.token);
    check(result.status === 400, `preview ${label} rejected`, `HTTP ${result.status}`);
  }
  await db(`face_analysis_runs?id=eq.${ids.run}`, "PATCH", {
    storage_path: `qa/face-detail/${tag}.png`, image_expires_at: new Date(Date.now() - 60000).toISOString()
  });
  check((await preview(ids.run, admin.token)).status === 410, "preview expired image returns 410");
  const previewEvents = await db(`face_analysis_events?select=id,event_type&run_id=eq.${ids.run}`);
  check(previewEvents.length === 1 && previewEvents[0].event_type === "qa_detail_probe",
    "denied previews create no request event", `events ${previewEvents.length}`);
  imagePath = `${member.id}/${ids.run}/source.png`;
  const uploaded = await service.storage.from("face-analysis-uploads").upload(imagePath,
    Buffer.from("89504e470d0a1a0a", "hex"), { contentType: "image/png" });
  if (uploaded.error) throw new Error("Cannot create QA image fixture");
  await db(`face_analysis_runs?id=eq.${ids.run}`, "PATCH", {
    storage_path: imagePath, image_expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  const adminValid = await preview(ids.run, admin.token);
  check(adminValid.status === 200 && adminValid.body.ok === true
    && adminValid.body.expiresIn === 300 && Boolean(adminValid.body.url),
    "named admin obtains valid private preview", `HTTP ${adminValid.status}`);
  const memberValid = await fetch(`${baseUrl}/api/face-analysis/runs/${ids.run}/preview`, {
    headers: { Authorization: `Bearer ${member.token}` }
  });
  const memberBody = await memberValid.json().catch(() => ({}));
  check(memberValid.status === 200 && memberBody.ok === true
    && memberBody.expiresIn === 300 && Boolean(memberBody.url),
    "owner obtains valid private preview", `HTTP ${memberValid.status}`);
} finally {
  if (imagePath) await service.storage.from("face-analysis-uploads").remove([imagePath]);
  await db(`admin_audit_logs?target_id=eq.${ids.run}`, "DELETE");
  await db(`face_analysis_events?run_id=eq.${ids.run}`, "DELETE");
  await db(`face_analysis_runs?id=eq.${ids.run}`, "DELETE");
  for (const id of ids.profiles) await db(`profiles?id=eq.${id}`, "DELETE");
  for (const id of ids.auth) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  if ((await db(`face_analysis_runs?select=id&id=eq.${ids.run}`)).length
    || (await db(`face_analysis_events?select=id&run_id=eq.${ids.run}`)).length) {
    throw new Error("QA report/events remain");
  }
  console.log("QA Auth/profiles/report/events fixtures cleaned");
}
console.log(`${passed}/${checks} admin face detail checks passed`);
if (passed !== checks) process.exitCode = 1;

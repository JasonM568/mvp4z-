#!/usr/bin/env node
// Production-build smoke against a local approved quality stub and isolated DB.
// The caller must separately verify that the app points to a loopback stub.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
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
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2 || !members.every((m) => m.profile_id && m.email && m.password))
  throw new Error("Expected two local members");
const [a, b] = members;
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const auth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
function data(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function token(member) {
  return data(await auth.auth.signInWithPassword({ email: member.email, password: member.password }),
    "local login").session.access_token;
}
async function state(id) {
  return data(await service.from("face_analysis_runs")
    .select("status,upload_attempts,storage_path,upload_claim_token")
    .eq("id", id).single(), "run state");
}
async function objects(id) {
  return data(await service.storage.from("face-analysis-uploads")
    .list(`${a.profile_id}/${id}`), "Storage list").map((object) =>
    `${a.profile_id}/${id}/${object.name}`);
}
async function ledger() {
  const [entitlements, transactions, usage] = await Promise.all([
    service.from("member_entitlements").select("id,credits_remaining").eq("user_id", a.profile_id),
    service.from("credit_transactions").select("id").eq("user_id", a.profile_id),
    service.from("usage_logs").select("id").eq("user_id", a.profile_id)
  ]);
  return JSON.stringify([data(entitlements, "entitlements"), data(transactions, "transactions"),
    data(usage, "usage")]);
}
async function upload(id, bearer, image) {
  const form = new FormData();
  form.append("image", new File([image], "synthetic-control.png", { type: "image/png" }));
  const response = await fetch(`${baseUrl}/api/face-analysis/runs/${id}/upload`, {
    method: "POST", headers: { Authorization: `Bearer ${bearer}` }, body: form,
    signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
let checks = 0, passed = 0;
function check(ok, label, detail = "") {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}
const id = crypto.randomUUID();
let created = false;
try {
  const aToken = await token(a), bToken = await token(b);
  const pixels = Buffer.alloc(512 * 512 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = 70 + ((i * 73 + Math.floor(i / 37) * 41) % 130);
  const image = await sharp(pixels, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer();
  const before = await ledger();
  data(await service.from("face_analysis_runs").insert({
    id, request_id: crypto.randomUUID(), user_id: a.profile_id,
    mode: "self", consent_version: "qa-local", status: "created"
  }), "run create");
  created = true;
  check((await upload(id, bToken, image)).status === 404, "B cannot upload to A run");
  const first = await upload(id, aToken, image);
  const firstState = await state(id);
  check(first.status === 200 && ["quality_rejected", "uploaded"].includes(first.body.status)
    && firstState.status === first.body.status && firstState.upload_attempts === 1,
  "synthetic PNG traverses integrated quality route", `HTTP ${first.status}, ${firstState.status}`);
  if (firstState.status === "quality_rejected") {
    check((await objects(id)).length === 0 && !firstState.storage_path,
      "quality rejection has no Storage object");
    const second = await upload(id, aToken, image);
    const secondState = await state(id);
    check(second.status === 200 && secondState.status === "uploaded"
      && secondState.upload_attempts === 2,
    "second quality response uploads image", `HTTP ${second.status}`);
  }
  const finalState = await state(id);
  const paths = await objects(id);
  check(finalState.status === "uploaded" && !finalState.upload_claim_token
    && paths.length === 1 && paths[0] === finalState.storage_path,
  "one private object matches DB path and claim is released");
  const events = data(await service.from("face_analysis_events").select("event_type")
    .eq("run_id", id), "events");
  check(events.filter((event) => event.event_type === "quality_passed").length === 1
    && events.length === finalState.upload_attempts,
  "one event per quality attempt");
  check(await ledger() === before, "quality upload does not charge credits");
} finally {
  if (created) {
    const paths = await objects(id);
    if (paths.length) data(await service.storage.from("face-analysis-uploads").remove(paths), "Storage cleanup");
    data(await service.from("face_analysis_runs").delete().eq("id", id), "run cleanup");
    const [runs, events, storage] = await Promise.all([
      service.from("face_analysis_runs").select("id").eq("id", id),
      service.from("face_analysis_events").select("id").eq("run_id", id),
      objects(id)
    ]);
    if (data(runs, "run cleanup verify").length || data(events, "event cleanup verify").length
      || storage.length) throw new Error("Integrated upload fixture remains");
    console.log("QA run/event/Storage fixture cleaned");
  }
}
console.log(`${passed}/${checks} integrated valid-image checks passed`);
if (passed !== checks) process.exitCode = 1;

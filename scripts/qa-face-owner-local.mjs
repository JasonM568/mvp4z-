#!/usr/bin/env node
// Disposable face-report ownership checks against a local app and local Supabase.
// Usage: node scripts/qa-face-owner-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!args["env-file"] || !args["members-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url, --env-file and --members-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2) throw new Error("Expected two QA members");
const [a, b] = members;
const now = new Date().toISOString();
const runs = [a, b].map((member) => ({
  id: crypto.randomUUID(), request_id: crypto.randomUUID(), user_id: member.profile_id,
  mode: "self", consent_version: "qa-local", status: "completed",
  report_structured: { qa: true }, report_text: "QA isolated report",
  completed_at: now
}));
let passed = 0;
try {
  const inserted = await rest("face_analysis_runs", { method: "POST", body: runs });
  if (inserted.status !== 201 || inserted.body.length !== 2) throw new Error(`Fixture insert failed: ${inserted.status}`);

  const memberPreflight = await api("/api/member/me", a.access_token);
  assert(memberPreflight.status === 200, `A token invalid: ${memberPreflight.status}`);

  const list = await api("/api/face-analysis/runs?limit=50", a.access_token);
  assert(list.status === 200 && list.body.items?.some((item) => item.id === runs[0].id)
    && !list.body.items?.some((item) => item.id === runs[1].id), "A list leaked B report or omitted A report");
  console.log("PASS report list: A present, B absent"); passed++;

  const own = await api(`/api/face-analysis/runs/${runs[0].id}`, a.access_token);
  assert(own.status === 200 && own.body.run?.id === runs[0].id
    && !Object.hasOwn(own.body.run, "storage_path") && !Object.hasOwn(own.body.run, "model_trace"),
  "A own report missing or leaked private fields");
  console.log("PASS own report detail: 200, private fields absent"); passed++;

  for (const [path, method] of [
    [`/api/face-analysis/runs/${runs[1].id}`, "GET"],
    [`/api/face-analysis/runs/${runs[1].id}/preview`, "GET"],
    [`/api/face-analysis/runs/${runs[1].id}`, "DELETE"],
    [`/api/face-analysis/runs/${runs[1].id}/image`, "DELETE"]
  ]) {
    const response = await api(path, a.access_token, method);
    assert(response.status === 404, `A accessed B report ${method} ${path}: ${response.status}`);
    console.log(`PASS other report ${method} ${path.split("/").at(-1)}: 404`); passed++;
  }

  const direct = await fetch(`${restUrl}/face_analysis_runs?select=id&id=eq.${runs[1].id}`, {
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${a.access_token}` }
  });
  assert([401, 403, 404].includes(direct.status), `A read face report directly: ${direct.status}`);
  console.log(`PASS raw PostgREST face run access: HTTP ${direct.status}`); passed++;

  const after = await rest(`face_analysis_runs?select=id,status&or=(id.eq.${runs[0].id},id.eq.${runs[1].id})`);
  assert(after.status === 200 && after.body.length === 2 && after.body.every((row) => row.status === "completed"),
    "Cross-member requests mutated face report fixture");
  console.log("PASS report fixtures unchanged after cross-member requests"); passed++;
} finally {
  for (const run of runs) await rest(`face_analysis_runs?id=eq.${run.id}`, { method: "DELETE" });
}
for (const run of runs) {
  const after = await rest(`face_analysis_runs?select=id&id=eq.${run.id}`);
  assert(after.status === 200 && after.body.length === 0, "Face QA fixture remains");
}
console.log(`${passed}/${passed} face owner checks passed; fixtures cleaned`);

function assert(ok, message) { if (!ok) throw new Error(message); }
async function rest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => []) };
}
async function api(path, token, method = "GET") {
  const response = await fetch(`${baseUrl}${path}`, { method,
    headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

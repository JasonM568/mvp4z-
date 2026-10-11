#!/usr/bin/env node
// Local-only council report ownership and direct-write regression.
// Usage: node scripts/qa-council-owner-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

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
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2) throw new Error("Expected two QA members");
const [a, b] = members;
const entitlements = [];
for (const member of members) {
  const result = await rest(`member_entitlements?select=id&user_id=eq.${member.profile_id}&limit=1`);
  if (result.status !== 200 || result.body.length !== 1) throw new Error("Missing isolated entitlement fixture");
  entitlements.push(result.body[0].id);
}
const ids = [crypto.randomUUID(), crypto.randomUUID()];
const forgedId = crypto.randomUUID();
const marker = `QA council owner ${crypto.randomBytes(4).toString("hex")}`;
let passed = 0;
try {
  const made = await rest("council_runs", { method: "POST", body: members.map((member, i) => ({
    id: ids[i], user_id: member.profile_id, entitlement_id: entitlements[i],
    request: { qa: marker }, final_label: "qa", final_text: marker,
    final_ok: true, credits_charged: 0
  })) });
  assert(made.status === 201 && made.body.length === 2, `Fixture insert failed: ${made.status}`);

  const preflight = await api("/api/member/me", a.access_token);
  assert(preflight.status === 200, `A token invalid: ${preflight.status}`);

  const list = await api("/api/member/council-runs?limit=20", a.access_token);
  assert(list.status === 200 && list.body.items?.some((item) => item.id === ids[0])
    && !list.body.items?.some((item) => item.id === ids[1]), "A list leaked B report or omitted A");
  console.log("PASS council list: A present, B absent"); passed++;

  const own = await api(`/api/member/council-runs/${ids[0]}`, a.access_token);
  const other = await api(`/api/member/council-runs/${ids[1]}`, a.access_token);
  assert(own.status === 200 && own.body.run?.id === ids[0], "A own report unavailable");
  assert(other.status === 404, `A accessed B report: ${other.status}`);
  console.log("PASS council detail: own 200, other 404"); passed++;

  const rawOwn = await memberRest(`council_runs?select=id&id=eq.${ids[0]}`, a.access_token);
  const rawOther = await memberRest(`council_runs?select=id&id=eq.${ids[1]}`, a.access_token);
  assert(rawOwn.status === 200 && rawOwn.body.length === 1
    && rawOther.status === 200 && rawOther.body.length === 0, "Council RLS read isolation failed");
  console.log("PASS raw council RLS: own 1, other 0"); passed++;

  const changed = await memberRest(`council_runs?id=eq.${ids[1]}`, a.access_token,
    "PATCH", { final_text: "QA tamper" });
  const after = await rest(`council_runs?select=final_text&id=eq.${ids[1]}`);
  assert([200, 204, 401, 403].includes(changed.status) && after.body[0]?.final_text === marker,
    "A modified B council report");
  console.log(`PASS raw council PATCH: HTTP ${changed.status}, DB unchanged`); passed++;

  const inserted = await memberRest("council_runs", a.access_token, "POST", {
    id: forgedId, user_id: a.profile_id, entitlement_id: entitlements[0],
    request: { qa: marker }, final_text: "forged", credits_charged: 0
  });
  const forged = await rest(`council_runs?select=id&id=eq.${forgedId}`);
  assert(inserted.status >= 400 && forged.body.length === 0, "A forged council report directly");
  console.log(`PASS raw council INSERT: HTTP ${inserted.status}, 0 rows`); passed++;
} finally {
  for (const id of [...ids, forgedId]) await rest(`council_runs?id=eq.${id}`, { method: "DELETE" });
}
for (const id of [...ids, forgedId]) {
  const after = await rest(`council_runs?select=id&id=eq.${id}`);
  assert(after.status === 200 && after.body.length === 0, "Council QA fixture remains");
}
console.log(`${passed}/${passed} council owner checks passed; fixtures cleaned`);

function assert(ok, message) { if (!ok) throw new Error(message); }
async function rest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => []) };
}
async function memberRest(path, token, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.ANON_KEY, Authorization: `Bearer ${token}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => []) };
}
async function api(path, token) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

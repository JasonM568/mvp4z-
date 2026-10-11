#!/usr/bin/env node
// B3: safe direct-HTTP authorization probe. Uses nonexistent IDs, so even an
// unexpectedly callable RPC cannot debit a real member.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (!args["env-file"] || !args["members-file"]) throw new Error("Provide local --env-file and --members-file");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (!Array.isArray(members) || !members[0]?.email || !members[0]?.password)
  throw new Error("Expected an isolated QA member");
const auth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const login = await auth.auth.signInWithPassword({ email: members[0].email, password: members[0].password });
if (login.error || !login.data.session?.access_token) throw new Error("QA member login failed");
const token = login.data.session.access_token;
const userId = crypto.randomUUID();
const entitlementId = crypto.randomUUID();
const payload = { p_user_id: userId, p_entitlement_id: entitlementId,
  p_previous_credits: 1, p_charge: 1, p_ref_id: `qa-b3-${crypto.randomUUID()}` };
let checks = 0, passed = 0;
function check(ok, label, status, code) {
  checks++; if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${status}, code ${code || "none"}`);
}
async function call(name, key, bearer) {
  const response = await fetch(`${env.REST_URL}/rpc/${name}`, { method: "POST",
    signal: AbortSignal.timeout(30_000), headers: { apikey: key,
      Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, code: body.code };
}
for (const name of ["commit_chat_credit", "commit_council_credit"]) {
  const anonymous = await call(name, env.ANON_KEY, env.ANON_KEY);
  check([401, 403].includes(anonymous.status), `${name} anonymous denied`, anonymous.status, anonymous.code);
  const member = await call(name, env.ANON_KEY, token);
  check(member.status === 403 && member.code === "42501", `${name} member denied`, member.status, member.code);
  const server = await call(name, env.SERVICE_ROLE_KEY, env.SERVICE_ROLE_KEY);
  check(server.code === "CR002", `${name} service role reaches function without debit`, server.status, server.code);
}
console.log(`${passed}/${checks} B3 direct PostgREST authorization checks passed; no QA rows written`);
if (passed !== checks) process.exitCode = 1;

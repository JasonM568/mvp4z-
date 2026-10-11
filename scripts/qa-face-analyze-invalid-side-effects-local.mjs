#!/usr/bin/env node
// Local-only: malformed analyze IDs must fail before any persistent write.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
  || !/^postgresql?:\/\/[^/]+@(?:localhost|127\.0\.0\.1):\d+\//.test(env.DB_URL || ""))
  throw new Error("Refusing non-local Supabase");
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members[0];
if (!member?.profile_id || !member?.email || !member?.password) throw new Error("Missing QA member");
const auth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const login = await auth.auth.signInWithPassword({ email: member.email, password: member.password });
if (login.error || !login.data.session?.access_token) throw new Error("QA member login failed");
const token = login.data.session.access_token;
function snapshot() {
  const id = member.profile_id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid QA profile ID");
  const sql = `select json_build_object(
    'runs',(select count(*) from public.face_analysis_runs where user_id='${id}'),
    'events',(select count(*) from public.face_analysis_events where user_id='${id}'),
    'usage',(select count(*) from public.usage_logs where user_id='${id}'),
    'credits',(select count(*) from public.credit_transactions where user_id='${id}'),
    'balance',(select coalesce(sum(credits_remaining),0) from public.member_entitlements where user_id='${id}'),
    'storage',(select count(*) from storage.objects where name like '${id}/%')
  )`;
  return JSON.parse(execFileSync("psql", [env.DB_URL, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim());
}
const before = snapshot();
let passed = 0;
for (const [label, id] of [["bad-id", "bad-id"], ["SQLi", "sql'OR'1=1"], ["500 chars", "a".repeat(500)]]) {
  const response = await fetch(`${baseUrl}/api/face-analysis/runs/${encodeURIComponent(id)}/analyze`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}"
  });
  const ok = response.status === 400;
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: HTTP ${response.status}`);
}
const after = snapshot();
const unchanged = JSON.stringify(before) === JSON.stringify(after);
if (unchanged) passed++;
console.log(`${unchanged ? "PASS" : "FAIL"} no DB, Storage, or credit changes`);
console.log(`${passed}/4 malformed analyze side-effect checks passed`);
if (passed !== 4) process.exitCode = 1;

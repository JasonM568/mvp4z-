#!/usr/bin/env node
// Invalid face-run path IDs across member routes; no report or model fixture.
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
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (!Array.isArray(members) || !members[0]?.email || !members[0]?.password)
  throw new Error("Expected QA member credentials");
const auth = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const login = await auth.auth.signInWithPassword({ email: members[0].email,
  password: members[0].password });
if (login.error || !login.data.session?.access_token) throw new Error("QA member login failed");
const token = login.data.session.access_token;
const preflight = await fetch(`${baseUrl}/api/member/me`, { signal: AbortSignal.timeout(10_000),
  headers: { Authorization: `Bearer ${token}` } });
if (preflight.status !== 200) throw new Error(`QA member preflight HTTP ${preflight.status}`);
const routes = [
  ["detail GET", "GET", (id) => `/api/face-analysis/runs/${id}`],
  ["report DELETE", "DELETE", (id) => `/api/face-analysis/runs/${id}`],
  ["image DELETE", "DELETE", (id) => `/api/face-analysis/runs/${id}/image`],
  ["preview GET", "GET", (id) => `/api/face-analysis/runs/${id}/preview`],
  ["PDF GET", "GET", (id) => `/api/face-analysis/runs/${id}/pdf`],
  ["analyze POST", "POST", (id) => `/api/face-analysis/runs/${id}/analyze`]
];
const ids = [
  ["unknown UUID", crypto.randomUUID()],
  ["malformed", "bad-id"],
  ["SQLi-shaped", "sql'OR'1=1"],
  ["overlong", "a".repeat(500)]
];
let checks = 0, passed = 0;
for (const [label, method, path] of routes) {
  for (const [kind, id] of ids) {
    const response = await fetch(`${baseUrl}${path(id)}`, { method,
      signal: AbortSignal.timeout(15_000), headers: {
        Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {})
      }, body: method === "POST" ? "{}" : undefined });
    const expected = kind === "unknown UUID" ? [404]
      : ["preview GET", "PDF GET", "analyze POST"].includes(label) ? [400] : [404];
    const ok = expected.includes(response.status);
    checks++; if (ok) passed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} ${kind}: HTTP ${response.status}`);
  }
}
console.log(`${passed}/${checks} face-run path ID checks passed; no QA report/model fixture created`);
if (passed !== checks) process.exitCode = 1;

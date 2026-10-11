#!/usr/bin/env node
// Authorization sweep over every admin handler. Anonymous mutations must be rejected before writes.
// Usage: node scripts/qa-admin-authz-smoke.mjs --base-url=http://localhost:3100

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const arg = process.argv.find((value) => value.startsWith("--base-url="));
const baseUrl = (arg?.slice("--base-url=".length) || "http://localhost:3000").replace(/\/$/, "");
const memberArg = process.argv.find((value) => value.startsWith("--members-file="));
const memberFile = memberArg?.slice("--members-file=".length);
const identities = [
  { label: "anonymous", headers: {}, allowed: [401, 403] },
  { label: "invalid bearer", headers: { Authorization: "Bearer qa-invalid-token" }, allowed: [401, 403] }
];
if (memberFile) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl)) throw new Error("Member token sweep requires localhost");
  const member = JSON.parse(await readFile(memberFile, "utf8")).members?.[0];
  if (!member?.access_token) throw new Error("Missing local QA member token");
  const preflight = await fetch(`${baseUrl}/api/member/me`, { headers: { Authorization: `Bearer ${member.access_token}` } });
  await preflight.arrayBuffer();
  if (preflight.status !== 200) throw new Error(`QA member preflight returned ${preflight.status}, expected 200`);
  identities.push({ label: "member bearer", headers: { Authorization: `Bearer ${member.access_token}` }, allowed: [403] });
}
const root = path.resolve("app/api/admin");
const files = await walk(root);
const sampleId = "00000000-0000-4000-8000-000000000001";
let tested = 0;
let failed = 0;

for (const file of files) {
  if (path.basename(file) !== "route.ts") continue;
  const source = await readFile(file, "utf8");
  const route = "/api/admin/" + path.relative(root, path.dirname(file)).replaceAll(path.sep, "/")
    .replaceAll(/\[[^\]]+\]/g, sampleId).replace(/\/$/, "").replace(/^\.$/, "");
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    if (!new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).test(source)) continue;
    for (const identity of identities) {
      tested += 1;
      try {
        const response = await fetch(baseUrl + route, { method, headers: identity.headers, redirect: "manual" });
        const ok = identity.allowed.includes(response.status);
        if (!ok) failed += 1;
        console.log(`${ok ? "PASS" : "FAIL"} ${method} ${route} [${identity.label}]: ${response.status}`);
        await response.arrayBuffer();
      } catch (error) {
        failed += 1;
        console.error(`FAIL ${method} ${route} [${identity.label}]: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

console.log(`${tested - failed}/${tested} admin handlers reject unauthorized requests`);
if (failed) process.exitCode = 1;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }));
  return nested.flat();
}

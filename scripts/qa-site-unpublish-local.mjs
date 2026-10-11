#!/usr/bin/env node
// Local-only public CMS empty-state regression. Restores every service publish flag.
import { readFile } from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
if (!args["env-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")) {
  throw new Error("Provide local --base-url and --env-file");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
    || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");

const original = await db("site_services?select=id,is_published");
const published = original.filter((row) => row.is_published);
if (!published.length) throw new Error("Need a local published service to validate the unpublish transition");
let observed;
try {
  const before = await publicContent();
  if (!before.ok || !Array.isArray(before.services) || !before.services.length) {
    throw new Error("Public CMS baseline is unavailable");
  }
  for (const row of published) await db(`site_services?id=eq.${row.id}`, "PATCH", { is_published: false });
  const remaining = await db("site_services?select=id&is_published=eq.true");
  if (remaining.length) throw new Error("Local DB did not clear published services");
  const after = await publicContent();
  observed = { before: before.services.length, after: after.services?.length ?? null,
    cacheControl: after.cacheControl, ok: after.ok };
  console.log(`CMS all-unpublished: DB published=0, API services=${observed.after}, baseline=${observed.before}`);
  if (!after.ok || !Array.isArray(after.services) || after.services.length !== 0) {
    throw new Error("QA-FS-M12: unpublished services reappear through JSON fallback");
  }
} finally {
  for (const row of published) await db(`site_services?id=eq.${row.id}`, "PATCH", { is_published: true });
  const restored = await db("site_services?select=id,is_published");
  if (restored.length !== original.length || original.some((row) =>
    restored.find((other) => other.id === row.id)?.is_published !== row.is_published)) {
    throw new Error("Local CMS publish flags were not restored");
  }
  console.log(`Restored ${published.length} local service publish flags`);
}
console.log("1/1 CMS all-unpublished empty-state check passed");

async function db(path, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function publicContent() {
  const response = await fetch(`${baseUrl}/api/site-content?qa=${Date.now()}`, { cache: "no-store" });
  const body = await response.json();
  return { ...body, cacheControl: response.headers.get("cache-control") };
}

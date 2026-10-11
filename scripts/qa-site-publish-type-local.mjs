#!/usr/bin/env node
// Local-only admin CMS API: reject non-boolean publish fields on direct API calls.
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
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-site-publish-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
let authUserId, profileId, itemId, token;
let passed = 0;
function check(ok, label) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Site Admin", role: "admin" }]);
  profileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  const badCreate = await api("POST", "/api/admin/site-content", {
    type: "services", title: `QA Publish ${suffix}`, category: "QA", description: "isolated fixture",
    is_published: "false"
  });
  const createdItem = badCreate.body.item;
  itemId = createdItem?.id;
  check(badCreate.status === 400 && !itemId,
    `string false on CREATE must be 400 and create no item (HTTP ${badCreate.status}, published=${createdItem?.is_published})`);

  if (!itemId) {
    const goodCreate = await api("POST", "/api/admin/site-content", {
      type: "services", title: `QA Publish ${suffix}`, category: "QA", description: "isolated fixture",
      is_published: false
    });
    if (goodCreate.status !== 201 || !goodCreate.body.item?.id) throw new Error("Cannot create draft fixture");
    itemId = goodCreate.body.item.id;
  }
  // Start PATCH from a known unpublished draft, regardless of CREATE outcome.
  await db(`site_services?id=eq.${itemId}`, "PATCH", { is_published: false });
  const badPatch = await api("PATCH", "/api/admin/site-content", {
    type: "services", id: itemId, is_published: "false"
  });
  const [stored] = await db(`site_services?select=id,is_published&id=eq.${itemId}`);
  check(badPatch.status === 400 && stored?.is_published === false,
    `string false on PATCH must be 400 and remain unpublished (HTTP ${badPatch.status}, stored=${stored?.is_published})`);
  const publish = await api("PATCH", "/api/admin/site-content", {
    type: "services", id: itemId, is_published: true
  });
  const [published] = await db(`site_services?select=id,is_published&id=eq.${itemId}`);
  check(publish.status === 200 && published?.is_published === true,
    "boolean true publishes service");
  const unpublish = await api("PATCH", "/api/admin/site-content", {
    type: "services", id: itemId, is_published: false
  });
  const [unpublished] = await db(`site_services?select=id,is_published&id=eq.${itemId}`);
  check(unpublish.status === 200 && unpublished?.is_published === false,
    "boolean false unpublishes service");
} finally {
  if (itemId) {
    await db(`admin_audit_logs?target_id=eq.${itemId}`, "DELETE");
    await db(`site_services?id=eq.${itemId}`, "DELETE");
  }
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
if (itemId && (await db(`site_services?select=id&id=eq.${itemId}`)).length) throw new Error("CMS fixture remains");
if (profileId && (await db(`profiles?select=id&id=eq.${profileId}`)).length) throw new Error("Profile fixture remains");
console.log(`${passed}/4 publish type checks passed; fixtures cleaned`);
if (passed !== 4) process.exitCode = 1;

async function db(path, method = "GET", body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json"
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

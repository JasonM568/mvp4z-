#!/usr/bin/env node
// Local-only named-admin booking happy/error/audit regression.
// Usage: node scripts/qa-admin-booking-local.mjs --base-url=http://127.0.0.1:3101 --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
    || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
    || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2) throw new Error("Expected two QA members");
const memberToken = members[0].access_token;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomBytes(6).toString("hex");
const email = `qa-admin-booking-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const marker = `QA-BOOKING-${suffix}`;
let authUserId;
let profileId;
let bookingId;
let passed = 0;

try {
  const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin auth user");
  authUserId = created.data.user.id;
  const profile = await db("profiles", "POST", [{ auth_user_id: authUserId, email,
    name: "QA Admin Booking", role: "admin" }]);
  profileId = profile[0].id;
  const booking = await db("consultation_bookings", "POST", [{ name: marker,
    email, source: marker, status: "pending" }]);
  bookingId = booking[0].id;

  const login = await authMember.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  const token = login.data.session.access_token;

  const list = await api("/api/admin/bookings?status=pending&limit=500", token);
  assert(list.status === 200 && list.body.bookings?.some((row) => row.id === bookingId)
    && list.body.summary?.pending >= 1, "Named admin cannot find pending booking");
  console.log("PASS named admin list: booking and pending summary visible"); passed++;

  const detail = await api(`/api/admin/bookings/${bookingId}`, token);
  assert(detail.status === 200 && detail.body.booking?.id === bookingId, "Named admin cannot read booking");
  console.log("PASS named admin detail: 200"); passed++;

  const updated = await api(`/api/admin/bookings/${bookingId}`, token, "PATCH",
    { status: "contacted", admin_note: marker });
  const [after] = await db(`consultation_bookings?select=status,admin_note&id=eq.${bookingId}`, "GET");
  const audit = await db(`admin_audit_logs?select=admin_user_id,action,target_id&target_id=eq.${bookingId}`, "GET");
  assert(updated.status === 200 && updated.body.booking?.status === "contacted"
    && after?.status === "contacted" && after.admin_note === marker
    && audit.length === 1 && audit[0].admin_user_id === profileId
    && audit[0].action === "booking_update", "Booking PATCH or named audit inconsistent");
  console.log("PASS named admin PATCH: API/DB/audit agree"); passed++;

  const invalid = await api(`/api/admin/bookings/${bookingId}`, token, "PATCH", { status: "__qa_invalid__" });
  const [still] = await db(`consultation_bookings?select=status&id=eq.${bookingId}`, "GET");
  assert(invalid.status === 400 && still?.status === "contacted", "Invalid status changed booking");
  console.log("PASS invalid status: 400, DB unchanged"); passed++;

  const denied = await api(`/api/admin/bookings/${bookingId}`, memberToken, "PATCH", { status: "completed" });
  const [last] = await db(`consultation_bookings?select=status&id=eq.${bookingId}`, "GET");
  assert(denied.status === 403 && last?.status === "contacted", "Member changed admin booking");
  console.log("PASS member PATCH: 403, DB unchanged"); passed++;

  const [beforeLimits] = await db(`consultation_bookings?select=*&id=eq.${bookingId}`, "GET");
  const defaultList = await api("/api/admin/bookings", token);
  assert(defaultList.status === 200 && Array.isArray(defaultList.body.bookings)
    && defaultList.body.bookings.length <= 100
    && defaultList.body.bookings.some((row) => row.id === bookingId)
    && Number.isInteger(defaultList.body.summary?.contacted), "Default booking limit or summary failed");
  console.log("PASS default list limit: HTTP 200, at most 100 rows and summary visible"); passed++;

  for (const value of ["-1", "abc", "0", "501"]) {
    const response = await api(`/api/admin/bookings?limit=${value}`, token);
    console.log(`${response.status === 400 ? "PASS" : "FAIL"} invalid list limit ${value}: HTTP ${response.status}`);
    if (response.status === 400) passed++;
  }
  for (const value of ["1", "500"]) {
    const response = await api(`/api/admin/bookings?limit=${value}`, token);
    const valid = response.status === 200 && Array.isArray(response.body.bookings)
      && response.body.bookings.length <= Number(value)
      && Number.isInteger(response.body.summary?.contacted)
      && response.body.summary.contacted >= 1;
    console.log(`${valid ? "PASS" : "FAIL"} valid list limit ${value}: HTTP ${response.status}`);
    if (valid) passed++;
  }
  const [afterLimits] = await db(`consultation_bookings?select=*&id=eq.${bookingId}`, "GET");
  assert(JSON.stringify(afterLimits) === JSON.stringify(beforeLimits), "GET limit checks changed booking data");
  console.log("PASS list limit requests: booking DB row unchanged"); passed++;
} finally {
  if (bookingId) {
    await db(`admin_audit_logs?target_id=eq.${bookingId}`, "DELETE");
    await db(`consultation_bookings?id=eq.${bookingId}`, "DELETE");
  }
  if (profileId) await db(`profiles?id=eq.${profileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
for (const [table, query] of [["consultation_bookings", `id=eq.${bookingId}`],
  ["admin_audit_logs", `target_id=eq.${bookingId}`], ["profiles", `id=eq.${profileId}`]]) {
  const rows = await db(`${table}?select=id&${query}`, "GET");
  assert(rows.length === 0, `${table} QA row remains`);
}
console.log(`${passed}/13 named-admin booking checks passed; fixtures cleaned`);
if (passed !== 13) process.exitCode = 1;

function assert(ok, message) { if (!ok) throw new Error(message); }
async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, token, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

#!/usr/bin/env node
// Local-only course lead and named-admin follow-up regression.
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
const member = JSON.parse(await readFile(args["members-file"], "utf8")).members?.[0];
if (!member?.access_token) throw new Error("Missing local QA member token");
const courseResponse = await fetch(`${baseUrl}/api/courses/checkout`);
const course = (await courseResponse.json().catch(() => ({}))).course;
if (courseResponse.status !== 200 || !course?.code) throw new Error("Local active course missing");
const suffix = crypto.randomBytes(6).toString("hex");
const adminEmail = `qa-course-admin-${suffix}@example.test`;
const leadEmail = `qa-course-lead-${suffix}@example.test`;
const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authMember = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let authUserId, adminProfileId, leadProfileId, orderId, registrationId, extraOrderId, extraRegistrationId, token;
let passed = 0;
function check(ok, label) { if (!ok) throw new Error(label); console.log(`PASS ${label}`); passed++; }

try {
  const created = await authAdmin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Cannot create local QA admin");
  authUserId = created.data.user.id;
  const [profile] = await db("profiles", "POST", [{ auth_user_id: authUserId, email: adminEmail,
    name: "QA Course Admin", role: "admin" }]);
  adminProfileId = profile.id;
  const login = await authMember.auth.signInWithPassword({ email: adminEmail, password });
  if (login.error || !login.data.session?.access_token) throw new Error("Local QA admin login failed");
  token = login.data.session.access_token;

  check((await api("/api/admin/course-registrations", "")).status === 401, "anonymous list rejected 401");
  check((await api("/api/admin/course-registrations", member.access_token)).status === 403,
    "member list rejected 403");

  const checkout = await api("/api/courses/checkout", "", "POST", {
    course_code: course.code, registration_type: "new", name: "QA Course Lead", phone: "0912345678",
    email: leadEmail, invoice_request: { buyer_type: "personal", buyer_name: "QA", buyer_email: leadEmail,
      carrier_type: "none" }
  });
  const [lead] = await db(`profiles?select=id&email=eq.${leadEmail}`, "GET");
  leadProfileId = lead?.id;
  const [order] = leadProfileId ? await db(`orders?select=id,status&user_id=eq.${leadProfileId}`, "GET") : [];
  orderId = order?.id;
  const [registration] = orderId ? await db(`course_registrations?select=id,contact_status&order_id=eq.${orderId}`, "GET") : [];
  registrationId = registration?.id;
  check(checkout.status === 200 && order?.status === "pending" && registration?.contact_status === "new",
    "unpaid checkout creates new lead");

  const list = await api("/api/admin/course-registrations?contact_status=new&limit=500", token);
  check(list.status === 200 && list.body.registrations?.some((row) => row.id === registrationId)
    && list.body.summary?.pendingContact >= 1, "admin sees unpaid new lead and pending summary");

  const invalid = await api(`/api/admin/course-registrations/${registrationId}`, token, "PATCH",
    { contact_status: "not_a_status" });
  const [afterInvalid] = await db(`course_registrations?select=contact_status&id=eq.${registrationId}`, "GET");
  check(invalid.status === 400 && afterInvalid?.contact_status === "new", "invalid follow-up status rejected");
  const oversize = await api(`/api/admin/course-registrations/${registrationId}`, token, "PATCH",
    { contact_note: "x".repeat(2001) });
  check(oversize.status === 400, "2001-character follow-up note rejected");
  const memberPatch = await api(`/api/admin/course-registrations/${registrationId}`, member.access_token,
    "PATCH", { contact_status: "contacted" });
  check(memberPatch.status === 403, "member follow-up PATCH rejected 403");

  const updated = await api(`/api/admin/course-registrations/${registrationId}`, token, "PATCH",
    { contact_status: "contacted", contact_note: "QA follow-up" });
  const [contacted] = await db(`course_registrations?select=contact_status,contact_note,contacted_at&id=eq.${registrationId}`, "GET");
  const audit = await db(`admin_audit_logs?select=admin_user_id,action,target_id&target_id=eq.${registrationId}`, "GET");
  check(updated.status === 200 && contacted?.contact_status === "contacted"
    && contacted.contact_note === "QA follow-up" && contacted.contacted_at
    && audit.length === 1 && audit[0].admin_user_id === adminProfileId
    && audit[0].action === "course_registration_followup", "follow-up PATCH, DB and named audit agree");

  const filtered = await api("/api/admin/course-registrations?contact_status=contacted&limit=500", token);
  check(filtered.status === 200 && filtered.body.registrations?.some((row) => row.id === registrationId)
    && filtered.body.summary?.byContact?.contacted >= 1, "contacted filter includes updated lead");

  const reset = await api(`/api/admin/course-registrations/${registrationId}`, token, "PATCH",
    { contact_status: "new", contact_note: "" });
  const [resetRow] = await db(`course_registrations?select=contact_status,contact_note,contacted_at&id=eq.${registrationId}`, "GET");
  check(reset.status === 200 && resetRow?.contact_status === "new" && resetRow.contact_note === ""
    && resetRow.contacted_at === null, "reset to new clears contact timestamp");

  const [courseProduct] = await db(`course_products?select=id&code=eq.${course.code}&limit=1`, "GET");
  const [extraOrder] = await db("orders", "POST", [{ order_no: `QALEAD${suffix.toUpperCase()}`,
    user_id: member.profile_id, order_type: "course", course_product_id: courseProduct.id,
    amount: course.price_new, currency: "TWD", status: "pending", provider: "ecpay" }]);
  extraOrderId = extraOrder.id;
  const [extraRegistration] = await db("course_registrations", "POST", [{ order_id: extraOrderId,
    user_id: member.profile_id, course_product_id: courseProduct.id, status: "pending",
    registration_type: "new", amount: course.price_new, currency: "TWD",
    name: "QA Extra Lead", phone: "0912345678", email: `qa-course-extra-${suffix}@example.test` }]);
  extraRegistrationId = extraRegistration.id;
  const limited = await api("/api/admin/course-registrations?limit=1", token);
  const fullRows = await db("course_registrations?select=id,contact_status", "GET");
  const fullPending = fullRows.filter((row) => row.contact_status === "new").length;
  const fullSummary = limited.status === 200 && limited.body.registrations?.length === 1
    && limited.body.summary?.total === fullRows.length
    && limited.body.summary?.pendingContact === fullPending;
  console.log(`${fullSummary ? "PASS" : "FAIL"} limit=1 full summary: API total=${limited.body.summary?.total}, DB total=${fullRows.length}, API pending=${limited.body.summary?.pendingContact}, DB pending=${fullPending}`);
  if (fullSummary) passed++;

  for (const value of ["-1", "abc", "0", "501"]) {
    const response = await api(`/api/admin/course-registrations?limit=${value}`, token);
    const ok = response.status === 400;
    console.log(`${ok ? "PASS" : "FAIL"} invalid list limit ${value}: HTTP ${response.status}`);
    if (ok) passed++;
  }
  for (const value of ["1", "500"]) {
    const response = await api(`/api/admin/course-registrations?limit=${value}`, token);
    const ok = response.status === 200 && Array.isArray(response.body.registrations)
      && response.body.registrations.length <= Number(value)
      && Number.isInteger(response.body.summary?.total);
    console.log(`${ok ? "PASS" : "FAIL"} valid list limit ${value}: HTTP ${response.status}`);
    if (ok) passed++;
  }
} finally {
  if (registrationId) await db(`admin_audit_logs?target_id=eq.${registrationId}`, "DELETE");
  if (extraRegistrationId) await db(`course_registrations?id=eq.${extraRegistrationId}`, "DELETE");
  if (extraOrderId) await db(`orders?id=eq.${extraOrderId}`, "DELETE");
  if (orderId) {
    await db(`course_registrations?order_id=eq.${orderId}`, "DELETE");
    await db(`orders?id=eq.${orderId}`, "DELETE");
  }
  if (leadProfileId) await db(`profiles?id=eq.${leadProfileId}`, "DELETE");
  if (adminProfileId) await db(`profiles?id=eq.${adminProfileId}`, "DELETE");
  if (authUserId) {
    const removed = await authAdmin.auth.admin.deleteUser(authUserId);
    if (removed.error) throw new Error("Local QA admin Auth cleanup failed");
  }
}
for (const [table, query] of [["course_registrations", `id=eq.${registrationId}`],
  ["course_registrations", `id=eq.${extraRegistrationId}`], ["orders", `id=eq.${extraOrderId}`],
  ["orders", `id=eq.${orderId}`], ["profiles", `id=eq.${adminProfileId}`],
  ["profiles", `id=eq.${leadProfileId}`], ["admin_audit_logs", `target_id=eq.${registrationId}`]]) {
  if ((await db(`${table}?select=id&${query}`, "GET")).length) throw new Error(`${table} QA row remains`);
}
console.log(`${passed}/17 admin course follow-up checks passed; fixtures cleaned`);
if (passed !== 17) process.exitCode = 1;

async function db(path, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json", Prefer: "return=representation"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local DB ${method} ${path.split("?")[0]} returned ${response.status}`);
  return response.json().catch(() => []);
}
async function api(path, bearer, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

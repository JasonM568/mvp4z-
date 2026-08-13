import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const [imagePath] = process.argv.slice(2);
if (!imagePath) throw new Error("Usage: node scripts/test-face-production-e2e.mjs <synthetic-image-path>");

const site = process.env.FACE_E2E_SITE || "https://www.xunfeng.tw";
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^['\"]|['\"]$/g, "")])
);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Missing local Supabase admin configuration");

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `face-e2e-${suffix}@xunfeng.test`;
const password = `FaceE2e!${suffix}`;
let token = "";
let profileId = "";
let authUserId = "";
let runId = "";

async function request(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${new URL(url).pathname}: ${response.status} ${body.error || JSON.stringify(body)}`);
  return body;
}

async function adminDelete(table, filter) {
  await request(`${supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "return=minimal" }
  });
}

try {
  const registration = await request(`${site}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Face E2E Synthetic Test", email, password, phone: "" })
  });
  token = registration.token || registration.access_token || registration.session?.access_token || "";
  profileId = registration.member?.id || "";
  if (!token || !profileId) throw new Error("Registration did not return a member session");

  const run = await request(`${site}/api/face-analysis/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requestId: crypto.randomUUID(), mode: "self", subjectAge: 35, consentVersion: "2026-08-01", thirdPartyConsent: false })
  });
  runId = run.runId;
  if (!runId) throw new Error("Run creation did not return runId");

  const bytes = await readFile(imagePath);
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), basename(imagePath));
  const upload = await request(`${site}/api/face-analysis/runs/${runId}/upload`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
  });
  if (!upload.quality?.passed) throw new Error(`Synthetic image did not pass quality: ${JSON.stringify(upload.quality?.reasons || [])}`);

  const analysis = await request(`${site}/api/face-analysis/runs/${runId}/analyze`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }
  });
  if (analysis.run?.status !== "completed" || Number(analysis.creditsCharged) !== 20) {
    throw new Error(`Unexpected analysis completion: ${JSON.stringify({ status: analysis.run?.status, creditsCharged: analysis.creditsCharged })}`);
  }

  await request(`${site}/api/face-analysis/runs/${runId}/image`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` }
  });
  console.log(JSON.stringify({ ok: true, status: analysis.run.status, creditsCharged: analysis.creditsCharged }));
} finally {
  try {
    const profile = await request(`${supabaseUrl}/rest/v1/profiles?select=id,auth_user_id&email=eq.${encodeURIComponent(email)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    profileId = profile[0]?.id || profileId;
    authUserId = profile[0]?.auth_user_id || authUserId;
    if (profileId) {
      await adminDelete("face_analysis_runs", `user_id=eq.${profileId}`);
      await adminDelete("usage_logs", `user_id=eq.${profileId}`);
      await adminDelete("credit_transactions", `user_id=eq.${profileId}`);
      await adminDelete("member_entitlements", `user_id=eq.${profileId}`);
      await adminDelete("profiles", `id=eq.${profileId}`);
    }
    if (authUserId) {
      await request(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
        method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
    }
  } catch (cleanupError) {
    console.error(`Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    process.exitCode = 1;
  }
}

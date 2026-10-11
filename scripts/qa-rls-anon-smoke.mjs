#!/usr/bin/env node
// Read-only RLS smoke: compare one service-role-visible row with an anonymous read.
// Usage: node --env-file=.env.local scripts/qa-rls-anon-smoke.mjs
// Prints only table names and outcomes; never prints keys, IDs, or row contents.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase test environment variables");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tables = [
  ["profiles", "id"],
  ["orders", "id"],
  ["payments", "id"],
  ["member_entitlements", "id"],
  ["credit_transactions", "id"],
  ["activation_codes", "code"],
  ["usage_logs", "id"],
  ["council_runs", "id"],
  ["face_analysis_runs", "id"],
  ["face_knowledge_cards", "id"],
  ["face_knowledge_revisions", "id"],
  ["site_services", "id"]
];

let failed = 0;
let checked = 0;
for (const [table, key] of tables) {
  const source = await admin.from(table).select(key).limit(1).maybeSingle();
  if (source.error) {
    failed += 1;
    console.log(`ERROR ${table}: service-role sample unavailable (${source.error.code || "unknown"})`);
    continue;
  }
  if (!source.data) {
    console.log(`SKIP ${table}: no sample row`);
    continue;
  }
  checked += 1;
  const result = await anon.from(table).select(key).eq(key, source.data[key]).limit(1);
  const exposed = Boolean(result.data?.length);
  if (exposed) failed += 1;
  console.log(`${exposed ? "FAIL" : "PASS"} ${table}: anonymous sample ${exposed ? "exposed" : "hidden"}`);
}

console.log(`${checked - failed}/${checked} sampled tables hidden from anonymous access; ${tables.length - checked} skipped`);
if (failed) process.exitCode = 1;

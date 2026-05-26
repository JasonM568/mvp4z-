#!/usr/bin/env node
// AI chat E2E 驗證腳本
//
// 驗證 4 情境：
//   1. happy   ：扣 1 點 + usage_logs 寫入 + credit_transactions 寫入
//   2. empty   ：credits=0 → 403
//   3. parallel：並行 N 次 → 不超扣（會有部分被 CR002 race 攔下、reply 仍生成）
//   4. failure ：故意給壞 token → LLM 不會被呼叫、credits 不變
//
// 用法：
//   npm run test:ai-chat-e2e -- --token=<admin_bearer_token>
//   npm run test:ai-chat-e2e -- --token=<token> --base-url=https://www.xunfeng.tw
//   npm run test:ai-chat-e2e -- --token=<token> --only=happy,parallel
//
// 取得 token：admin 登入 /login 後 localStorage.getItem('xunfeng_member_token')

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
loadEnv(args.envFile || path.join(rootDir, ".env.local"));

const baseUrl = (args.baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const token = required(args.token, "--token (admin Bearer token)");
const parallelN = Number(args.parallel || 5);
const only = (args.only || "").split(",").map((s) => s.trim()).filter(Boolean);

const supabase = createClient(
  required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const me = await fetchMe();
console.log(`▶ admin: ${me.email} (profile ${me.id})`);
console.log(`▶ baseUrl: ${baseUrl}`);

const tests = {
  happy: testHappyPath,
  empty: testEmptyCredits,
  parallel: testParallel,
  failure: testInvalidToken
};

const results = {};
for (const [name, fn] of Object.entries(tests)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n────── ${name} ──────`);
  try {
    await fn();
    results[name] = "PASS";
    console.log(`✅ ${name} PASS`);
  } catch (e) {
    results[name] = `FAIL: ${e.message}`;
    console.log(`❌ ${name} FAIL: ${e.message}`);
  }
}

console.log("\n══════ Summary ══════");
for (const [name, status] of Object.entries(results)) {
  console.log(`  ${status === "PASS" ? "✅" : "❌"} ${name.padEnd(10)} ${status}`);
}
const failures = Object.values(results).filter((r) => r !== "PASS");
process.exit(failures.length ? 1 : 0);

// ──────────────────────────────────────────────────────────────────

async function testHappyPath() {
  const before = await snapshot();
  if (before.credits < 1) throw new Error(`需要至少 1 點才能跑 happy path，目前 ${before.credits}`);

  const resp = await postChat("巽風測試訊息（happy）");
  if (!resp.ok) throw new Error(`POST failed: ${JSON.stringify(resp.body)}`);
  if (typeof resp.body.reply !== "string" || !resp.body.reply) throw new Error("沒有 reply 字串");
  if (resp.body.credits_charged !== 1) throw new Error(`credits_charged != 1 (${resp.body.credits_charged})`);
  if (resp.body.credit_warning) throw new Error(`unexpected credit_warning: ${resp.body.credit_warning}`);

  const after = await snapshot();
  if (after.credits !== before.credits - 1) {
    throw new Error(`credits 沒扣 1：${before.credits} → ${after.credits}`);
  }
  if (after.usageLogs !== before.usageLogs + 1) {
    throw new Error(`usage_logs 沒 +1：${before.usageLogs} → ${after.usageLogs}`);
  }
  if (after.creditDebits !== before.creditDebits + 1) {
    throw new Error(`credit_transactions (debit, ai_chat) 沒 +1：${before.creditDebits} → ${after.creditDebits}`);
  }
}

async function testEmptyCredits() {
  const ent = await getActiveEntitlement();
  const original = ent.credits_remaining;
  // 暫時把 credits 設 0
  await supabase.from("member_entitlements").update({ credits_remaining: 0 }).eq("id", ent.id);
  try {
    const resp = await postChat("巽風測試訊息（empty）");
    if (resp.ok) throw new Error("應該回 403 但回了 200");
    if (resp.status !== 403) throw new Error(`期望 403，實際 ${resp.status}`);
    if (!/用完|啟用|到期/.test(resp.body.error || "")) {
      throw new Error(`錯誤訊息不像額度不足：${resp.body.error}`);
    }
  } finally {
    // 還原
    await supabase.from("member_entitlements").update({ credits_remaining: original }).eq("id", ent.id);
  }
}

async function testParallel() {
  const before = await snapshot();
  if (before.credits < parallelN) {
    throw new Error(`需要至少 ${parallelN} 點，目前 ${before.credits}`);
  }
  const promises = Array.from({ length: parallelN }, (_, i) =>
    postChat(`巽風並行測試 #${i + 1}`)
  );
  const responses = await Promise.all(promises);
  const ok = responses.filter((r) => r.ok);
  const charged = ok.reduce((s, r) => s + (r.body.credits_charged || 0), 0);
  const gifted = ok.filter((r) => r.body.credits_charged === 0).length;

  if (ok.length !== parallelN) {
    throw new Error(`${parallelN} 個請求只 ${ok.length} 個成功：${responses.filter((r) => !r.ok).map((r) => r.status).join(",")}`);
  }

  const after = await snapshot();
  const actualDelta = before.credits - after.credits;
  if (actualDelta !== charged) {
    throw new Error(`回報扣點 ${charged} 但實際扣 ${actualDelta} (前 ${before.credits} → 後 ${after.credits})`);
  }
  if (actualDelta > parallelN) {
    throw new Error(`超扣！${parallelN} 個請求扣了 ${actualDelta} 點`);
  }
  console.log(`  ${parallelN} 個並行：${charged} 扣到、${gifted} 因 race 免費送（不算錯誤）`);
}

async function testInvalidToken() {
  const before = await snapshot();
  const resp = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid_token_xxxxxxxxxx"
    },
    body: JSON.stringify({ message: "壞 token 測試" })
  });
  const body = await resp.json().catch(() => ({}));
  if (resp.ok) throw new Error("壞 token 應該失敗但成功了");
  if (resp.status !== 401) throw new Error(`期望 401，實際 ${resp.status}: ${body.error}`);

  const after = await snapshot();
  if (after.credits !== before.credits) {
    throw new Error(`壞 token 不該動 credits，但 ${before.credits} → ${after.credits}`);
  }
  if (after.usageLogs !== before.usageLogs) {
    throw new Error(`壞 token 不該寫 usage_logs，但 +${after.usageLogs - before.usageLogs}`);
  }
}

// ──────────────────────────────────────────────────────────────────

async function postChat(message) {
  const resp = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ message })
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, body };
}

async function fetchMe() {
  const resp = await fetch(`${baseUrl}/api/member/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`/api/member/me failed ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  if (!data?.member?.id) throw new Error("no member in response");
  return data.member;
}

async function getActiveEntitlement() {
  const { data, error } = await supabase
    .from("member_entitlements")
    .select("id, credits_remaining, status, expires_at")
    .eq("user_id", me.id)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("找不到 active entitlement");
  return data;
}

async function snapshot() {
  const ent = await getActiveEntitlement();
  const [{ count: usageLogs }, { count: creditDebits }] = await Promise.all([
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.id)
      .eq("type", "chat"),
    supabase
      .from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.id)
      .eq("type", "debit")
      .eq("source", "ai_chat")
  ]);
  return {
    credits: ent.credits_remaining,
    usageLogs: usageLogs || 0,
    creditDebits: creditDebits || 0
  };
}

// ──────────────────────────────────────────────────────────────────

function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!v.startsWith("--")) continue;
    const eq = v.indexOf("=");
    if (eq > -1) {
      const key = v.slice(2, eq).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      out[key] = v.slice(eq + 1);
    } else {
      const key = v.slice(2).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      out[key] = values[++i];
    }
  }
  return out;
}

function loadEnv(file) {
  if (!file || !fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function required(value, label) {
  if (!value) throw new Error(`Missing: ${label}`);
  return value;
}

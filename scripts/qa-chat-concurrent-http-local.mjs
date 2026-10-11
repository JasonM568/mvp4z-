#!/usr/bin/env node
// B1 full HTTP race with a loopback fake Responses API; no paid model calls.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(0, at).replace(/^--/, ""), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
const mockPort = Number(args["mock-port"] || 3291);
const rounds = Number(args.rounds || 3);
const n = Number(args.n || 10);
if (!args["env-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")
  || !Number.isInteger(mockPort) || mockPort < 1024 || mockPort > 65535
  || !Number.isInteger(rounds) || rounds < 1 || rounds > 10
  || !Number.isInteger(n) || n < 2 || n > 30) throw new Error("Provide local --base-url, --env-file, --mock-port, --rounds and --n");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signer = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
let modelCalls = 0;
const mock = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/responses"
    || request.headers.authorization !== "Bearer qa-fake-only") {
    response.writeHead(404).end(JSON.stringify({ error: { message: "QA mock route rejected" } }));
    return;
  }
  for await (const _chunk of request) { /* Consume request without logging prompts. */ }
  modelCalls++;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const body = { id: `resp_qa_${crypto.randomBytes(5).toString("hex")}`, object: "response",
    created_at: Math.floor(Date.now() / 1000), status: "completed", model: "qa-fake-model",
    output: [{ type: "message", id: `msg_qa_${crypto.randomBytes(5).toString("hex")}`,
      status: "completed", role: "assistant", content: [{ type: "output_text", text: "測試回覆", annotations: [] }] }],
    usage: { input_tokens: 7, output_tokens: 4, total_tokens: 11 } };
  response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
});
await new Promise((resolve, reject) => {
  mock.once("error", reject);
  mock.listen(mockPort, "127.0.0.1", resolve);
});
function assert(ok, message) { if (!ok) throw new Error(message); }
async function rest(path, method = "GET", body) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local REST ${method} ${path.split("?")[0]} HTTP ${response.status}`);
  return response.json().catch(() => []);
}
async function chat(token) {
  const response = await fetch(`${baseUrl}/api/ai/chat`, { method: "POST",
    signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}`,
      "Content-Type": "application/json" }, body: JSON.stringify({ message: "QA concurrent fake model" }) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
let completed = 0;
try {
  for (let round = 1; round <= rounds; round++) {
    const tag = crypto.randomBytes(6).toString("hex");
    const email = `qa-b1-http-${tag}@example.test`;
    const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
    let authId, profileId, entitlementId;
    try {
      const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error || !made.data.user) throw new Error("QA Auth creation failed");
      authId = made.data.user.id;
      const [profile] = await rest("profiles", "POST", [{ auth_user_id: authId, email,
        name: "QA B1 HTTP", role: "member" }]);
      profileId = profile.id;
      const [ent] = await rest("member_entitlements", "POST", [{ user_id: profileId,
        status: "active", credits_remaining: 3, expires_at: new Date(Date.now() + 86_400_000).toISOString()
      }]);
      entitlementId = ent.id;
      const login = await signer.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session?.access_token) throw new Error("QA member login failed");
      const token = login.data.session.access_token;
      const preflight = await fetch(`${baseUrl}/api/member/me`, { signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${token}` } });
      if (preflight.status !== 200) throw new Error(`QA Auth preflight HTTP ${preflight.status}; round void`);
      const beforeModel = modelCalls;
      const raced = await Promise.all(Array.from({ length: n }, () => chat(token)));
      const wins = raced.filter((item) => item.status === 200 && item.body?.ok === true);
      const busy = raced.filter((item) => item.status === 409 && item.body?.code === "CHAT_IN_PROGRESS");
      const [after] = await rest(`member_entitlements?select=credits_remaining&id=eq.${entitlementId}`);
      const usage = await rest(`usage_logs?select=id,reply&user_id=eq.${profileId}&type=eq.chat`);
      const ledger = await rest(`credit_transactions?select=amount,balance_after,ref_id&user_id=eq.${profileId}&source=eq.ai_chat`);
      const slots = await rest(`chat_inflight?select=user_id&user_id=eq.${profileId}`);
      assert(wins.length === 1 && busy.length === n - 1 && modelCalls - beforeModel === 1
        && wins[0].body.reply === "測試回覆" && wins[0].body.credits_charged === 1
        && after.credits_remaining === 2 && usage.length === 1 && usage[0].reply === "測試回覆"
        && ledger.length === 1 && ledger[0].amount === -1 && ledger[0].balance_after === 2
        && ledger[0].ref_id === usage[0].id && slots.length === 0,
      `round ${round}: statuses=${raced.map((item) => item.status).join(",")}, 200=${wins.length}, 409=${busy.length}, mock=${modelCalls - beforeModel}, balance=${after?.credits_remaining}, usage=${usage.length}, ledger=${ledger.length}, slots=${slots.length}`);
      const next = await chat(token);
      const [afterNext] = await rest(`member_entitlements?select=credits_remaining&id=eq.${entitlementId}`);
      const usageNext = await rest(`usage_logs?select=id&user_id=eq.${profileId}&type=eq.chat`);
      const ledgerNext = await rest(`credit_transactions?select=id&user_id=eq.${profileId}&source=eq.ai_chat`);
      assert(next.status === 200 && next.body?.credits_charged === 1
        && afterNext.credits_remaining === 1 && usageNext.length === 2 && ledgerNext.length === 2,
      `round ${round}: sequential retry HTTP ${next.status}, balance ${afterNext?.credits_remaining}`);
      completed++;
      console.log(`PASS B1 HTTP round ${round}/${rounds}: N=${n}, one answer/charge/model call, retry settles`);
    } finally {
      if (profileId) {
        await rest(`chat_inflight?user_id=eq.${profileId}`, "DELETE");
        await rest(`credit_transactions?user_id=eq.${profileId}`, "DELETE");
        await rest(`usage_logs?user_id=eq.${profileId}`, "DELETE");
        await rest(`member_entitlements?user_id=eq.${profileId}`, "DELETE");
        await rest(`profiles?id=eq.${profileId}`, "DELETE");
      }
      if (authId) {
        const deleted = await service.auth.admin.deleteUser(authId);
        if (deleted.error) throw new Error("QA Auth cleanup failed");
      }
      if (profileId && (await rest(`profiles?select=id&id=eq.${profileId}`)).length)
        throw new Error("QA B1 HTTP profile remains");
    }
  }
} finally {
  await new Promise((resolve) => mock.close(resolve));
}
console.log(`${completed}/${rounds} B1 full HTTP fake-model rounds passed; fixtures cleaned`);

#!/usr/bin/env node
// B1 isolated PostgREST N-way lease competition and stale-owner release.
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const rounds = Number(args.rounds || 5);
const n = Number(args.n || 10);
if (!args["env-file"] || !Number.isInteger(rounds) || rounds < 1 || rounds > 30
  || !Number.isInteger(n) || n < 2 || n > 50) throw new Error("Provide --env-file, --rounds=1..30, --n=2..50");
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(env.REST_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
async function request(path, method = "GET", body, key = env.SERVICE_ROLE_KEY) {
  const response = await fetch(`${env.REST_URL}/${path}`, { method, signal: AbortSignal.timeout(30_000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
function assert(ok, message) { if (!ok) throw new Error(message); }
async function acquire(userId) {
  return request("rpc/acquire_chat_slot", "POST", { p_user_id: userId, p_ttl_seconds: 330 });
}
async function release(userId, token) {
  return request("rpc/release_chat_slot", "POST", { p_user_id: userId, p_lock_token: token });
}
let completed = 0;
for (let round = 1; round <= rounds; round++) {
  const email = `qa-b1-slot-${crypto.randomBytes(6).toString("hex")}@example.test`;
  let userId;
  try {
    const created = await request("profiles", "POST", [{ email, role: "member" }]);
    assert(created.status === 201 && created.data?.length === 1, "QA profile fixture failed");
    userId = created.data[0].id;
    const anon = await request("rpc/acquire_chat_slot", "POST",
      { p_user_id: userId, p_ttl_seconds: 330 }, env.ANON_KEY);
    assert([401, 403].includes(anon.status), `anonymous acquired slot: HTTP ${anon.status}`);
    const first = await Promise.all(Array.from({ length: n }, () => acquire(userId)));
    assert(first.every((item) => item.status === 200),
      `round ${round} acquire HTTP statuses ${first.map((item) => item.status).join(",")}`);
    const winners = first.filter((item) => typeof item.data === "string" && item.data.length > 0);
    assert(winners.length === 1 && first.filter((item) => item.data === null).length === n - 1,
      `round ${round} first race winners ${winners.length}`);
    const oldToken = winners[0].data;
    const [held] = (await request(`chat_inflight?select=lock_token&user_id=eq.${userId}`)).data || [];
    assert(held?.lock_token === oldToken, `round ${round} lock row disagrees`);
    const expired = await request(`chat_inflight?user_id=eq.${userId}`, "PATCH",
      { expires_at: new Date(Date.now() - 1000).toISOString() });
    assert(expired.status === 200 && expired.data?.length === 1, `round ${round} expiry setup failed`);
    const second = await Promise.all(Array.from({ length: n }, () => acquire(userId)));
    assert(second.every((item) => item.status === 200), `round ${round} reclaim HTTP error`);
    const reclaimed = second.filter((item) => typeof item.data === "string" && item.data.length > 0);
    assert(reclaimed.length === 1 && reclaimed[0].data !== oldToken
      && second.filter((item) => item.data === null).length === n - 1,
    `round ${round} reclaim winners ${reclaimed.length}`);
    const stale = await release(userId, oldToken);
    const current = await release(userId, reclaimed[0].data);
    assert(stale.status === 200 && stale.data === false
      && current.status === 200 && current.data === true,
    `round ${round} stale/current release ${stale.status}/${current.status}`);
    const remaining = await request(`chat_inflight?select=user_id&user_id=eq.${userId}`);
    assert(remaining.status === 200 && remaining.data.length === 0, `round ${round} lock remains`);
    completed++;
    console.log(`PASS B1 round ${round}/${rounds}: N=${n}, one acquire, one reclaim, stale release denied`);
  } finally {
    if (userId) {
      await request(`chat_inflight?user_id=eq.${userId}`, "DELETE");
      await request(`profiles?id=eq.${userId}`, "DELETE");
      const remaining = await request(`profiles?select=id&id=eq.${userId}`);
      if (remaining.data?.length) throw new Error("QA B1 profile fixture remains");
    }
  }
}
console.log(`${completed}/${rounds} B1 lease competition rounds passed; fixtures cleaned`);

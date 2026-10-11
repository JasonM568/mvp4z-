#!/usr/bin/env node
// Verify the payment audit RPC and table reject non-service roles on a local-only stack.
// Usage: node scripts/qa-ecpay-rpc-authz-local.mjs --env-file=/private/connection.private.env

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const arg = process.argv.find((item) => item.startsWith("--env-file="));
if (!arg) throw new Error("Provide --env-file");
const env = Object.fromEntries((await readFile(arg.slice(11), "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=.*/.test(line)).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
const restUrl = env.REST_URL?.replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/rest\/v1$/.test(restUrl || "")
    || !env.ANON_KEY || !env.SERVICE_ROLE_KEY || !env.JWT_SECRET) {
  throw new Error("Expected local REST, anon/service keys and JWT secret");
}

const memberToken = signMemberJwt(crypto.randomUUID());
const body = {
  p_order_id: crypto.randomUUID(), p_provider_trade_no: `QA-${crypto.randomUUID()}`,
  p_merchant_trade_no: `QA-${crypto.randomUUID()}`, p_amount: 980,
  p_status: "paid", p_amount_matches: true, p_check_mac_valid: true,
  p_raw_payload: { qa: true }
};
let passed = 0;
const serviceRead = await call("payment_notification_events?select=id&limit=1", env.SERVICE_ROLE_KEY, "GET");
if (serviceRead.status !== 200) throw new Error(`Payment audit table unavailable to service role: ${serviceRead.status} ${serviceRead.code}`);
const serviceRpc = await call("rpc/record_ecpay_payment_notification", env.SERVICE_ROLE_KEY,
  "POST", { ...body, p_check_mac_valid: false });
if (serviceRpc.status !== 400) throw new Error(`Payment RPC unavailable to service role: ${serviceRpc.status} ${serviceRpc.code}`);
console.log("PASS service role can see table/RPC; invalid MAC rejected before write"); passed++;
for (const [role, token] of [["anon", env.ANON_KEY], ["authenticated", memberToken]]) {
  const rpc = await call("rpc/record_ecpay_payment_notification", token, "POST", body);
  if (![401, 403, 404].includes(rpc.status)) {
    throw new Error(`${role} invoked payment RPC: HTTP ${rpc.status}`);
  }
  console.log(`PASS ${role} RPC denied: HTTP ${rpc.status}`); passed++;

  const read = await call("payment_notification_events?select=id&limit=1", token, "GET");
  if (![401, 403, 404].includes(read.status)) {
    throw new Error(`${role} read payment audit table: HTTP ${read.status}`);
  }
  console.log(`PASS ${role} payment audit read denied: HTTP ${read.status}`); passed++;
}
console.log(`${passed}/${passed} isolated payment RPC/table authz checks passed`);

async function call(path, token, method, body) {
  const response = await fetch(`${restUrl}/${path}`, { method, headers: {
    apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  return { status: response.status, code: result?.code || "" };
}

function signMemberJwt(userId) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const content = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: userId, role: "authenticated", aud: "authenticated", iat: now, exp: now + 600
  })}`;
  return `${content}.${crypto.createHmac("sha256", env.JWT_SECRET).update(content).digest("base64url")}`;
}

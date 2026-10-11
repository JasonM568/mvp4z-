#!/usr/bin/env node
// Local isolated Supabase only. Usage:
// node scripts/qa-rls-member-isolation.mjs --env-file=/private/connection.private.env --members-file=/private/qa-members.private.json

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
if (!args["env-file"] || !args["members-file"]) throw new Error("Provide --env-file and --members-file");

const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=.*/.test(line))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
  }));
const members = JSON.parse(await readFile(args["members-file"], "utf8")).members;
if (members.length !== 2 || !env.REST_URL || !env.ANON_KEY || !env.JWT_SECRET) {
  throw new Error("Expected two QA members and local Supabase REST/JWT settings");
}
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(env.REST_URL)) {
  throw new Error("Refusing to run against non-local Supabase");
}

let passed = 0;
for (const [index, own] of members.entries()) {
  const other = members[1 - index];
  for (const [table, column] of [["profiles", "id"], ["member_entitlements", "user_id"], ["credit_transactions", "user_id"]]) {
    const ownRows = await rows(table, column, own.profile_id, own.access_token);
    const otherRows = await rows(table, column, other.profile_id, own.access_token);
    if (table === "profiles" && ownRows.length !== 1) throw new Error(`Member ${index + 1} cannot read own profile`);
    if (otherRows.length !== 0) throw new Error(`Member ${index + 1} can read other member's ${table}`);
    console.log(`PASS member ${index + 1}: own ${table}=${ownRows.length}, other=0`);
    passed++;
  }
}

const expiredToken = signExpiredJwt(members[0].auth_user_id);
const expiredResponse = await fetch(`${env.REST_URL}/profiles?select=id&limit=1`, {
  headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${expiredToken}` }
});
if (expiredResponse.status !== 401) throw new Error(`Expired JWT returned ${expiredResponse.status}, expected 401`);
console.log("PASS expired member JWT: 401");
passed++;
console.log(`${passed}/${passed} isolated member RLS/expiry checks passed`);

async function rows(table, column, value, token) {
  const query = new URLSearchParams({ select: "id", [column]: `eq.${value}` });
  const response = await fetch(`${env.REST_URL}/${table}?${query}`, {
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`${table} read failed: ${response.status}`);
  return response.json();
}

function signExpiredJwt(userId) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, role: "authenticated", aud: "authenticated", iat: now - 7200, exp: now - 3600 })}`;
  const signature = crypto.createHmac("sha256", env.JWT_SECRET).update(input).digest("base64url");
  return `${input}.${signature}`;
}

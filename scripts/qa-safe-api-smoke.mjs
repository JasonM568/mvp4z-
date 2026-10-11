#!/usr/bin/env node
// Safe, repeatable API smoke: every POST is rejected before DB or provider writes.
// Usage: node scripts/qa-safe-api-smoke.mjs --base-url=http://localhost:3100

const arg = process.argv.find((value) => value.startsWith("--base-url="));
const baseUrl = (arg?.slice("--base-url=".length) || "http://localhost:3000").replace(/\/$/, "");
const cases = [
  { method: "GET", path: "/", status: 200, contains: "<!DOCTYPE html>" },
  { method: "GET", path: "/about", status: 200, contains: "<!DOCTYPE html>" },
  { method: "GET", path: "/courses", status: 200, contains: "<!DOCTYPE html>" },
  { method: "GET", path: "/member-pricing", status: 200, contains: "<!DOCTYPE html>" },
  { method: "GET", path: "/api/plans", status: 200, contains: '"plans"' },
  { method: "GET", path: "/api/member/me", status: 401 },
  { method: "GET", path: "/api/member/me", status: 401, headers: { authorization: "Bearer qa-expired-token" } },
  { method: "GET", path: "/api/member/orders", status: 401 },
  { method: "GET", path: "/api/admin/orders", status: 401 },
  { method: "GET", path: "/api/admin/orders", status: 401, headers: { authorization: "Bearer qa-expired-token" } },
  { method: "GET", path: "/api/admin/qimen-review", status: 401 },
  { method: "GET", path: "/api/referral/lookup?code=%27%20OR%201%3D1--", status: 200, contains: '"ok":false' },
  { method: "POST", path: "/api/orders/create", status: 401, json: {} },
  { method: "POST", path: "/api/ai/chat", status: 401, json: {} },
  { method: "POST", path: "/api/ai/council", status: 401, json: {} },
  { method: "POST", path: "/api/bookings", status: 400, json: {} },
  { method: "POST", path: "/api/bookings", status: 400, json: { name: "QA", email: "qa@example.com", message: "x".repeat(4001) } },
  { method: "POST", path: "/api/courses/checkout", status: 400, json: {} },
  { method: "POST", path: "/api/auth/register", status: 400, json: {} },
  { method: "POST", path: "/api/auth/login", status: 400, json: { email: "' OR 1=1--", password: "x" } },
  {
    method: "POST",
    path: "/api/payments/ecpay/notify",
    status: 400,
    form: { MerchantTradeNo: "QA_INVALID", RtnCode: "1", CheckMacValue: "BAD" },
    contains: "CheckMacValue invalid"
  }
];

let failed = 0;
for (const item of cases) {
  const headers = { ...(item.headers || {}) };
  let body;
  if (item.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(item.json);
  } else if (item.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(item.form);
  }
  try {
    const response = await fetch(baseUrl + item.path, { method: item.method, headers, body, redirect: "manual" });
    const result = await response.text();
    const ok = response.status === item.status && (!item.contains || result.includes(item.contains));
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} ${item.method} ${item.path}: ${response.status} (expected ${item.status})`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.method} ${item.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`${cases.length - failed}/${cases.length} safe API checks passed`);
if (failed) process.exitCode = 1;

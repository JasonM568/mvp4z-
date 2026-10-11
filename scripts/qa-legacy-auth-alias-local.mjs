// Read-only rejection smoke for the five legacy Worker-compatible aliases.
const baseUrl = process.argv[2] || "http://127.0.0.1:3104";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Use a localhost API only");
}

const cases = [
  ["POST", "/api/login", "/api/auth/login", "{}", 400],
  ["POST", "/api/logout", "/api/auth/logout", "{}", 200],
  ["GET", "/api/me", "/api/member/me", undefined, 401],
  ["POST", "/api/register", "/api/auth/register", "{}", 400],
  ["POST", "/api/redeem", "/api/member/redeem", "{}", 401]
];

async function request(method, path, body) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body,
    redirect: "manual"
  });
  return { status: response.status, contentType: response.headers.get("content-type")?.split(";")[0] };
}

let passed = 0;
for (const [method, alias, canonical, body, expected] of cases) {
  const [legacy, current] = await Promise.all([
    request(method, alias, body), request(method, canonical, body)
  ]);
  const ok = legacy.status === expected && legacy.status === current.status &&
    legacy.contentType === current.contentType;
  if (ok) passed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${alias} ${JSON.stringify({ legacy, current, expected })}`);
}
console.log(`${passed}/${cases.length} legacy alias rejection checks passed`);
if (passed !== cases.length) process.exitCode = 1;

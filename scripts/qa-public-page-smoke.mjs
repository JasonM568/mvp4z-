#!/usr/bin/env node
// Read-only SSR smoke for public customer pages. No forms or mutations are submitted.
// Usage: node scripts/qa-public-page-smoke.mjs --base-url=https://www.xunfeng.tw

const arg = process.argv.find((value) => value.startsWith("--base-url="));
if (!arg) {
  console.error("Usage: node scripts/qa-public-page-smoke.mjs --base-url=<origin>");
  process.exit(2);
}

const baseUrl = new URL(arg.slice("--base-url=".length));
if (!["http:", "https:"].includes(baseUrl.protocol)) {
  console.error("base URL must use http or https");
  process.exit(2);
}

const routes = [
  "/", "/about", "/services", "/cases", "/courses", "/booking",
  "/member-pricing", "/privacy", "/thanks"
];
const results = [];

for (const route of routes) {
  const url = new URL(route, baseUrl);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const html = await response.text();
    const finalPath = new URL(response.url).pathname;
    const visibleHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
    const title = stripTags(visibleHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const h1 = stripTags(visibleHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
    const hasMain = /<main\b/i.test(visibleHtml);
    const appError = /Application error|Internal Server Error/i.test(stripTags(visibleHtml));
    const expectedPath = route === "/" ? "/" : route.replace(/\/$/, "");
    const actualPath = finalPath === "/" ? "/" : finalPath.replace(/\/$/, "");
    const passed = response.ok && actualPath === expectedPath && Boolean(title) && Boolean(h1) && hasMain && !appError;
    results.push({ route, status: response.status, finalPath, title, h1, hasMain, appError, passed });
  } catch (error) {
    results.push({ route, error: String(error).slice(0, 180), passed: false });
  }
}

const passed = results.filter((item) => item.passed).length;
console.log(JSON.stringify({ base: baseUrl.origin, passed, total: routes.length, results }, null, 2));
if (passed !== routes.length) process.exitCode = 1;

function stripTags(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ").trim();
}

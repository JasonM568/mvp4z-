// Run with: ego-browser nodejs < scripts/qa-public-pages-ego.mjs
// Reuse this goal's existing QA task space; change the name only for a new goal.
const taskName = "xunfeng-official-v2 full-system QA";
const baseUrl = "http://127.0.0.1:3104";
const spaces = await listTaskSpaces();
const existing = spaces.find((space) => space.name === taskName && space.ownership === "agent");
if (!existing) throw new Error(`Existing Ego Lite task space not found: ${taskName}`);
const task = await taskSpace(existing.id);
const page = task.page("p1");
const routes = [
  "/", "/about", "/booking", "/cases", "/courses", "/enterprise",
  "/privacy", "/services", "/thanks", "/member-pricing", "/login", "/reset-password"
];
let passed = 0;
for (const path of routes) {
  try {
    await page.goto(baseUrl + path);
    await page.waitForFunction(() => document.readyState === "complete", undefined, { timeout: 8_000 });
    // Wait for the reset page's client effect so an HTTP 200 cannot hide a hydration crash.
    if (path === "/reset-password") await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      heading: Boolean(document.querySelector("h1")),
      main: Boolean(document.querySelector("main")),
      error: /Application error|Internal Server Error|This page could not be found/i.test(document.body.innerText),
      bodyLength: document.body.innerText.trim().length
    }));
    const ok = state.heading && state.main && !state.error && state.bodyLength > 100;
    if (ok) passed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} ${path} ${JSON.stringify(state)}`);
  } catch (error) {
    console.log(`FAIL ${path} ${String(error).slice(0, 180)}`);
  }
}
console.log(`${passed}/${routes.length} public page render checks passed`);
if (passed !== routes.length) process.exitCode = 1;

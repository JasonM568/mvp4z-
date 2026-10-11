// Run in Ego Lite after signing in a disposable admin: ego-browser nodejs < scripts/qa-admin-pages-ego.mjs
const taskName = "xunfeng-official-v2 full-system QA";
const baseUrl = "http://127.0.0.1:3104";
const space = (await listTaskSpaces()).find((item) => item.name === taskName && item.ownership === "agent");
if (!space) throw new Error(`Existing Ego Lite task space not found: ${taskName}`);
const page = (await taskSpace(space.id)).page("p1");
const routes = [
  "/admin", "/admin/bookings", "/admin/council-runs", "/admin/course-launch",
  "/admin/course-registrations", "/admin/documents", "/admin/face-analysis",
  "/admin/face-knowledge", "/admin/face-provider", "/admin/face-rules",
  "/admin/face-teachings", "/admin/gemini-provider", "/admin/invoices",
  "/admin/members", "/admin/orders", "/admin/prompt-settings",
  "/admin/provider-health", "/admin/qimen-review", "/admin/referrals",
  "/admin/school-settings", "/admin/site-cases", "/admin/site-services",
  "/admin/token-usage"
];
let passed = 0;
for (const path of routes) {
  try {
    await page.goto(baseUrl + path);
    await page.waitForFunction(() =>
      document.body.innerText.includes("巽風後台") ||
      /Application error|Internal Server Error|This page could not be found/i.test(document.body.innerText),
    undefined, { timeout: 8_000 });
    const actualUrl = await page.url();
    const state = await page.evaluate(() => ({
      adminShell: document.body.innerText.includes("巽風後台"),
      error: /Application error|Internal Server Error|This page could not be found/i.test(document.body.innerText),
      visibleText: document.body.innerText.trim().length
    }));
    const ok = actualUrl === baseUrl + path && state.adminShell && !state.error && state.visibleText > 150;
    if (ok) passed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} ${path} ${JSON.stringify({ actualUrl, ...state })}`);
  } catch (error) {
    console.log(`FAIL ${path} ${String(error).slice(0, 180)}`);
  }
}
console.log(`${passed}/${routes.length} admin shell navigation checks passed`);
if (passed !== routes.length) process.exitCode = 1;

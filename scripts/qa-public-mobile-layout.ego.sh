#!/bin/zsh
set -euo pipefail

# Public, read-only responsive smoke test using the Ego Lite browser runtime.
# Reuse the QA TaskSpace for this goal (ID 86).

ego-browser nodejs <<'EGO'
const task = await taskSpace(86);
const page = task.page("p1");
const routes = [
  "/", "/about", "/services", "/cases", "/courses",
  "/booking", "/enterprise", "/member-pricing", "/privacy", "/thanks"
];
const results = [];
const navMenu = { services: false, casesCourses: false };

for (const width of [390, 320]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width, height: 844, deviceScaleFactor: 1, mobile: true
  });
  for (const path of routes) {
    await page.goto(`https://www.xunfeng.tw${path}`);
    await page.waitForLoadState();
    const metrics = await page.evaluate(() => ({
      title: document.title,
      hasMain: Boolean(document.querySelector("main")),
      hasH1: Boolean(document.querySelector("h1")),
      viewport: innerWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      overflow: document.body.scrollWidth > document.body.clientWidth ||
        document.documentElement.scrollWidth > innerWidth
    }));
    results.push({ width, path, ...metrics });
  }
}

await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 1, mobile: true
});
await page.goto("https://www.xunfeng.tw/");
await page.waitForLoadState();
const menuButton = await page.evaluate(() =>
  document.querySelector('button[aria-label="開啟主選單"]') !== null
);
if (menuButton) {
  await page.click('button[aria-label="開啟主選單"]', { label: "open mobile menu" });
  await page.click("text=老師服務", { label: "expand service submenu" });
  navMenu.services = await page.evaluate(() =>
    ["/services", "/enterprise", "/booking", "/about"].every((href) =>
      [...document.querySelectorAll("a[href]")].some((anchor) => anchor.getAttribute("href") === href)
    )
  );
  await page.click("text=案例與課程", { label: "expand case and course submenu" });
  navMenu.casesCourses = await page.evaluate(() =>
    ["/cases", "/courses"].every((href) =>
      [...document.querySelectorAll("a[href]")].some((anchor) => anchor.getAttribute("href") === href)
    )
  );
}

await page.goto("https://www.xunfeng.tw/");
const failed = results.filter((item) => !item.hasMain || !item.hasH1 || item.overflow);
console.log(JSON.stringify({
  spaceId: task.spaceId,
  routeCount: routes.length,
  viewportWidths: [390, 320],
  passed: results.length - failed.length,
  failed,
  mobileMenus: {
    services: navMenu.services ? "pass" : "fail",
    casesCourses: navMenu.casesCourses ? "pass" : "fail"
  },
  results
}, null, 2));
if (failed.length || !navMenu.services || !navMenu.casesCourses) process.exitCode = 1;
EGO

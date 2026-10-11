#!/usr/bin/env node
// Local-only Ego Lite recovery E2E. Reuses the QA goal's existing TaskSpace.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("="); return [arg.slice(2, at), arg.slice(at + 1)];
}));
const baseUrl = args["base-url"]?.replace(/\/$/, "");
const spaceId = Number(args["space-id"]);
if (!args["env-file"] || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl || "")
  || !Number.isSafeInteger(spaceId) || spaceId < 1) {
  throw new Error("Provide local --base-url, --env-file and existing --space-id");
}
const env = Object.fromEntries((await readFile(args["env-file"], "utf8"))
  .split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
  }));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.API_URL || "")
  || !env.SERVICE_ROLE_KEY || !env.ANON_KEY) throw new Error("Refusing non-local Supabase");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `qa-reset-e2e-${crypto.randomBytes(6).toString("hex")}@example.test`;
const oldPassword = `QA-Old-${crypto.randomBytes(10).toString("hex")}`;
const newPassword = `QA-New-${crypto.randomBytes(10).toString("hex")}`;
let authId;
try {
  const made = await service.auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
  if (made.error || !made.data.user) throw new Error("Cannot create local recovery fixture");
  authId = made.data.user.id;
  const link = await service.auth.admin.generateLink({ type: "recovery", email,
    options: { redirectTo: `${baseUrl}/reset-password` } });
  if (link.error || !link.data?.properties?.action_link) throw new Error("Cannot generate local recovery link");

  const browserScript = `
    const task = await taskSpace(${spaceId});
    const page = task.page("p1");
    const result = {};
    try {
      await page.goto(${JSON.stringify(`${baseUrl}/login`)});
      await page.goto(${JSON.stringify(link.data.properties.action_link)});
      await page.waitForFunction(() => ["設定新密碼", "重設連結無效"].includes(document.querySelector("article h2")?.textContent), undefined, {timeout:15000});
      result.validLinkReady = await page.evaluate(() => document.querySelector("article h2")?.textContent === "設定新密碼");
      result.validLinkHashCleared = await page.evaluate(() => location.hash === "");
      if (!result.validLinkReady) throw Error("valid link did not show form");
      await page.fill("label:nth-of-type(1) input[type=password]", "short");
      await page.fill("label:nth-of-type(2) input[type=password]", "short");
      await page.click("button.btn.primary", {label:"Check short QA password"});
      result.shortRejected = await page.evaluate(() => document.querySelector("article .status")?.textContent?.includes("至少 8 碼") === true);
      await page.fill("label:nth-of-type(1) input[type=password]", ${JSON.stringify(newPassword)});
      await page.fill("label:nth-of-type(2) input[type=password]", ${JSON.stringify(oldPassword)});
      await page.click("button.btn.primary", {label:"Check mismatched QA password"});
      result.mismatchRejected = await page.evaluate(() => document.querySelector("article .status")?.textContent?.includes("不一致") === true);
      await page.fill("label:nth-of-type(2) input[type=password]", ${JSON.stringify(newPassword)});
      await page.click("button.btn.primary", {label:"Submit QA recovery password"});
      await page.waitForFunction(() => document.querySelector("article h2")?.textContent === "密碼已更新" || document.querySelector("article .status.error"), undefined, {timeout:15000});
      result.passwordUpdated = await page.evaluate(() => document.querySelector("article h2")?.textContent === "密碼已更新");
      await page.goto(${JSON.stringify(`${baseUrl}/login`)});
      await page.goto(${JSON.stringify(`${baseUrl}/reset-password`)});
      await page.waitForFunction(() => document.querySelector("article h2")?.textContent === "重設連結無效", undefined, {timeout:10000});
      result.noLinkRejected = await page.evaluate(() => document.querySelector("article .status")?.textContent?.includes("找不到有效") === true);
      await page.goto(${JSON.stringify(`${baseUrl}/login`)});
      await page.goto(${JSON.stringify(link.data.properties.action_link)});
      await page.waitForFunction(() => document.querySelector("article h2")?.textContent === "重設連結無效", undefined, {timeout:15000});
      result.usedLinkRejected = await page.evaluate(() => document.querySelector("article .status")?.textContent?.includes("無效或已過期") === true);
      await page.goto(${JSON.stringify(`${baseUrl}/login`)});
      await page.goto(${JSON.stringify(`${baseUrl}/reset-password#access_token=invalid&refresh_token=invalid&type=recovery`)});
      await page.waitForFunction(() => document.querySelector("article h2")?.textContent === "重設連結無效", undefined, {timeout:15000});
      result.invalidTokenRejected = await page.evaluate(() => document.querySelector("article .status")?.textContent?.includes("無效或已過期") === true);
      result.invalidHashCleared = await page.evaluate(() => location.hash === "");
      console.log("QA_EGO_RESULT " + JSON.stringify(result));
    } catch (_) {
      console.log("QA_EGO_ERROR browser recovery flow failed");
    } finally {
      try {
        await page.cdp("Storage.clearDataForOrigin", {origin:${JSON.stringify(baseUrl)}, storageTypes:"all"});
        await page.goto(${JSON.stringify(`${baseUrl}/login`)});
      } catch (_) { console.log("QA_EGO_CLEANUP_ERROR local browser origin cleanup failed"); }
    }
  `;
  const browser = spawnSync("ego-browser", ["nodejs"], { input: browserScript,
    encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 90_000 });
  const egoOutput = `${browser.stdout || ""}\n${browser.stderr || ""}`;
  const resultLine = egoOutput.split(/\r?\n/).find((line) => line.includes("QA_EGO_RESULT "));
  if (browser.status !== 0 || !resultLine || egoOutput.includes("QA_EGO_CLEANUP_ERROR")) {
    console.error("Ego diagnostic", { status: browser.status, signal: browser.signal,
      errorCode: browser.error?.code || null,
      stdoutLength: browser.stdout?.length || 0, stderrLength: browser.stderr?.length || 0,
      hasResult: egoOutput.includes("QA_EGO_RESULT"), hasError: egoOutput.includes("QA_EGO_ERROR"),
      hasCleanupError: egoOutput.includes("QA_EGO_CLEANUP_ERROR") });
    throw new Error("Ego Lite recovery E2E failed or local browser cleanup failed");
  }
  const browserResult = JSON.parse(resultLine.slice(resultLine.indexOf("QA_EGO_RESULT ") + "QA_EGO_RESULT ".length));
  for (const [label, value] of Object.entries(browserResult)) {
    console.log(`${value ? "PASS" : "FAIL"} ${label}`);
  }
  const oldClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const newClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const oldLogin = await oldClient.auth.signInWithPassword({ email, password: oldPassword });
  const newLogin = await newClient.auth.signInWithPassword({ email, password: newPassword });
  const oldRejected = Boolean(oldLogin.error);
  const newAccepted = Boolean(!newLogin.error && newLogin.data.session);
  console.log(`${oldRejected ? "PASS" : "FAIL"} old password rejected`);
  console.log(`${newAccepted ? "PASS" : "FAIL"} new password accepted`);
  const count = Object.keys(browserResult).length + 2;
  const passed = Object.values(browserResult).filter(Boolean).length + Number(oldRejected) + Number(newAccepted);
  console.log(`${passed}/${count} recovery E2E checks passed`);
  if (passed !== count) process.exitCode = 1;
} finally {
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw new Error(`Local Auth cleanup failed: ${removed.error.message}`);
  }
  console.log("QA recovery Auth fixture cleaned");
}

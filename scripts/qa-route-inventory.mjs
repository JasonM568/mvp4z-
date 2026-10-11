#!/usr/bin/env node
// Regenerate a route-level QA gap inventory from the current Next.js app tree.
// Usage: node scripts/qa-route-inventory.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const appRoot = join(root, "app");
const files = await walk(appRoot);
const apiFiles = files.filter((file) => file.endsWith("/route.ts") && file.includes("/api/"));
const pageFiles = files.filter((file) => file.endsWith("/page.tsx"));
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const rows = [];
for (const file of apiFiles) {
  const source = await readFile(file, "utf8");
  const route = toRoute(file, "route.ts");
  const methods = methodsFromSource(source);
  rows.push([route, methods.join(", ") || "需判讀", apiStatus(route)]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
const pages = pageFiles.map((file) => {
  const route = toRoute(file, "page.tsx");
  return [route, pageStatus(route)];
}).sort((a, b) => a[0].localeCompare(b[0]));

const result = [
  `# API 與頁面驗收缺口清單（自動盤點）`,
  "",
  `產生基準：本機 commit \`${commit}\`；${rows.length} 個 API route 檔、${pages.length} 個頁面檔。執行 \`node scripts/qa-route-inventory.mjs\` 重建。`,
  "本表的「部分已驗」只指欄中列出的情境；其餘正常、異常、空狀態、邊界、超長與並發仍以 [全系統 Test Matrix](full-system-acceptance-2026-10-11.md) 逐項追蹤。`待驗` 是明確未有執行證據，不能推定通過。動態參數路由以模板名稱表示。",
  "",
  "## API routes",
  "",
  "| 路由 | 方法 | QA 狀態／已驗範圍 |",
  "|---|---|---|",
  ...rows.map(([route, methods, status]) => `| \`${route}\` | ${methods} | ${status} |`),
  "",
  "## 頁面 routes",
  "",
  "| 路由 | QA 狀態／已驗範圍 |",
  "|---|---|",
  ...pages.map(([route, status]) => `| \`${route}\` | ${status} |`),
  ""
].join("\n");
const output = join(root, "docs/qa/route-inventory-2026-10-11.md");
await writeFile(output, result);
console.log(`Wrote ${relative(root, output)}: ${rows.length} API routes, ${pages.length} pages`);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
function toRoute(file, basename) {
  const raw = relative(appRoot, file).replace(new RegExp(`/${basename.replace(".", "\\.")}$`), "");
  const segments = raw.split("/").filter((part) => !/^\(.*\)$/.test(part));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}
function methodsFromSource(source) {
  const set = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) set.add(match[1]);
  for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) set.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g)) {
    for (const name of match[1].split(",").map((part) => part.trim().split(/\s+as\s+/).at(-1))) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) set.add(name);
    }
  }
  return [...set].sort();
}
function apiStatus(route) {
  const known = {
    "/api/auth/register": "部分已驗：註冊／同手機並發；郵件待驗",
    "/api/auth/login": "部分已驗：正確／錯密碼",
    "/api/auth/refresh": "部分已驗：有效／無效 refresh",
    "/api/auth/forgot-password": "部分已驗：帳號不洩漏；重設信待驗",
    "/api/member/me": "部分已驗：有效會員／失效 token",
    "/api/member/orders": "隔離通過：A/B 訂單所有權、付款開通輪詢與 SQLi 形狀查詢 11/11",
    "/api/member/usage": "隔離通過：A/B 使用量 API 所有權與匿名／壞 token 拒絕",
    "/api/plans": "部分已驗：公開 GET 200 與 plans 結構（安全冒煙 21/21）；內部方案顯示／排序待驗",
    "/api/site-content": "不合格 M12：DB 全部下架服務後仍回靜態 JSON 9 筆；故障備援待驗",
    "/api/member/redeem": "隔離通過：N=10 原子兌換／rollback；正式待驗",
    "/api/member/council-runs": "隔離通過：A/B 列表所有權",
    "/api/member/council-runs/[id]": "隔離通過：A/B 詳情所有權",
    "/api/ai/chat": "不合格 B1：並發免費答案",
    "/api/ai/council": "既有正式證據：並發／日限額；瀏覽器找回待驗",
    "/api/bookings": "部分已驗：欄位邊界；M1／M3 待規則",
    "/api/courses/checkout": "部分已驗：驗證與後端定價；M5 雙送待規則",
    "/api/orders/create": "部分已驗：M4 邊界 7/7、推廣歸因；M5／C5 待規則",
    "/api/referral/lookup": "隔離通過：公開查碼 8/8；註冊歸因待驗",
    "/api/payments/ecpay/notify": "隔離通過：C4 四情境×20 輪；正式待驗",
    "/api/admin/bookings": "隔離通過：具名管理員列表與 limit 邊界 M6 11/11；正式待驗",
    "/api/admin/bookings/[id]": "隔離通過：具名管理員 GET／PATCH＋audit；更多邊界待驗",
    "/api/admin/create-code": "隔離通過：具名管理員建立、非法／邊界、N=10 唯一碼與 audit 13/13；正式待驗",
    "/api/admin/course-registrations": "不合格 M7/M11：非法 limit 回 500/默許；limit=1 摘要低估兩筆名單",
    "/api/admin/course-registrations/[id]": "隔離通過：具名管理員跟進 PATCH、時間戳與 audit；非法／超長拒絕",
    "/api/admin/referrals": "部分已驗 C7：隔離建立／並發改率 audit 11 輪通過；正式站及 C5 歸因規則待驗",
    "/api/admin/orders": "不合格 M10：管理員清單／詳情與發票對帳通過，三種非法 id 回 500",
    "/api/admin/orders/[id]/refund": "不合格 C10：DB 拆分退款至全額後仍餘 1 點；管理員真 API 與發票處理待驗",
    "/api/admin/invoices": "部分已驗：具名管理員 pending 發票列表與訂單連結；開票／退款待驗",
    "/api/admin/invoices/[orderId]/issue": "部分已驗 C8：隔離 paid 訂單非法 body 7/7；合法 ezPay 開票／正式站待驗",
    "/api/admin/face-knowledge": "部分已驗：具名管理員建立／查詢與非法輸入通過；C6 並發隔離回歸通過",
    "/api/admin/face-knowledge/[id]": "部分已驗 C6：單／雙管理員 N=10 各 11 輪隔離通過；正式站待驗",
    "/api/admin/face-knowledge/[id]/revisions": "部分已驗 C6：隔離並發快照一致；正式站待驗",
    "/api/admin/credits": "不合格 C2：餘額與帳本不一致",
    "/api/face-analysis/runs": "部分已驗：A/B 歷史列表；建立／provider 待驗",
    "/api/face-analysis/runs/[id]": "部分已驗：A/B 詳情與越權 DELETE；本人刪除待驗",
    "/api/face-analysis/runs/[id]/preview": "部分已驗：越權 404；有效照片待驗",
    "/api/face-analysis/runs/[id]/image": "部分已驗：越權 DELETE 404；本人照片待驗"
  };
  if (known[route]) return known[route];
  if (route.startsWith("/api/admin/")) return "部分已驗：匿名／壞 token／會員拒絕；具名管理員流程待驗";
  if (route.startsWith("/api/cron/")) return "部分已驗：匿名 401；排程實際執行待驗";
  return "待驗：缺可重跑的正常與異常流程證據";
}
function pageStatus(route) {
  if (route === "/login") return "部分已驗：Ego 本機登入／錯密碼、正式站 390px；M8 英文錯誤待修，註冊／重設 UI 待驗";
  if (route === "/member") return "部分已驗：Ego 本機本人方案／空報告／pending 單、登出；M9 過期 token 假空狀態待修";
  const mobile = new Set(["/services", "/cases", "/courses", "/booking", "/member-pricing",
    "/member-ai/decision", "/member-ai/face"]);
  if (mobile.has(route)) return "部分已驗：正式站 390px 無水平溢出；完整互動待驗";
  if (route === "/") return "部分已驗：桌面／手機截圖；內容與互動待驗";
  return "待驗：未有本輪頁面互動證據";
}

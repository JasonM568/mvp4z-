#!/usr/bin/env node
// 檢查 EZPAY_INVOICE_* env vars 是否一致、是 sandbox 還是 production、格式合不合。
// 上 prod 換正式環境前跑這個，避免漏設某個 var 或位址錯。
//
// 用法：
//   ECPAY_HASH_KEY=... npm run check:ezpay-env
//   或：vercel env pull .env.production.local --environment=production
//        npm run check:ezpay-env -- --env-file=.env.production.local
//
// 驗證邏輯與 lib/payments/ezpay-config.ts 的 validateEzpayConfig() 對齊。
// 兩處同源是有意為之：runtime 由 helper 抓錯（throw），CI / 本地由本檔抓錯（exit 1）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
loadEnvFile(args.envFile);

const REQUIRED = ["EZPAY_INVOICE_MERCHANT_ID", "EZPAY_INVOICE_HASH_KEY", "EZPAY_INVOICE_HASH_IV"];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ 缺少 env vars：", missing.join(", "));
  console.error("   試試 `vercel env pull .env.local --environment=production` 或 `--env-file=.env.production.local`");
  process.exit(1);
}

const env = process.env.EZPAY_INVOICE_ENV === "production" ? "production" : "stage";
const host = env === "production" ? "https://inv.ezpay.com.tw" : "https://cinv.ezpay.com.tw";
const merchantId = process.env.EZPAY_INVOICE_MERCHANT_ID;
const hashKey = process.env.EZPAY_INVOICE_HASH_KEY;
const hashIv = process.env.EZPAY_INVOICE_HASH_IV;

const issues = [];

if (!/^\d+$/.test(merchantId)) {
  issues.push({ level: "error", code: "INVALID_MID_FORMAT", message: `MerchantID 必須是純數字 (got: ${merchantId})` });
}
if (hashKey.length !== 32) {
  issues.push({ level: "error", code: "HASH_KEY_LENGTH", message: `HashKey 必須 32 字元 (got: ${hashKey.length})` });
}
if (hashIv.length !== 16) {
  issues.push({ level: "error", code: "HASH_IV_LENGTH", message: `HashIV 必須 16 字元 (got: ${hashIv.length})` });
}

console.log("─".repeat(60));
console.log(`EZPay invoice env: ${env.toUpperCase()}`);
console.log(`  MerchantID: ${merchantId}`);
console.log(`  Host: ${host}`);
console.log(`  Issue URL: ${host}/Api/invoice_issue`);
console.log(`  Invalid URL: ${host}/Api/invoice_invalid`);
console.log(`  Search URL: ${host}/Api/invoice_search`);
console.log(`  HashKey: ${hashKey.length} chars (expect 32)`);
console.log(`  HashIV: ${hashIv.length} chars (expect 16)`);
console.log("─".repeat(60));

const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");

for (const w of warns) console.log(`⚠️  [${w.code}] ${w.message}`);
for (const e of errors) console.log(`❌  [${e.code}] ${e.message}`);

if (errors.length) {
  console.log(`\n${errors.length} error(s)，請修正後再 deploy。`);
  process.exit(1);
}
if (warns.length) {
  console.log(`\n${warns.length} warning(s)，請確認屬於預期。`);
  process.exit(0);
}
console.log("\n✅ 全部設定正常。");
process.exit(0);

// ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { envFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env-file") out.envFile = argv[++i];
    else if (a.startsWith("--env-file=")) out.envFile = a.slice("--env-file=".length);
  }
  return out;
}

function loadEnvFile(specified) {
  const candidates = specified ? [specified] : [path.join(rootDir, ".env.local")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    console.log(`(已載入 ${path.relative(rootDir, file)})`);
    return;
  }
}

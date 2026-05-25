#!/usr/bin/env node
// 檢查 ECPAY_* env vars 是否一致、是 sandbox 還是 production、URL 是否合法。
// 上 prod 換正式商店金鑰前跑這個，避免漏改某個變數。
//
// 用法：
//   - 本地：先 `vercel env pull` 拉 production env，再 `npm run check:ecpay-env -- --env production`
//   - 或直接：ECPAY_ENV=production ECPAY_MERCHANT_ID=... npm run check:ecpay-env
//
// 驗證邏輯與 lib/payments/ecpay-config.ts 的 validateEcpayConfig() 對齊。
// 兩處同源是有意為之：runtime 由 helper 抓錯（throw），CI / 本地由本檔抓錯（exit 1）。
// 變更驗證規則時兩處都要改。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
loadEnvFile(args.envFile);

const REQUIRED = [
  "ECPAY_MERCHANT_ID",
  "ECPAY_HASH_KEY",
  "ECPAY_HASH_IV",
  "ECPAY_NOTIFY_URL",
  "ECPAY_RETURN_URL",
  "ECPAY_CLIENT_BACK_URL"
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ 缺少 env vars：", missing.join(", "));
  console.error("   試試 `vercel env pull .env.local` 或 `--env-file=.env.local`");
  process.exit(1);
}

const env = process.env.ECPAY_ENV === "production" ? "production" : "stage";
const config = {
  env,
  merchantId: process.env.ECPAY_MERCHANT_ID,
  hashKey: process.env.ECPAY_HASH_KEY,
  hashIv: process.env.ECPAY_HASH_IV,
  notifyUrl: process.env.ECPAY_NOTIFY_URL,
  returnUrl: process.env.ECPAY_RETURN_URL,
  clientBackUrl: process.env.ECPAY_CLIENT_BACK_URL,
  actionUrl:
    env === "production"
      ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
      : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"
};

const KNOWN_SANDBOX_MERCHANT_IDS = new Set(["3002607", "2000132"]);
const issues = [];

if (config.env === "production" && KNOWN_SANDBOX_MERCHANT_IDS.has(config.merchantId)) {
  issues.push({
    level: "error",
    code: "SANDBOX_MID_IN_PROD",
    message: `ECPAY_ENV=production 但 MerchantID ${config.merchantId} 是綠界公開測試帳號`
  });
}

if (!/^\d+$/.test(config.merchantId)) {
  issues.push({
    level: "error",
    code: "INVALID_MID_FORMAT",
    message: `ECPAY_MERCHANT_ID 必須是純數字 (got: ${config.merchantId})`
  });
}

if (config.hashKey.length < 8) {
  issues.push({ level: "error", code: "HASH_KEY_TOO_SHORT", message: "ECPAY_HASH_KEY 太短，請確認沒貼錯" });
}
if (config.hashIv.length < 8) {
  issues.push({ level: "error", code: "HASH_IV_TOO_SHORT", message: "ECPAY_HASH_IV 太短，請確認沒貼錯" });
}

const urls = [
  { name: "ECPAY_NOTIFY_URL", value: config.notifyUrl },
  { name: "ECPAY_RETURN_URL", value: config.returnUrl },
  { name: "ECPAY_CLIENT_BACK_URL", value: config.clientBackUrl }
];

for (const u of urls) {
  if (/localhost|127\.0\.0\.1/.test(u.value)) {
    issues.push({
      level: config.env === "production" ? "error" : "warn",
      code: "LOCALHOST_URL",
      message: `${u.name} 包含 localhost (${u.value})，綠界 server 打不到`
    });
  }
  if (config.env === "production" && !u.value.startsWith("https://")) {
    issues.push({
      level: "error",
      code: "NON_HTTPS_URL",
      message: `${u.name} 在 production 必須是 https (${u.value})`
    });
  }
}

try {
  const origins = urls.map((u) => new URL(u.value).origin);
  const unique = new Set(origins);
  if (unique.size > 1) {
    issues.push({
      level: "warn",
      code: "URL_ORIGIN_MISMATCH",
      message: `三個 URL origin 不一致：${[...unique].join(" / ")}`
    });
  }
} catch {
  issues.push({
    level: "error",
    code: "URL_INVALID",
    message: "三個 URL 至少一個不是合法 URL"
  });
}

console.log("─".repeat(60));
console.log(`ECPay env: ${config.env.toUpperCase()}`);
console.log(`  MerchantID: ${config.merchantId}${KNOWN_SANDBOX_MERCHANT_IDS.has(config.merchantId) ? "  ⚠ 測試帳號" : ""}`);
console.log(`  Action URL: ${config.actionUrl}`);
console.log(`  Notify URL: ${config.notifyUrl}`);
console.log(`  Return URL: ${config.returnUrl}`);
console.log(`  ClientBack: ${config.clientBackUrl}`);
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
    if (a === "--env-file" || a === "--env-file=") out.envFile = argv[++i];
    else if (a.startsWith("--env-file=")) out.envFile = a.slice("--env-file=".length);
  }
  return out;
}

function loadEnvFile(specified) {
  // 預設嘗試 .env.local；--env-file=X 可指定其他檔
  const candidates = specified
    ? [specified]
    : [path.join(rootDir, ".env.local")];
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
      // 不覆蓋已透過 shell 設定的 env (CI 友善)
      if (!(key in process.env)) process.env[key] = value;
    }
    console.log(`(已載入 ${path.relative(rootDir, file)})`);
    return;
  }
  // 沒檔案就靠 shell env 即可
}

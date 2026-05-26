#!/usr/bin/env node
// EZPay 電子發票 E2E 測試：對 sandbox 真的開一張個人電子發票（B2C + ezPay 載具）。
//
// 用法：
//   EZPAY_INVOICE_ENV=stage \
//   EZPAY_INVOICE_MERCHANT_ID=337811304 \
//   EZPAY_INVOICE_HASH_KEY=<32 chars> \
//   EZPAY_INVOICE_HASH_IV=<16 chars> \
//   npm run test:ezpay-invoice-e2e
//
//   或：vercel env pull .env.local --environment=preview && npm run test:ezpay-invoice-e2e
//
// 測試流程：
//   1. 加密 / 解密 round-trip（純本機，不打 API）
//   2. CheckCode 對附件二範例驗證
//   3. 開一張 B2C ezPay 載具發票（買 NT$1 商品）
//   4. 驗回應 Status=SUCCESS、CheckCode 自驗通過
//
// 沙箱不會真實開出財政部認可的發票，可放心測。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadEnvFile(path.join(rootDir, ".env.local"));

const env = process.env.EZPAY_INVOICE_ENV === "production" ? "production" : "stage";
const merchantId = required("EZPAY_INVOICE_MERCHANT_ID");
const hashKey = required("EZPAY_INVOICE_HASH_KEY");
const hashIv = required("EZPAY_INVOICE_HASH_IV");

const host = env === "production" ? "https://inv.ezpay.com.tw" : "https://cinv.ezpay.com.tw";
const issueUrl = `${host}/Api/invoice_issue`;

console.log(`環境：${env.toUpperCase()} (${host})`);
console.log(`MerchantID：${merchantId}`);

// ── 1. 加密 / 解密 round-trip ─────────────────────────────────
{
  const sample = "RespondType=JSON&Version=1.5&TimeStamp=1234567890";
  const encrypted = encryptPostData(sample, hashKey, hashIv);
  const decrypted = decryptPostData(encrypted, hashKey, hashIv);
  if (decrypted !== sample) {
    throw new Error(`Round-trip 失敗：${JSON.stringify({ sample, decrypted })}`);
  }
  console.log(`✓ 加密 round-trip：${sample.length} bytes → hex ${encrypted.length} chars → decoded 一致`);
}

// ── 2. CheckCode 對附件二範例 ────────────────────────────────
//
// PDF 範例：
//   $check_code_arr = array(
//     'MerchantID'      => '3622183',
//     'MerchantOrderNo' => '201409170000001',
//     'InvoiceTransNo'  => '14061313541640927',
//     'TotalAmt'        => '500',
//     'RandomNum'       => '0142'
//   );
//   HashKey=abcdefghijklmnopqrstuvwxyzabcdef, HashIV=1234567891234567
//   Expected: 303AB800650B724733B5D91CBCE075D9EA09E4CDE9CD33461D45F07D5EC7EECB
{
  const expected = "303AB800650B724733B5D91CBCE075D9EA09E4CDE9CD33461D45F07D5EC7EECB";
  const actual = computeCheckCode({
    MerchantID: "3622183",
    MerchantOrderNo: "201409170000001",
    InvoiceTransNo: "14061313541640927",
    TotalAmt: 500,
    RandomNum: "0142"
  }, "abcdefghijklmnopqrstuvwxyzabcdef", "1234567891234567");
  if (actual !== expected) {
    throw new Error(`CheckCode 演算錯：expected ${expected}, got ${actual}`);
  }
  console.log(`✓ CheckCode 對附件二範例：${actual.slice(0, 16)}...`);
}

// ── 3. 對 sandbox 開一張 B2C ezPay 載具發票 ──────────────────
const merchantOrderNo = `XFTST${Date.now().toString().slice(-10)}`;
const fields = {
  RespondType: "JSON",
  Version: "1.5",
  TimeStamp: String(Math.floor(Date.now() / 1000)),
  MerchantOrderNo: merchantOrderNo,
  Status: "1",
  Category: "B2C",
  BuyerName: "Xunfeng 測試買家",
  BuyerEmail: "test@xunfeng.tw",
  CarrierType: "2",                       // ezPay 載具
  CarrierNum: "test@xunfeng.tw",
  PrintFlag: "N",                          // 載具不索取紙本
  TaxType: "1",
  TaxRate: "5",
  Amt: "1",                                // 銷售額未稅
  TaxAmt: "0",                             // 1 元極小額稅額為 0
  TotalAmt: "1",
  ItemName: "EZPay E2E 測試項目",
  ItemCount: "1",
  ItemUnit: "次",
  ItemPrice: "1",                          // B2C 含稅
  ItemAmt: "1",
  Comment: "Xunfeng EZPay helper 沙箱自動測試"
};

const plainText = new URLSearchParams(fields).toString();
const encrypted = encryptPostData(plainText, hashKey, hashIv);

console.log(`\n發送開立發票請求：${merchantOrderNo}`);
const response = await fetch(issueUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ MerchantID_: merchantId, PostData_: encrypted })
});

const responseText = await response.text();
console.log(`HTTP ${response.status}`);

let responseJson;
try {
  responseJson = JSON.parse(responseText);
} catch {
  console.log("response 不是 JSON：", responseText);
  process.exit(1);
}

console.log(JSON.stringify(responseJson, null, 2));

if (responseJson.Status !== "SUCCESS") {
  console.log(`\n❌ 開立失敗：${responseJson.Status} - ${responseJson.Message}`);
  process.exit(1);
}

const result = JSON.parse(responseJson.Result);
console.log(`\n✓ 發票開立成功`);
console.log(`  InvoiceNumber: ${result.InvoiceNumber}`);
console.log(`  InvoiceTransNo: ${result.InvoiceTransNo}`);
console.log(`  RandomNum: ${result.RandomNum}`);
console.log(`  CreateTime: ${result.CreateTime}`);
console.log(`  TotalAmt: ${result.TotalAmt}`);

// ── 4. 自驗 CheckCode ───────────────────────────────────────
const expectedCheckCode = computeCheckCode({
  MerchantID: result.MerchantID,
  MerchantOrderNo: result.MerchantOrderNo,
  InvoiceTransNo: result.InvoiceTransNo,
  TotalAmt: result.TotalAmt,
  RandomNum: result.RandomNum
}, hashKey, hashIv);

if (expectedCheckCode === result.CheckCode) {
  console.log(`✓ CheckCode 驗證通過：${result.CheckCode.slice(0, 16)}...`);
} else {
  console.log(`❌ CheckCode 不符`);
  console.log(`  Expected: ${expectedCheckCode}`);
  console.log(`  Got:      ${result.CheckCode}`);
  process.exit(1);
}

console.log("\n✅ 全部測試通過。可以接 issueInvoiceFromOrder 了。");

// ── helpers ────────────────────────────────────────────────

function encryptPostData(plainText, hashKey, hashIv) {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(hashKey, "utf8"), Buffer.from(hashIv, "utf8"));
  cipher.setAutoPadding(false);
  const padded = padToBlock(Buffer.from(plainText, "utf8"));
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString("hex");
}

function decryptPostData(hexCiphertext, hashKey, hashIv) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(hashKey, "utf8"), Buffer.from(hashIv, "utf8"));
  decipher.setAutoPadding(false);
  const buf = Buffer.from(hexCiphertext, "hex");
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  const padLen = decrypted[decrypted.length - 1];
  return decrypted.subarray(0, decrypted.length - padLen).toString("utf8");
}

function padToBlock(input, blockSize = 32) {
  const padLen = blockSize - (input.length % blockSize);
  return Buffer.concat([input, Buffer.alloc(padLen, padLen)]);
}

function computeCheckCode(input, hashKey, hashIv) {
  const sorted = {};
  for (const key of ["InvoiceTransNo", "MerchantID", "MerchantOrderNo", "RandomNum", "TotalAmt"].sort()) {
    sorted[key] = String(input[key]);
  }
  const middle = new URLSearchParams(sorted).toString();
  const raw = `HashIV=${hashIv}&${middle}&HashKey=${hashKey}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();
}

function required(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing env: ${key}`);
    process.exit(1);
  }
  return v;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
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
}

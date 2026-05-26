// EZPay 樂點電子發票串接 helper。
//
// 規格來源：EZP_INVI_1_2_2.pdf
//   - 第四章 開立發票
//   - 附件一 PostData_ 加密方法
//   - 附件二 CheckCode 產生規則
//
// 加密注意事項（EZPay 特殊處）：
//   - 演算法：AES-256-CBC
//   - Padding：PKCS7-style，但 **blocksize 是 32**（不是標準的 16）
//   - PHP 範例用 `OPENSSL_ZERO_PADDING` + 自己 `addpadding($str, 32)`
//   - C# 範例用 `aes.Padding = None` + 自己 `AddPKCS7Padding(data, 32)`
//   - 對應 Node：`cipher.setAutoPadding(false)` + 自己 pad 到 32 bytes 倍數
//   - PostData_ 內容是 `application/x-www-form-urlencoded` 字串（不是 JSON）
//     用 URLSearchParams 組好後再加密
//   - 加密後做 bin2hex（lowercase）→ 放進外層 POST body `PostData_=`
//
// 回應：外層 JSON，`Result` 欄位是「再一層 JSON 字串」需要 JSON.parse 兩次。

import crypto from "node:crypto";
import { getValidatedEzpayConfig } from "./ezpay-config";

// ── 加密 / 解密 ──────────────────────────────────────────────

const BLOCK_SIZE = 32; // EZPay 規格：padding 到 32-byte 倍數，不是標準 AES 16

function padToBlock(input: Buffer, blockSize = BLOCK_SIZE): Buffer {
  const padLen = blockSize - (input.length % blockSize);
  return Buffer.concat([input, Buffer.alloc(padLen, padLen)]);
}

function unpadPkcs7(input: Buffer): Buffer {
  if (input.length === 0) return input;
  const padLen = input[input.length - 1];
  if (padLen < 1 || padLen > BLOCK_SIZE) return input; // 防呆：值不合理就回 raw
  return input.subarray(0, input.length - padLen);
}

export function encryptPostData(plainText: string, hashKey: string, hashIv: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(hashKey, "utf8"), Buffer.from(hashIv, "utf8"));
  cipher.setAutoPadding(false);
  const padded = padToBlock(Buffer.from(plainText, "utf8"));
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString("hex"); // bin2hex lowercase
}

export function decryptPostData(hexCiphertext: string, hashKey: string, hashIv: string): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(hashKey, "utf8"), Buffer.from(hashIv, "utf8"));
  decipher.setAutoPadding(false);
  const buf = Buffer.from(hexCiphertext, "hex");
  const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);
  return unpadPkcs7(decrypted).toString("utf8");
}

// ── 開立發票 ────────────────────────────────────────────────

export type EzpayCategory = "B2B" | "B2C";
export type EzpayTaxType = "1" | "2" | "3" | "9"; // 1=應稅 2=零稅率 3=免稅 9=混合
export type EzpayCarrierType = "" | "0" | "1" | "2"; // ''=無 0=手機條碼 1=自然人憑證 2=ezPay 載具

export interface InvoiceItem {
  name: string;      // 多項用 | 分隔，這邊單筆，組合時 join
  count: number;
  unit: string;      // 中文限 2 字、英數 6 字
  price: number;     // B2B=未稅 / B2C=含稅
  amount: number;    // = count * price
}

export interface IssueInvoiceInput {
  merchantOrderNo: string;             // 對應我們的 orders.order_no（限英、數、_）
  category: EzpayCategory;
  buyerName: string;                   // B2B 60 字 / B2C 30 字
  buyerUbn?: string;                   // B2B 必填，8 碼純數字
  buyerAddress?: string;               // B2B 必填
  buyerEmail?: string;                 // CarrierType=2 必填
  carrierType?: EzpayCarrierType;
  carrierNum?: string;
  loveCode?: string;                   // 3-7 碼純數字（捐贈碼）
  printFlag: "Y" | "N";                // B2B 必 Y
  taxType: EzpayTaxType;
  taxRate: number;                     // 應稅一般 5
  amt: number;                         // 銷售額未稅
  taxAmt: number;                      // 稅額
  totalAmt: number;                    // = amt + taxAmt
  items: InvoiceItem[];
  comment?: string;
}

export interface EzpayResultPayload {
  CheckCode: string;
  MerchantID: string;
  MerchantOrderNo: string;
  InvoiceNumber: string;
  InvoiceTransNo: string;
  TotalAmt: number;
  RandomNum: string;
  CreateTime: string;
  BarCode?: string;
  QRcodeL?: string;
  QRcodeR?: string;
}

export interface IssueInvoiceResponse {
  ok: boolean;
  status: string;         // "SUCCESS" or error code
  message: string;
  result?: EzpayResultPayload;
  rawResponse: unknown;   // 原始 JSON（debug 用）
  rawRequest: {           // 原始送出的 plain post data（不含 keys/iv）— audit log 用
    url: string;
    merchantId: string;
    plainTextLength: number;
  };
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResponse> {
  const config = getValidatedEzpayConfig();

  validateInput(input);

  const fields: Record<string, string> = {
    RespondType: "JSON",
    Version: "1.5",
    TimeStamp: String(Math.floor(Date.now() / 1000)),
    MerchantOrderNo: input.merchantOrderNo,
    Status: "1", // 即時開立
    Category: input.category,
    BuyerName: input.buyerName,
    PrintFlag: input.printFlag,
    TaxType: input.taxType,
    TaxRate: String(input.taxRate),
    Amt: String(input.amt),
    TaxAmt: String(input.taxAmt),
    TotalAmt: String(input.totalAmt),
    ItemName: input.items.map((i) => i.name).join("|"),
    ItemCount: input.items.map((i) => String(i.count)).join("|"),
    ItemUnit: input.items.map((i) => i.unit).join("|"),
    ItemPrice: input.items.map((i) => String(i.price)).join("|"),
    ItemAmt: input.items.map((i) => String(i.amount)).join("|")
  };

  if (input.buyerUbn) fields.BuyerUBN = input.buyerUbn;
  if (input.buyerAddress) fields.BuyerAddress = input.buyerAddress;
  if (input.buyerEmail) fields.BuyerEmail = input.buyerEmail;
  if (input.carrierType) fields.CarrierType = input.carrierType;
  if (input.carrierNum) fields.CarrierNum = input.carrierNum;
  if (input.loveCode) fields.LoveCode = input.loveCode;
  if (input.comment) fields.Comment = input.comment;

  // 組成 form-urlencoded 字串（注意：EZPay 用 PHP `http_build_query` 風格）
  const plainText = new URLSearchParams(fields).toString();
  const encrypted = encryptPostData(plainText, config.hashKey, config.hashIv);

  const body = new URLSearchParams({
    MerchantID_: config.merchantId,
    PostData_: encrypted
  });

  const response = await fetch(config.issueUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const responseText = await response.text();
  const responseJson = JSON.parse(responseText) as { Status: string; Message: string; Result?: string };

  let result: EzpayResultPayload | undefined;
  if (responseJson.Result && typeof responseJson.Result === "string") {
    try {
      result = JSON.parse(responseJson.Result) as EzpayResultPayload;
    } catch {
      // Result 不是 JSON，可能 Status 是錯誤碼，留 raw 即可
    }
  }

  return {
    ok: responseJson.Status === "SUCCESS",
    status: responseJson.Status,
    message: responseJson.Message,
    result,
    rawResponse: responseJson,
    rawRequest: {
      url: config.issueUrl,
      merchantId: config.merchantId,
      plainTextLength: plainText.length
    }
  };
}

function validateInput(input: IssueInvoiceInput) {
  if (!/^[A-Za-z0-9_]+$/.test(input.merchantOrderNo)) {
    throw new Error(`merchantOrderNo 只能含英數底線 (got: ${input.merchantOrderNo})`);
  }
  if (input.merchantOrderNo.length > 20) {
    throw new Error(`merchantOrderNo 長度 ≤ 20 (got: ${input.merchantOrderNo.length})`);
  }
  if (input.amt + input.taxAmt !== input.totalAmt) {
    throw new Error(`totalAmt 必須 = amt + taxAmt (got: ${input.amt} + ${input.taxAmt} ≠ ${input.totalAmt})`);
  }
  if (input.items.length === 0) {
    throw new Error("items 至少要有一項");
  }
  for (const item of input.items) {
    if (item.count * item.price !== item.amount) {
      throw new Error(`item amount 必須 = count * price (got: ${item.count} * ${item.price} ≠ ${item.amount})`);
    }
  }
  if (input.category === "B2B") {
    if (!input.buyerUbn || !/^\d{8}$/.test(input.buyerUbn)) {
      throw new Error("B2B 必須帶 8 碼數字的 buyerUbn");
    }
    if (input.printFlag !== "Y") {
      throw new Error("B2B 的 printFlag 必須為 Y");
    }
  }
  if (input.category === "B2C") {
    if (!input.carrierType && !input.loveCode && input.printFlag !== "Y") {
      throw new Error("B2C 沒帶 carrierType 也沒帶 loveCode 時，printFlag 必須為 Y");
    }
  }
  if (input.carrierType === "2" && !input.buyerEmail) {
    throw new Error("CarrierType=2 (ezPay 載具) 必須帶 buyerEmail 作為載具編號");
  }
}

// ── CheckCode 驗證（附件二）──────────────────────────────────
//
// 用於驗證回傳的 Result 是否真的是 EZPay 發的（防中間人）。
// 規則：5 個欄位 A-Z 排序 → URL-encoded form 串聯 → 前後加 HashIV/HashKey → SHA256 大寫

export function verifyCheckCode(result: Pick<EzpayResultPayload, "InvoiceTransNo" | "MerchantID" | "MerchantOrderNo" | "RandomNum" | "TotalAmt" | "CheckCode">, hashKey: string, hashIv: string): boolean {
  const expected = computeCheckCode(result, hashKey, hashIv);
  return expected === result.CheckCode;
}

export function computeCheckCode(input: { InvoiceTransNo: string; MerchantID: string; MerchantOrderNo: string; RandomNum: string; TotalAmt: number }, hashKey: string, hashIv: string): string {
  const sorted: Record<string, string> = {};
  for (const key of ["InvoiceTransNo", "MerchantID", "MerchantOrderNo", "RandomNum", "TotalAmt"].sort()) {
    sorted[key] = String((input as Record<string, unknown>)[key]);
  }
  const middle = new URLSearchParams(sorted).toString();
  const raw = `HashIV=${hashIv}&${middle}&HashKey=${hashKey}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();
}

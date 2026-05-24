import crypto from "node:crypto";

// 綠界電子發票 V3 API helper
// 文件：https://developers.ecpay.com.tw/?p=15947
// V3 與金流 V5 不同：用 AES-128-CBC 加密 JSON payload，不是 CheckMacValue
//
// 加密流程：
//   1. payload object → JSON string
//   2. JSON string → encodeURIComponent
//   3. AES-128-CBC 加密（key=HashKey 16 bytes, iv=HashIV 16 bytes, PKCS7 padding）
//   4. base64 encode
// 解密流程相反。

type InvoiceAction = "Issue" | "Invalid" | "GetIssue";

export type InvoiceCarrierType = "none" | "cellphone" | "citizen_digital" | "ecpay_member";

export interface IssueInvoiceItem {
  name: string;
  count: number;
  word?: string;      // 單位，預設「項」
  price: number;     // 單價（含稅）
  taxType?: "1" | "2" | "3";  // 預設應稅
}

export interface IssueInvoiceInput {
  relateNumber: string;          // 唯一識別碼，建議用 order_no
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerIdentifier?: string;   // 統編 8 碼
  carrierType: InvoiceCarrierType;
  carrierNum?: string;
  donationCode?: string;         // 捐贈碼 4-7 碼，有值表示捐贈
  totalAmount: number;           // 含稅總額
  taxType?: "1" | "2" | "3" | "9";
  items: IssueInvoiceItem[];
  invoiceRemark?: string;
}

export interface IssueInvoiceSuccess {
  ok: true;
  invoiceNumber: string;
  randomCode: string;
  invoiceDate: string;           // 綠界回傳的 YYYY-MM-DD HH:mm:ss
  rawResponse: unknown;
}

export interface IssueInvoiceFailure {
  ok: false;
  errorCode: string;
  errorMessage: string;
  rawResponse: unknown;
}

export type IssueInvoiceResult = IssueInvoiceSuccess | IssueInvoiceFailure;

export interface VoidInvoiceInput {
  invoiceNumber: string;
  reason: string;
}

export interface VoidInvoiceResult {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  rawResponse: unknown;
}

export function invoiceActionUrl(action: InvoiceAction): string {
  const base = process.env.ECPAY_INVOICE_ENV === "production"
    ? "https://einvoice.ecpay.com.tw"
    : "https://einvoice-stage.ecpay.com.tw";
  switch (action) {
    case "Issue":
      return `${base}/B2CInvoice/Issue`;
    case "Invalid":
      return `${base}/B2CInvoice/Invalid`;
    case "GetIssue":
      return `${base}/B2CInvoice/GetIssue`;
  }
}

export function encryptPayload(payload: unknown): string {
  const key = getKey();
  const iv = getIv();
  const json = JSON.stringify(payload);
  const urlEncoded = encodeURIComponent(json);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true);  // PKCS7
  const encrypted = Buffer.concat([cipher.update(urlEncoded, "utf8"), cipher.final()]);
  return encrypted.toString("base64");
}

export function decryptResponse(encrypted: string): unknown {
  const key = getKey();
  const iv = getIv();
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final()
  ]);
  const urlEncoded = decrypted.toString("utf8");
  const json = decodeURIComponent(urlEncoded);
  return JSON.parse(json);
}

// 對應綠界 CarrierType：""=無載具、1=會員載具、2=自然人憑證、3=手機條碼
function mapCarrierType(carrier: InvoiceCarrierType): string {
  switch (carrier) {
    case "none":
      return "";
    case "ecpay_member":
      return "1";
    case "citizen_digital":
      return "2";
    case "cellphone":
      return "3";
  }
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  const merchantId = getMerchantId();
  const isDonation = Boolean(input.donationCode);
  const carrierType = isDonation ? "" : mapCarrierType(input.carrierType);

  const itemsForApi = input.items.map((item, idx) => ({
    ItemSeq: idx + 1,
    ItemName: sanitize(item.name),
    ItemCount: item.count,
    ItemWord: item.word || "項",
    ItemPrice: item.price,
    ItemTaxType: item.taxType || "1",
    ItemAmount: item.price * item.count
  }));

  const dataPayload: Record<string, unknown> = {
    MerchantID: merchantId,
    RelateNumber: input.relateNumber,
    CustomerName: sanitize(input.customerName).slice(0, 60),
    CustomerEmail: input.customerEmail || "",
    CustomerPhone: input.customerPhone || "",
    CustomerAddr: "",
    CustomerIdentifier: input.customerIdentifier || "",
    Print: input.customerIdentifier ? "1" : "0",
    Donation: isDonation ? "1" : "0",
    LoveCode: isDonation ? (input.donationCode || "") : "",
    CarrierType: carrierType,
    CarrierNum: carrierType ? (input.carrierNum || "") : "",
    TaxType: input.taxType || "1",
    SalesAmount: input.totalAmount,
    InvoiceRemark: input.invoiceRemark || "",
    Items: itemsForApi,
    InvType: "07",
    vat: "1"
  };

  const body = {
    MerchantID: merchantId,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
    Data: encryptPayload(dataPayload)
  };

  const response = await fetch(invoiceActionUrl("Issue"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const responseJson = await response.json() as { TransCode?: number; TransMsg?: string; Data?: string };
  const decrypted = responseJson.Data
    ? decryptResponse(responseJson.Data)
    : null;

  // TransCode=1 表示傳輸成功；實際開票結果看 Data.RtnCode
  if (responseJson.TransCode !== 1 || !decrypted) {
    return {
      ok: false,
      errorCode: String(responseJson.TransCode ?? "unknown"),
      errorMessage: responseJson.TransMsg || "TransCode failure",
      rawResponse: responseJson
    };
  }

  const data = decrypted as {
    RtnCode?: number;
    RtnMsg?: string;
    InvoiceNo?: string;
    InvoiceDate?: string;
    RandomNumber?: string;
  };

  if (data.RtnCode !== 1 || !data.InvoiceNo) {
    return {
      ok: false,
      errorCode: String(data.RtnCode ?? "unknown"),
      errorMessage: data.RtnMsg || "Invoice issuance failed",
      rawResponse: data
    };
  }

  return {
    ok: true,
    invoiceNumber: data.InvoiceNo,
    randomCode: data.RandomNumber || "",
    invoiceDate: data.InvoiceDate || "",
    rawResponse: data
  };
}

export async function voidInvoice(input: VoidInvoiceInput): Promise<VoidInvoiceResult> {
  const merchantId = getMerchantId();
  const dataPayload = {
    MerchantID: merchantId,
    InvoiceNo: input.invoiceNumber,
    InvoiceDate: formatInvoiceDate(new Date()),
    Reason: sanitize(input.reason).slice(0, 20)
  };
  const body = {
    MerchantID: merchantId,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
    Data: encryptPayload(dataPayload)
  };
  const response = await fetch(invoiceActionUrl("Invalid"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const responseJson = await response.json() as { TransCode?: number; TransMsg?: string; Data?: string };
  const decrypted = responseJson.Data ? decryptResponse(responseJson.Data) : null;
  if (responseJson.TransCode !== 1 || !decrypted) {
    return {
      ok: false,
      errorCode: String(responseJson.TransCode ?? "unknown"),
      errorMessage: responseJson.TransMsg || "TransCode failure",
      rawResponse: responseJson
    };
  }
  const data = decrypted as { RtnCode?: number; RtnMsg?: string };
  if (data.RtnCode !== 1) {
    return {
      ok: false,
      errorCode: String(data.RtnCode ?? "unknown"),
      errorMessage: data.RtnMsg || "Invoice void failed",
      rawResponse: data
    };
  }
  return { ok: true, rawResponse: data };
}

function formatInvoiceDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sanitize(value: string) {
  return value.replace(/[<>]/g, "");
}

function getKey() {
  const key = requiredEnv("ECPAY_INVOICE_HASH_KEY");
  if (key.length !== 16) {
    throw new Error("ECPAY_INVOICE_HASH_KEY must be 16 bytes");
  }
  return Buffer.from(key, "utf8");
}

function getIv() {
  const iv = requiredEnv("ECPAY_INVOICE_HASH_IV");
  if (iv.length !== 16) {
    throw new Error("ECPAY_INVOICE_HASH_IV must be 16 bytes");
  }
  return Buffer.from(iv, "utf8");
}

function getMerchantId() {
  return requiredEnv("ECPAY_INVOICE_MERCHANT_ID");
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

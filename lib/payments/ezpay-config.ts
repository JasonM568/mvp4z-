// EZPay 樂點電子發票（B2C/B2B）的環境設定集中讀取與驗證。
//
// 為什麼集中：sandbox / production 用「不同 host」切換（sandbox 跟 production
// 是不同商店帳號，keys 也不同），但格式規則固定（MerchantID 純數字、HashKey
// 32 字元、HashIV 16 字元）。集中一次讀齊 + 驗證，避免上 prod 時某個 env
// 漏設造成沙箱 host 打到正式環境（會回 KEY10006）。
//
// 規格來源：EZP_INVI_1_2_2.pdf 第三章「串接環境」、附件一「PostData_ 加密」
// 注意：這跟綠界主金流 ECPAY_* (lib/payments/ecpay-config.ts) 完全不同流程，
// 獨立管理。先前嘗試過綠界自家 V3 發票 helper 已於 2026-05-26 PR #43 sunset。

export type EzpayEnvironment = "production" | "stage";

export interface EzpayConfig {
  env: EzpayEnvironment;
  merchantId: string;
  hashKey: string;
  hashIv: string;
  issueUrl: string;      // 開立發票 endpoint
  touchIssueUrl: string; // 觸發開立發票 endpoint（Status=0/3 才用）
  invalidUrl: string;    // 作廢發票 endpoint
  searchUrl: string;     // 查詢發票 endpoint
}

const HOSTS: Record<EzpayEnvironment, string> = {
  stage: "https://cinv.ezpay.com.tw",
  production: "https://inv.ezpay.com.tw"
};

export function getEzpayConfig(): EzpayConfig {
  const env: EzpayEnvironment = process.env.EZPAY_INVOICE_ENV === "production" ? "production" : "stage";
  const host = HOSTS[env];
  return {
    env,
    merchantId: requiredEnv("EZPAY_INVOICE_MERCHANT_ID"),
    hashKey: requiredEnv("EZPAY_INVOICE_HASH_KEY"),
    hashIv: requiredEnv("EZPAY_INVOICE_HASH_IV"),
    issueUrl: `${host}/Api/invoice_issue`,
    touchIssueUrl: `${host}/Api/invoice_touch_issue`,
    invalidUrl: `${host}/Api/invoice_invalid`,
    searchUrl: `${host}/Api/invoice_search`
  };
}

export interface ValidationIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

// 純函式：給 config 回 issues。caller 決定要 throw、log 還是 ignore。
export function validateEzpayConfig(c: EzpayConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. MerchantID 必須是純數字（EZPay 商店代號規格）
  if (!/^\d+$/.test(c.merchantId)) {
    issues.push({
      level: "error",
      code: "INVALID_MID_FORMAT",
      message: `EZPAY_INVOICE_MERCHANT_ID 必須是純數字 (got: ${c.merchantId})`
    });
  }

  // 2. HashKey 必須 32 字元（EZPay 規格，對應 AES-256 的 32-byte key）
  if (c.hashKey.length !== 32) {
    issues.push({
      level: "error",
      code: "HASH_KEY_LENGTH",
      message: `EZPAY_INVOICE_HASH_KEY 必須 32 字元 (got: ${c.hashKey.length})`
    });
  }

  // 3. HashIV 必須 16 字元（EZPay 規格，對應 AES CBC 的 16-byte IV）
  if (c.hashIv.length !== 16) {
    issues.push({
      level: "error",
      code: "HASH_IV_LENGTH",
      message: `EZPAY_INVOICE_HASH_IV 必須 16 字元 (got: ${c.hashIv.length})`
    });
  }

  return issues;
}

let cachedConfig: EzpayConfig | null = null;

// 取得 config 並在第一次驗一次。error 直接 throw、warn 走 console.warn。
// 後續呼叫直接回 cached。所有 ezpay code 應該透過這個拿 config。
export function getValidatedEzpayConfig(): EzpayConfig {
  if (cachedConfig) return cachedConfig;
  const config = getEzpayConfig();
  const issues = validateEzpayConfig(config);
  for (const issue of issues) {
    if (issue.level === "error") {
      throw new Error(`[ezpay-config] ${issue.code}: ${issue.message}`);
    }
    console.warn(`[ezpay-config] ${issue.code}: ${issue.message}`);
  }
  cachedConfig = config;
  return config;
}

// 給 check script 用，不 throw、不 cache
export function inspectEzpayConfig(): { config: EzpayConfig; issues: ValidationIssue[] } | { error: string } {
  try {
    const config = getEzpayConfig();
    return { config, issues: validateEzpayConfig(config) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

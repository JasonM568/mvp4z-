// ECPay 主金流（AIO V5）的環境設定集中讀取與驗證。
//
// 為什麼集中：之前 ECPAY_ENV / MERCHANT_ID / HASH_KEY / HASH_IV / 三個 URL
// 散在 lib/payments/ecpay.ts 與 scripts/test-ecpay-idempotency.mjs 各自呼叫
// requiredEnv()，切 sandbox/prod 時容易漏改某一個 env 造成混搭。
//
// 這個 helper 確保：
//   1. 一次讀齊所有相關 env，typed config 出來
//   2. validate() 抓出常見錯配（sandbox MerchantID + prod URL、混搭 domain ⋯）
//   3. validateOrThrow() 在 app boot 或第一次呼叫綠界前先抓錯，比讓綠界回 500 好 debug
//
// 注意：發票 V3 API 走另一組 ECPAY_INVOICE_* env，由 lib/payments/ecpay-invoice.ts
// 的 helper 自管，這邊不處理。

export type EcpayEnvironment = "production" | "stage";

export interface EcpayConfig {
  env: EcpayEnvironment;
  merchantId: string;
  hashKey: string;
  hashIv: string;
  notifyUrl: string;     // server-to-server webhook (ReturnURL)
  returnUrl: string;     // browser redirect (OrderResultURL)
  clientBackUrl: string; // 「返回商店」按鈕
  actionUrl: string;     // 綠界 AIO checkout URL
}

// 綠界公開的 sandbox 測試 MerchantID（不可能在正式環境出現）
const KNOWN_SANDBOX_MERCHANT_IDS = new Set(["3002607", "2000132"]);

export function getEcpayConfig(): EcpayConfig {
  const env: EcpayEnvironment = process.env.ECPAY_ENV === "production" ? "production" : "stage";
  return {
    env,
    merchantId: requiredEnv("ECPAY_MERCHANT_ID"),
    hashKey: requiredEnv("ECPAY_HASH_KEY"),
    hashIv: requiredEnv("ECPAY_HASH_IV"),
    notifyUrl: requiredEnv("ECPAY_NOTIFY_URL"),
    returnUrl: requiredEnv("ECPAY_RETURN_URL"),
    clientBackUrl: requiredEnv("ECPAY_CLIENT_BACK_URL"),
    actionUrl:
      env === "production"
        ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
        : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"
  };
}

export interface ValidationIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

// 純函式：給 config 回 issues。caller 決定要 throw、log 還是 ignore。
export function validateEcpayConfig(c: EcpayConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. sandbox MerchantID 不該配 production env
  if (c.env === "production" && KNOWN_SANDBOX_MERCHANT_IDS.has(c.merchantId)) {
    issues.push({
      level: "error",
      code: "SANDBOX_MID_IN_PROD",
      message: `ECPAY_ENV=production 但 MerchantID ${c.merchantId} 是綠界公開測試帳號，付款不會真實扣款`
    });
  }

  // 2. URL 不能是 localhost（production 必死、stage 也很奇怪）
  const urls = [
    { name: "ECPAY_NOTIFY_URL", value: c.notifyUrl },
    { name: "ECPAY_RETURN_URL", value: c.returnUrl },
    { name: "ECPAY_CLIENT_BACK_URL", value: c.clientBackUrl }
  ];
  for (const { name, value } of urls) {
    if (/localhost|127\.0\.0\.1/.test(value)) {
      issues.push({
        level: c.env === "production" ? "error" : "warn",
        code: "LOCALHOST_URL",
        message: `${name} 包含 localhost (${value})，綠界 server 打不到`
      });
    }
    if (c.env === "production" && !value.startsWith("https://")) {
      issues.push({
        level: "error",
        code: "NON_HTTPS_URL",
        message: `${name} 在 production 必須是 https (${value})`
      });
    }
  }

  // 3. 三個 URL 的 origin 必須一致（不然 redirect 流會跨站很怪）
  try {
    const origins = urls.map((u) => new URL(u.value).origin);
    const unique = new Set(origins);
    if (unique.size > 1) {
      issues.push({
        level: "warn",
        code: "URL_ORIGIN_MISMATCH",
        message: `ECPAY_NOTIFY_URL / RETURN_URL / CLIENT_BACK_URL 的 origin 不一致：${[...unique].join(" / ")}`
      });
    }
  } catch {
    issues.push({
      level: "error",
      code: "URL_INVALID",
      message: "ECPAY_NOTIFY_URL / RETURN_URL / CLIENT_BACK_URL 至少一個不是合法 URL"
    });
  }

  // 4. MerchantID 長度（綠界正式 ID 是 7 碼數字）
  if (!/^\d+$/.test(c.merchantId)) {
    issues.push({
      level: "error",
      code: "INVALID_MID_FORMAT",
      message: `ECPAY_MERCHANT_ID 必須是純數字 (got: ${c.merchantId})`
    });
  }

  // 5. HashKey / HashIV 必須有值且常見長度（綠界目前是 16 字元）
  if (c.hashKey.length < 8) {
    issues.push({ level: "error", code: "HASH_KEY_TOO_SHORT", message: "ECPAY_HASH_KEY 太短，請確認沒貼錯" });
  }
  if (c.hashIv.length < 8) {
    issues.push({ level: "error", code: "HASH_IV_TOO_SHORT", message: "ECPAY_HASH_IV 太短，請確認沒貼錯" });
  }

  return issues;
}

let cachedConfig: EcpayConfig | null = null;

// 取得 config 並在第一次驗一次，error 直接 throw、warn 走 console.warn。
// 後續呼叫直接回 cached。
export function getValidatedEcpayConfig(): EcpayConfig {
  if (cachedConfig) return cachedConfig;
  const config = getEcpayConfig();
  const issues = validateEcpayConfig(config);
  for (const issue of issues) {
    if (issue.level === "error") {
      throw new Error(`[ecpay-config] ${issue.code}: ${issue.message}`);
    }
    console.warn(`[ecpay-config] ${issue.code}: ${issue.message}`);
  }
  cachedConfig = config;
  return config;
}

// 純驗證，不 throw、不 cache，給 check script 用
export function inspectEcpayConfig(): { config: EcpayConfig; issues: ValidationIssue[] } | { error: string } {
  try {
    const config = getEcpayConfig();
    return { config, issues: validateEcpayConfig(config) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

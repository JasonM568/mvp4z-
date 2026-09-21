// 點數不足的統一錯誤。
//
// 起因：2026-09-21 使用者回報「免費方案會員點數用完，出現點數不足但沒有引導去訂閱頁」。
// 查證後發現三支 API 各說各話，而且都只回一個字串：
//
//   /api/ai/council            「點數不足，請先儲值或升級方案」
//   /api/ai/chat               「點數已用完，請續訂方案或啟用新方案」
//   /api/face-analysis/.../analyze  「完整面相報告需要 20 點，目前點數不足」
//
// 三句話、三種說法，而且前端拿到的只有 message。天機書的錯誤畫面因此只能給一顆
// 「返回修改」——但點數不足不是改表單能解決的事，那是把會員推進死路。
//
// 所以這裡做兩件事：
// 1. 給一個**機器可判讀的 code**，前端不必去比對中文字串（改文案就會壞）
// 2. 連同 required / remaining 一起回傳，前端才講得出「需要 20 點、你有 3 點」

export const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";

/** 會員方案頁。錯誤裡直接帶上，前端不用自己記路徑。 */
export const CREDITS_PURCHASE_PATH = "/member-pricing";

export type InsufficientCreditsDetails = {
  code: typeof INSUFFICIENT_CREDITS_CODE;
  /** 這次操作需要幾點。 */
  required: number;
  /** 會員目前剩幾點。 */
  remaining: number;
  /** 還差幾點。前端要顯示「再加購 N 點就可以」時用，不必自己相減。 */
  shortfall: number;
  /** 功能名稱，用於組訊息與前端標題。 */
  feature: string;
  purchasePath: typeof CREDITS_PURCHASE_PATH;
};

/**
 * 組出統一的點數不足錯誤。
 *
 * 訊息刻意寫成「需要 N 點、目前 M 點」而不是只說「點數不足」——
 * 會員看到具體差多少，才知道要買哪個方案；只說不足他得自己去別頁查餘額。
 *
 * 回 403 而非 402：402 Payment Required 在瀏覽器與中介層的處理不一致，
 * 而這裡的語意本來就是「已登入但無權執行」，403 更貼切也更好除錯。
 */
export function insufficientCreditsError(input: {
  feature: string;
  required: number;
  remaining: number;
}): Error & { status: number; code: string; details: InsufficientCreditsDetails } {
  const remaining = Math.max(0, Math.floor(input.remaining));
  const required = Math.max(0, Math.floor(input.required));
  const shortfall = Math.max(0, required - remaining);

  const message =
    `${input.feature}需要 ${required} 點，您目前剩 ${remaining} 點` +
    (shortfall > 0 ? `，還差 ${shortfall} 點` : "") +
    "。請先加購點數或升級方案，本次未扣點。";

  return Object.assign(new Error(message), {
    status: 403,
    code: INSUFFICIENT_CREDITS_CODE,
    details: {
      code: INSUFFICIENT_CREDITS_CODE,
      required,
      remaining,
      shortfall,
      feature: input.feature,
      purchasePath: CREDITS_PURCHASE_PATH
    } as InsufficientCreditsDetails
  });
}

/** 前端與測試共用的判斷式，避免各處自己比對字串。 */
export function isInsufficientCredits(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === INSUFFICIENT_CREDITS_CODE
  );
}

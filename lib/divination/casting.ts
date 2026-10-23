// 巽風易學｜當事人親手搖卦的紀錄與驗證
//
// 六爻必須由案主親手搖出，不能用時間推算，也不能是預設值。前端每搖一次記一筆
// （時間戳＋爻象），後端在扣點之前驗證；第一搖的時刻同時是全報告的問事時間
// （奇門起時家、梅花起卦、六爻月建日辰都用它）。
//
// 這裡的驗證擋的是「沒搖、預設值、時間不合理」。客戶端時間戳本質上無法被伺服器證明，
// 所以只做合理範圍檢查，不宣稱防得住刻意偽造。

export const CASTING_YAO_KINDS = ["少陽", "少陰", "老陽", "老陰"] as const;
export type CastingYao = (typeof CASTING_YAO_KINDS)[number];

export type CastingThrow = { at: string; yao: CastingYao };
export type Casting = { throws: CastingThrow[] };

/** 第一搖距今最久可接受多久。搖完到送出之間會員可能在改問題，但不該隔夜。 */
export const CASTING_MAX_AGE_MS = 60 * 60 * 1000;
/** 容許客戶端時鐘比伺服器快多少。 */
export const CASTING_CLOCK_SKEW_MS = 2 * 60 * 1000;
/** 六搖合計至少要花的時間。真人點六下不會在 1.5 秒內完成。 */
export const CASTING_MIN_SPAN_MS = 1500;

export type CastingCheck =
  | { ok: true; casting: Casting; firstAt: Date }
  | { ok: false; code: "CASTING_REQUIRED" | "CASTING_INVALID"; message: string };

const REQUIRED = {
  ok: false as const,
  code: "CASTING_REQUIRED" as const,
  message: "六爻需要由案主親手搖卦：請在畫面上搖滿六次再送出。本次未扣點。"
};

function invalid(message: string): CastingCheck {
  return { ok: false, code: "CASTING_INVALID", message: `${message}本次未扣點。` };
}

export function validateCasting(raw: unknown, nowMs: number = Date.now()): CastingCheck {
  const list = (raw as { throws?: unknown } | null | undefined)?.throws;
  if (!Array.isArray(list) || list.length === 0) return REQUIRED;
  if (list.length !== 6) return invalid("搖卦紀錄必須剛好六次。");

  const throws: CastingThrow[] = [];
  let previous = -Infinity;
  for (const item of list) {
    const at = (item as { at?: unknown })?.at;
    const yao = (item as { yao?: unknown })?.yao;
    if (typeof at !== "string" || typeof yao !== "string") return invalid("搖卦紀錄格式不正確。");
    if (!(CASTING_YAO_KINDS as readonly string[]).includes(yao)) return invalid("搖卦紀錄含有無效爻象。");
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) return invalid("搖卦時間格式不正確。");
    if (ms <= previous) return invalid("搖卦時間必須依序遞增。");
    previous = ms;
    throws.push({ at, yao: yao as CastingYao });
  }

  const firstMs = Date.parse(throws[0].at);
  const lastMs = Date.parse(throws[5].at);
  if (lastMs > nowMs + CASTING_CLOCK_SKEW_MS) return invalid("搖卦時間晚於現在。");
  if (nowMs - firstMs > CASTING_MAX_AGE_MS) return invalid("搖卦已超過一小時，請重新搖卦。");
  if (lastMs - firstMs < CASTING_MIN_SPAN_MS) return invalid("搖卦間隔過短，請逐次親手搖卦。");

  return { ok: true, casting: { throws }, firstAt: new Date(firstMs) };
}

/** 台北時間 "YYYY-MM-DD HH:mm"，與排盤橋接 parseClockString 吃的格式一致。 */
export function formatTaipeiClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** 三枚錢擲出的爻。正面記 3、反面記 2，三枚相加：6 老陰、7 少陽、8 少陰、9 老陽。 */
export function yaoFromCoins(heads: number): CastingYao {
  switch (heads) {
    case 0:
      return "老陰"; // 2+2+2 = 6
    case 1:
      return "少陽"; // 3+2+2 = 7
    case 2:
      return "少陰"; // 3+3+2 = 8
    default:
      return "老陽"; // 3+3+3 = 9
  }
}

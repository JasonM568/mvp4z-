// 巽風易學決策報告｜client-side API 呼叫封裝
// 對應後端 app/api/ai/council/route.ts

import { directionPayload, type CouncilForm, type CouncilModules } from "./_form-config";
import type { CouncilStructured } from "@/lib/ai/council/structured";

const TOKEN_KEY = "xunfeng_member_token";

// 先天八卦數：乾1 兌2 離3 震4 巽5 坎6 艮7 坤8
const XIANTIAN_TRIGRAMS = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
const MOVING_LINE_LABELS = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

function trigramFromNumber(value: string): string | null {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  const r = n % 8; // 餘 0 視為 8（坤）
  return XIANTIAN_TRIGRAMS[(r === 0 ? 8 : r) - 1];
}

function movingLineFromNumber(value: string): string | null {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  const r = n % 6; // 餘 0 視為 6（上爻）
  return MOVING_LINE_LABELS[(r === 0 ? 6 : r) - 1];
}

// 依起卦方式組梅花易數資料：
// - 數字起卦：使用者輸入三組數字，前端用先天八卦數換算上卦／下卦／動爻（確定性，不交給 LLM 算）。
// - 上下卦起卦：使用者直接選上卦／下卦＋動爻。
// - 時間起卦：不需手動卦象，後端依事件／起局時間起卦。
function buildMeihua(form: CouncilForm) {
  if (form.meihuaMode === "數字起卦") {
    const numbers = [form.meihuaNum1, form.meihuaNum2, form.meihuaNum3].filter((n) => n.trim() !== "");
    return {
      mode: form.meihuaMode,
      numbers,
      upperTrigram: trigramFromNumber(form.meihuaNum1),
      lowerTrigram: trigramFromNumber(form.meihuaNum2),
      movingLine: movingLineFromNumber(form.meihuaNum3)
    };
  }
  if (form.meihuaMode === "上下卦起卦") {
    return {
      mode: form.meihuaMode,
      upperTrigram: form.upperTrigram,
      lowerTrigram: form.lowerTrigram,
      movingLine: form.meihuaMovingLine
    };
  }
  // 時間起卦：起卦時間由後端統一取第一搖的時刻，前端不送時間。
  return { mode: form.meihuaMode };
}

/**
 * 「現在時間」一律取台北時間（UTC+8），不用瀏覽器所在時區。
 *
 * 原本直接讀 new Date() 的本地欄位，會員人在國外或裝置時區設錯，起出來的卦就是別的時辰的卦，
 * 而且沒有任何跡象——這種錯誤只會在事後對盤時才發現。
 * 用 Intl 的 Asia/Taipei 取代，裝置時區再怎麼設都不影響起卦時刻。
 */
export function formatNowTaipei(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    // h23 而非 hour12:false：部分實作在 hour12:false 下會把午夜輸出成 24。
    hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function getMemberToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

/** 用 refresh token 換新的 access token 並寫回 localStorage。換不到回空字串。 */
export async function refreshMemberToken(): Promise<string> {
  try {
    const refreshToken = window.localStorage.getItem("xunfeng_member_refresh");
    if (!refreshToken) return "";
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token) return "";
    window.localStorage.setItem(TOKEN_KEY, data.token);
    if (data.refresh_token) window.localStorage.setItem("xunfeng_member_refresh", data.refresh_token);
    return String(data.token);
  } catch {
    return "";
  }
}

export type CouncilApiResult = {
  ok?: boolean;
  error?: string;
  /** 機器可判讀的錯誤碼。前端據此決定要顯示哪種出口，不比對中文字串。 */
  code?: string;
  details?: Record<string, unknown>;
  /**
   * true = 我們沒收到伺服器的明確回應（連線中斷、504、WAF 擋頁），
   * 報告可能已經跑完並扣了點。false／未設 = 伺服器明確回了錯，報告確定沒產出。
   * 用途見 runCouncilReport 的說明。
   */
  transportFailed?: boolean;
  /** 報告已產出並計費，但寫入歷史紀錄出了問題。必須讓會員看到。 */
  persist_warning?: string | null;
  run_id?: string | null;
  final?: { ok: boolean; label: string; text: string };
  structured?: CouncilStructured | null;
  fallback_used?: boolean;
  credits_charged?: number;
  free_quota_used?: boolean;
  generated_at?: string;
  member?: any;
};

function eventTimeOf(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

export function buildCouncilPayload(form: CouncilForm, modules: CouncilModules) {
  return {
    question: form.question,
    context: form.context,
    topic: form.topic,
    deliverableMode: form.reportTemplate,
    clientProfile: [form.clientName || "未填", form.gender || "性別未填", form.identity]
      .filter(Boolean)
      .join("｜"),
    yixue: {
      clientName: form.clientName,
      gender: form.gender,
      identity: form.identity,
      birth: {
        calendar: form.calendarType,
        isLeapMonth: form.isLeapMonth,
        year: form.birthYear,
        month: form.birthMonth,
        day: form.birthDay,
        hourBranch: form.birthHourBranch,
        timeKnown: form.birthTimeKnown,
        // 以下為選填精度補充。空字串代表未填，後端會退回時辰中點與預設經度。
        hour: form.birthHour,
        minute: form.birthMinute,
        place: form.birthPlace
      },
      // 事件日期只是判讀背景（選填）；不再送時分，也不參與任何起局。
      ...(eventTimeOf(form.eventDate) ? { eventTime: eventTimeOf(form.eventDate) } : {}),
      // 搖卦紀錄：六爻爻象與全報告的問事時間（第一搖）都由它決定，後端在扣點前驗證。
      casting: { throws: form.castThrows },
      modules,
      // 起局時刻由後端取第一搖，這裡只說明起局方式與事件方位（白話方位＋後天八卦宮）。
      qimen: { mode: "第一搖時刻起局", direction: directionPayload(form.direction) },
      liuyao: { mode: "親手搖卦" },
      meihua: buildMeihua(form)
    },
    instruction:
      "保留原 v3 介面。內容產製必須經多重分身內部討論，但最終只呈現為風羿老師綜合判讀。"
  };
}

export async function runCouncilReport(payload: ReturnType<typeof buildCouncilPayload>): Promise<CouncilApiResult> {
  const token = getMemberToken();
  if (!token) {
    return { error: "尚未登入，請先登入會員。" };
  }
  // transportFailed 的用途：區分「伺服器明確回了一個錯」與「我們根本沒聽到回音」。
  //
  // 前者代表報告確定沒產出（點數不足、驗證失敗…），本地的「進行中」紀錄該清掉；
  // 後者代表報告可能已經跑完並扣了點，只是回應在路上掉了——那正是找回機制存在的理由，
  // 這種情況清掉紀錄會讓會員付了錢卻再也回不到那份報告。分不清就一律當後者。
  let res: Response;
  try {
    const send = (bearer: string) =>
      fetch("/api/ai/council", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`
        },
        body: JSON.stringify(payload)
      });
    res = await send(token);
    // 憑證剛好在送出瞬間過期（背景分頁被節流，保鮮來不及換）：換一張新的再送一次。
    // 401 在驗證身分那一步就擋下，尚未排盤、尚未呼叫模型、尚未扣點，重送不會重複扣。
    if (res.status === 401) {
      const fresh = await refreshMemberToken();
      if (fresh) res = await send(fresh);
    }
  } catch (err) {
    return { error: (err as Error)?.message || "連線中斷", transportFailed: true };
  }

  try {
    return (await res.json()) as CouncilApiResult;
  } catch {
    // 回的不是 JSON（Vercel 504、WAF 擋頁…）：伺服器那邊做到哪裡我們無從得知。
    return {
      error: `伺服器回應異常（HTTP ${res.status}）`,
      transportFailed: true
    };
  }
}

// 巽風易學決策報告｜client-side API 呼叫封裝
// 對應後端 app/api/ai/council/route.ts

import type { CouncilForm, CouncilModules } from "./_form-config";
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
  // 時間起卦：依「現在時間」或「自行輸入時間」決定起卦時間，交給後端／LLM 依時間推卦。
  const pad = (n: number) => String(n).padStart(2, "0");
  const time =
    form.meihuaTimeMode === "現在時間"
      ? formatNowTaipei()
      : `${form.eventYear}-${pad(form.eventMonth)}-${pad(form.eventDay)} ${pad(form.eventHour)}:${pad(form.eventMinute)}`;
  return { mode: form.meihuaMode, timeMode: form.meihuaTimeMode, time };
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

export type CouncilApiResult = {
  ok?: boolean;
  error?: string;
  final?: { ok: boolean; label: string; text: string };
  structured?: CouncilStructured | null;
  fallback_used?: boolean;
  credits_charged?: number;
  free_quota_used?: boolean;
  generated_at?: string;
  member?: any;
};

export function buildCouncilPayload(form: CouncilForm, modules: CouncilModules) {
  return {
    question: form.question,
    context: form.context,
    topic: form.topic,
    deliverableMode: form.reportTemplate,
    clientProfile: `${form.clientName || "未填"}｜${form.gender}`,
    yixue: {
      clientName: form.clientName,
      gender: form.gender,
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
      eventTime: {
        year: form.eventYear,
        month: form.eventMonth,
        day: form.eventDay,
        hour: form.eventHour,
        minute: form.eventMinute
      },
      modules,
      qimen: { mode: form.qimenTimeMode, direction: form.direction },
      liuyao: {
        mode: form.liuyaoMode,
        // 時間起卦才帶起卦時刻；選現在時間就取台北當下，否則用事件／起局時間。
        // 六爻無論哪種起卦方式都需要時刻——月建、日辰、旬空、六神全由它決定。
        timeMode: form.liuyaoMode === "時間起卦" ? form.liuyaoTimeMode : undefined,
        time:
          form.liuyaoMode === "時間起卦" && form.liuyaoTimeMode === "現在時間"
            ? formatNowTaipei()
            : undefined,
        yao: [form.yao1, form.yao2, form.yao3, form.yao4, form.yao5, form.yao6]
      },
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
  const res = await fetch("/api/ai/council", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return (await res.json()) as CouncilApiResult;
}

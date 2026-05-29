// 巽風易學決策報告｜client-side API 呼叫封裝
// 對應後端 app/api/ai/council/route.ts

import type { CouncilForm, CouncilModules } from "./_form-config";

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
      ? formatNow()
      : `${form.eventYear}-${pad(form.eventMonth)}-${pad(form.eventDay)} ${pad(form.eventHour)}:${pad(form.eventMinute)}`;
  return { mode: form.meihuaMode, timeMode: form.meihuaTimeMode, time };
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getMemberToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export type CouncilApiResult = {
  ok?: boolean;
  error?: string;
  final?: { ok: boolean; label: string; text: string };
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
        timeKnown: form.birthTimeKnown
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

// 巽風易學決策報告｜client-side API 呼叫封裝
// 對應後端 app/api/ai/council/route.ts

import type { CouncilForm, CouncilModules } from "./_form-config";

const TOKEN_KEY = "xunfeng_member_token";

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
      meihua: {
        mode: form.meihuaMode,
        upperTrigram: form.upperTrigram,
        lowerTrigram: form.lowerTrigram
      }
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

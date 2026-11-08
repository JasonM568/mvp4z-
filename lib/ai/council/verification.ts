// 「三方必到」：一份報告的校核，第一輪與第二輪的三個分身都要有回音，缺一家就不算完成。
//
// 起因（2026-11-07）：Gemini 與 DeepSeek 金鑰失效，每份報告只剩 OpenAI 一家意見，
// 終稿照樣由 OpenAI 寫出來、照樣以「正常」交付並扣 20 點——會員付了三方校核的錢，
// 拿到的是單方意見，而且畫面上沒有任何跡象。
//
// 各家 API 呼叫本身已有帶退避的重試（providers.ts withRetry），走到這裡還是失敗，
// 就是重試救不了的狀況（金鑰錯、模型停供、持續逾時），不該再硬交付。

import type { CouncilRole, ModelResult } from "./providers";

/** 每一輪都必須有回音的三個分身。 */
export const REQUIRED_ROLES: CouncilRole[] = ["openaiFengYi", "geminiFengYi", "deepseekAttack"];

export type VerificationFailure = {
  role: CouncilRole;
  /** 分身中文名（不含廠牌，會員端也可以顯示）。 */
  label: string;
  round: 1 | 2;
  error: string;
  status: number | null;
};

export type VerificationCheck = {
  complete: boolean;
  failures: VerificationFailure[];
};

function failuresOf(results: ModelResult[], round: 1 | 2): VerificationFailure[] {
  const out: VerificationFailure[] = [];
  for (const role of REQUIRED_ROLES) {
    const hit = results.find((r) => r.role === role);
    // 該輪根本沒有這一家的結果，與呼叫失敗同樣視為缺席。
    if (!hit) {
      out.push({ role, label: role, round, error: "該輪沒有回音", status: null });
    } else if (!hit.ok) {
      out.push({ role, label: hit.label, round, error: hit.error || "呼叫失敗", status: hit.status ?? null });
    }
  }
  return out;
}

/**
 * 檢查某一輪三家是否到齊。
 * 第二輪未啟用（ENABLE_DEBATE_ROUND=false）時只看第一輪，呼叫端傳 debate=null。
 */
export function checkRoundsComplete(first: ModelResult[], debate: ModelResult[] | null): VerificationCheck {
  const failures = [...failuresOf(first, 1), ...(debate ? failuresOf(debate, 2) : [])];
  return { complete: failures.length === 0, failures };
}

/** 失敗分身的去重中文名，用於報告標籤與後台標示（只含分身名，不含廠牌）。 */
export function failedPersonaNames(failures: VerificationFailure[]): string[] {
  return [...new Set(failures.map((f) => f.label.split("｜")[0]))];
}

/** 後台與歷史紀錄用的標籤。固定含「校核未完成」，後台靠它辨識。 */
export function incompleteFinalLabel(failures: VerificationFailure[]): string {
  return `風羿老師備援交付稿（校核未完成：${failedPersonaNames(failures).join("、")}）`;
}

/** 用來代替終稿的失敗結果：校核未完成時不呼叫終稿，省下最長最貴的一次呼叫。 */
export function skippedFinalResult(failures: VerificationFailure[]): ModelResult {
  return {
    role: "finalChatGPT",
    label: "風羿老師最終定稿分身",
    ok: false,
    text: "",
    error: `校核未完成，未產生終稿：${failedPersonaNames(failures).join("、")}`,
    status: null,
    attempts: 0,
    tokensIn: 0,
    tokensOut: 0
  };
}

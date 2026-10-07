// council_runs 的精簡備援寫入列。
//
// 完整寫入失敗時（通常是某個大 JSON 欄位出問題），改寫這一列，
// 至少讓會員付過錢的報告本文進得了歷史紀錄。
//
// 2026-10-08 QA：第一版漏了 `request`（資料表 NOT NULL）——備援路徑會 23502 失敗，
// 也就是這條「保命」的路徑從寫出來就沒成功過，因為從沒有真的對資料庫跑過。
// 這個函式存在的理由就是讓它有地方可以被測試。

export function buildMinimalRunRow(input: {
  userId: string;
  entitlementId: string;
  usageLogId: string | null;
  finalLabel: string;
  finalText: string;
  finalOk: boolean;
  fallbackUsed: boolean;
  creditsCharged: number;
  freeQuotaUsed: boolean;
  promptProfileId: string | null;
  question: string;
  topic?: string | null;
}) {
  return {
    user_id: input.userId,
    entitlement_id: input.entitlementId,
    usage_log_id: input.usageLogId,
    // NOT NULL。只放問題與主題這兩個小欄位：後台與「找回」都靠 request.question／topic 顯示。
    request: { question: input.question, topic: input.topic || "未指定" },
    final_label: input.finalLabel,
    final_text: input.finalText,
    final_ok: input.finalOk,
    fallback_used: input.fallbackUsed,
    credits_charged: input.creditsCharged,
    free_quota_used: input.freeQuotaUsed,
    prompt_profile_id: input.promptProfileId
  };
}

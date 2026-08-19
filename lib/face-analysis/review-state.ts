/**
 * 判讀規則的核對狀態。
 *
 * 關鍵在於「核對的是哪一版」：老師確認過的規則若之後被編輯，
 * DB trigger 會把 version 前進，此時原本的核對就對不上目前內容，必須重核。
 * 少了這個判斷，審核狀態會變成一個永遠不會失效的勾勾，形同虛設。
 */
export type ReviewableRule = Readonly<{
  version: number;
  reviewed_version: number | null;
  reviewed_at: string | null;
}>;

export type ReviewStatus = "reviewed" | "stale" | "pending";

export function reviewState(rule: ReviewableRule): ReviewStatus {
  if (rule.reviewed_at === null || rule.reviewed_version === null) return "pending";
  return rule.reviewed_version === rule.version ? "reviewed" : "stale";
}

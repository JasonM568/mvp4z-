// 巽風｜奇門校對簽核狀態載入
//
// 放在 lib/yixue 外面（要讀資料庫）。與流派載入同一個原則：任何失敗都當「未簽核」，
// 報告照常產出——簽核狀態讀不到，不能讓收費產品下線；而保守的預設就是「尚待校對」。

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { QIMEN_RULE_VERSION } from "@/lib/yixue/qimen/qimen";

export type QimenSignoffStatus = {
  signed: boolean;
  signedBy: string;
  /** YYYY-MM-DD（台北時間日期以 UTC 日期近似，僅供顯示）。 */
  signedAt: string;
  /** 最新一列紀錄的規則版本；沒有任何紀錄為 null。 */
  ruleVersion: string | null;
  /** 最新一列是否為「不通過」。後台用來提示「老師已回報有差異，待工程處理」。 */
  latestRejected: boolean;
};

const UNSIGNED: QimenSignoffStatus = { signed: false, signedBy: "", signedAt: "", ruleVersion: null, latestRejected: false };

const CACHE_TTL_MS = 60_000;
let cache: { value: QimenSignoffStatus; expiresAt: number } | null = null;

export function invalidateQimenSignoffCache() {
  cache = null;
}

/** 純函式：由最新一列決定狀態。拆出來是為了不用連資料庫就能測。 */
export function evaluateSignoff(
  row: { approved: boolean; rule_version: string; signed_by: string; created_at: string } | null | undefined,
  currentRuleVersion: string = QIMEN_RULE_VERSION
): QimenSignoffStatus {
  if (!row) return UNSIGNED;
  const sameRule = row.rule_version === currentRuleVersion;
  return {
    signed: row.approved && sameRule,
    signedBy: row.approved ? row.signed_by : "",
    signedAt: row.approved ? row.created_at.slice(0, 10) : "",
    ruleVersion: row.rule_version,
    latestRejected: !row.approved
  };
}

export async function loadQimenSignoff(now: number): Promise<QimenSignoffStatus> {
  if (cache && cache.expiresAt > now) return cache.value;
  let value = UNSIGNED;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("qimen_signoffs")
      .select("approved, rule_version, signed_by, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) value = evaluateSignoff(data);
  } catch {
    value = UNSIGNED;
  }
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** 給提示詞用：已簽核回「拍板人　日期」，否則空字串。 */
export function qimenSignatureText(s: QimenSignoffStatus): string {
  return s.signed ? `${s.signedBy}　${s.signedAt}` : "";
}

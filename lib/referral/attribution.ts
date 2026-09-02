import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_COOKIE = "xf_ref";
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;

/**
 * 代碼允許底線，而底線在 SQL LIKE 裡是「任一字元」萬用字元，
 * 直接丟給 ilike 會讓 AL_X 誤中 ALEX。查詢前一律先跳脫。
 */
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export type ReferralAttribution = {
  referral_partner_id: string;
  referral_code: string;
  referral_rate: number;
};

/** 從 cookie 讀出推廣碼；格式不合就當作沒有，不讓任意字串進 DB。 */
export function readReferralCode(request: NextRequest): string | null {
  const raw = request.cookies.get(REFERRAL_COOKIE)?.value;
  if (!raw) return null;
  const code = decodeURIComponent(raw).trim();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/**
 * 把推廣碼換成可寫入訂單的歸因欄位。
 * 查不到、或該業務已停用 → 回 null，訂單照常成立，只是不歸戶，
 * 絕不能因為推廣碼有問題就擋掉付款。
 */
export async function resolveReferral(
  admin: SupabaseClient,
  code: string | null
): Promise<ReferralAttribution | null> {
  if (!code) return null;
  try {
    const { data, error } = await admin
      .from("referral_partners")
      .select("id, code, commission_rate, is_active")
      .ilike("code", escapeLikePattern(code))
      .maybeSingle();
    if (error || !data || !data.is_active) return null;
    return {
      referral_partner_id: data.id as string,
      referral_code: data.code as string,
      referral_rate: Number(data.commission_rate || 0)
    };
  } catch {
    return null;
  }
}

/** 建立訂單時的一行式用法：讀 cookie → 查業務 → 回可直接 spread 進 insert 的欄位。 */
export async function referralFieldsForRequest(admin: SupabaseClient, request: NextRequest) {
  const attribution = await resolveReferral(admin, readReferralCode(request));
  return attribution || {};
}

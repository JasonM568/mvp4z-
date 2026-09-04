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
  try {
    const code = decodeURIComponent(raw).trim();
    return REFERRAL_CODE_PATTERN.test(code) ? code : null;
  } catch {
    // 損壞或惡意 cookie 不得影響下單；當作沒有推廣碼即可。
    return null;
  }
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

/** 讀這位會員註冊當下綁定的推廣碼（profiles.referral_code）。 */
async function readProfileReferralCode(admin: SupabaseClient, profileId: string) {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", profileId)
      .maybeSingle();
    if (error || !data?.referral_code) return null;
    const code = String(data.referral_code).trim();
    return REFERRAL_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * 建立訂單時的歸因：回可直接 spread 進 insert 的欄位。
 *
 * 優先序刻意是「註冊綁定 > cookie」：
 *   1. profiles.referral_code —— 這位會員是誰帶進來註冊的。一旦綁定就終身歸戶，
 *      不會因為 cookie 被清掉、換一台裝置、或中間點到別人的連結就跑掉。
 *      這是業務推廣的核心承諾：我帶進來的人，他之後的消費都算我的。
 *   2. cookie（?ref= 90 天 last-touch）—— 給「註冊時還沒有綁定」的既有會員用的退路。
 *
 * 查不到、或該業務已停用 → 不歸戶，但訂單照常成立。絕不能因為推廣碼有問題就擋掉付款。
 */
export async function referralFieldsForOrder(
  admin: SupabaseClient,
  request: NextRequest,
  profileId: string
) {
  const boundCode = await readProfileReferralCode(admin, profileId);
  const attribution =
    (await resolveReferral(admin, boundCode)) || (await resolveReferral(admin, readReferralCode(request)));
  return attribution || {};
}

/** 只看 cookie 的舊版本；課程報名等沒有會員身分的情境仍然用得到。 */
export async function referralFieldsForRequest(admin: SupabaseClient, request: NextRequest) {
  const attribution = await resolveReferral(admin, readReferralCode(request));
  return attribution || {};
}

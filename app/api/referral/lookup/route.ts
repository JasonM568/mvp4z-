import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { escapeLikePattern, REFERRAL_CODE_PATTERN } from "@/lib/referral/attribution";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 公開查詢：推廣碼 → 推廣人名字。
 * 註冊頁用來顯示「您是由 OOO 推薦加入」，讓訪客知道自己會被綁在誰底下。
 *
 * 只回名字，不回分潤比例、聯絡方式或內部 id —— 這支是完全公開的，
 * 任何人都能猜代碼來打，所以吐出去的東西必須是本來就會秀在頁面上的資訊。
 */
export async function GET(request: NextRequest) {
  const code = (new URL(request.url).searchParams.get("code") || "").trim();
  if (!REFERRAL_CODE_PATTERN.test(code)) return apiJson({ ok: false, partner: null });

  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("referral_partners")
      .select("name, is_active")
      .ilike("code", escapeLikePattern(code))
      .maybeSingle();

    if (error || !data || !data.is_active) return apiJson({ ok: false, partner: null });
    return apiJson({ ok: true, partner: { name: data.name } });
  } catch {
    return apiJson({ ok: false, partner: null });
  }
}

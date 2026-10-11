import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import {
  errorMessage,
  errorStatus,
  getPublicMember,
  readJson,
  redeemSchema,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, redeemSchema);
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin.rpc("redeem_activation_code", {
      p_code: input.code,
      p_user_id: profile.id
    });

    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.redeemed) {
      throw statusError("啟用碼不存在或已被使用", 400);
    }

    const member = await getPublicMember(profile.id);
    return apiJson({
      ok: true,
      plan: member.plan,
      credits_remaining: member.credits_remaining,
      expires_at: member.expires_at,
      member
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

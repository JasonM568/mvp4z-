// POST /api/auth/forgot-password
// 收 email → 呼叫 supabase admin generateLink 寄送密碼重設信。
// 為防 user enumeration：永遠回 200，不告訴前端 email 是否存在。
//
// 重設信內的 link 預設前綴 = Supabase Auth 設定的 site_url（已設 https://www.xunfeng.tw）。
// 我們明確帶 redirectTo 指向 /reset-password，需要該 URL 在 uri_allow_list 內（已加）。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, readJson } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const forgotSchema = z.object({
  email: z.string().trim().email("Email 格式錯誤").transform((v) => v.toLowerCase())
});

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, forgotSchema);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xunfeng.tw";
    const redirectTo = `${siteUrl.replace(/\/$/, "")}/reset-password`;

    const admin = createSupabaseAdminClient();
    // resetPasswordForEmail：若 email 不存在，supabase 也不會回錯（避免 enumeration）
    const { error } = await admin.auth.resetPasswordForEmail(input.email, { redirectTo });

    // 即使 supabase 回錯（例如 rate limit），也回 200 以隱藏細節；
    // 真正錯誤寫到 server log（next 預設 stdout）
    if (error) {
      console.warn("[forgot-password] supabase error", { email: input.email, error: error.message });
    }

    return apiJson({ ok: true });
  } catch (error) {
    // 只有 schema 驗證失敗才會走到這
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

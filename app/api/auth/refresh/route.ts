import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import {
  authResponse,
  createSupabasePasswordClient,
  ensureProfileForAuthUser,
  errorMessage,
  errorStatus,
  getPublicMember,
  statusError
} from "@/lib/auth/member";

/**
 * 用 refresh token 換一組新的 access token。
 *
 * 為什麼需要：Supabase 的 access token 只有 1 小時。前台把 token 存在 localStorage，
 * 過期之後畫面看起來還是「已登入」，直到送出結帳才炸成「登入已過期，請重新登入」，
 * 使用者填完發票資料才失敗，等於買不到東西。有了這支，前台碰到 401 可以自己換一張再重送。
 *
 * 不需要 Authorization header：refresh token 本身就是憑證。
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { refresh_token?: unknown };
    const refreshToken = String(body.refresh_token || "").trim();
    if (!refreshToken) throw statusError("缺少 refresh token", 400);

    const passwordClient = createSupabasePasswordClient();
    const { data, error } = await passwordClient.auth.refreshSession({ refresh_token: refreshToken });

    // refresh token 也可能過期或已被撤銷，這時就只能請使用者重新登入。
    if (error || !data.session || !data.user?.id || !data.user.email) {
      throw statusError("登入已過期，請重新登入", 401);
    }

    const profile = await ensureProfileForAuthUser({
      authUserId: data.user.id,
      email: data.user.email,
      name: typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : "",
      phone: typeof data.user.user_metadata?.phone === "string" ? data.user.user_metadata.phone : ""
    });
    const member = await getPublicMember(profile.id);

    return apiJson(authResponse(data.session, member));
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

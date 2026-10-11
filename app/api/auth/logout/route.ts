import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePasswordClient } from "@/lib/auth/member";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { refresh_token?: unknown };
    const refreshToken = String(body.refresh_token || "").trim();
    if (!refreshToken) return apiJson({ ok: true });

    // Rotate the supplied token, then revoke only the session represented by
    // the fresh access JWT. This avoids global sign-out and handles clients
    // that only send the refresh token to this endpoint.
    const passwordClient = createSupabasePasswordClient();
    const { data, error } = await passwordClient.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      const status = Number((error as { status?: unknown }).status);
      if (status === 400 || status === 401) return apiJson({ ok: true });
      throw error;
    }
    if (!data.session?.access_token) return apiJson({ ok: true });

    const { error: revokeError } = await createSupabaseAdminClient().auth.admin.signOut(
      data.session.access_token,
      "local"
    );
    if (revokeError) throw revokeError;

    return apiJson({ ok: true });
  } catch {
    return apiJson({ error: "登出未完成，請重試" }, 500);
  }
}

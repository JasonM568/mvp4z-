import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import {
  authResponse,
  createSupabasePasswordClient,
  ensureProfileForAuthUser,
  errorMessage,
  errorStatus,
  getPublicMember,
  readJson,
  registerSchema
} from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, registerSchema);
    const admin = createSupabaseAdminClient();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        phone: input.phone
      }
    });

    if (createError) throw createError;
    if (!created.user?.id || !created.user.email) throw new Error("建立會員失敗");

    const profile = await ensureProfileForAuthUser({
      authUserId: created.user.id,
      email: created.user.email,
      name: input.name,
      phone: input.phone
    });

    const passwordClient = createSupabasePasswordClient();
    const { data: sessionData, error: signInError } = await passwordClient.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });

    if (signInError) throw signInError;
    if (!sessionData.session) throw new Error("登入 session 建立失敗");

    const member = await getPublicMember(profile.id);
    return apiJson(authResponse(sessionData.session, member));
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

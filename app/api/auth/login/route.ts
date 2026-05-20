import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import {
  authResponse,
  createSupabasePasswordClient,
  ensureProfileForAuthUser,
  errorMessage,
  errorStatus,
  getPublicMember,
  loginSchema,
  readJson
} from "@/lib/auth/member";

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, loginSchema);
    const passwordClient = createSupabasePasswordClient();
    const { data, error } = await passwordClient.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });

    if (error) throw error;
    if (!data.user?.id || !data.user.email || !data.session) throw new Error("帳號或密碼錯誤");

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

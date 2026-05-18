import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, getPublicMember, requireBearerProfile } from "@/lib/auth/member";

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const member = await getPublicMember(profile.id);
    return apiJson({ ok: true, member });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

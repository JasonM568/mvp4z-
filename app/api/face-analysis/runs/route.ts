import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  readJson,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { createRun } from "@/lib/face-analysis/runs";
import { createFaceRunSchema } from "@/lib/face-analysis/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canUseFaceAnalysis } from "@/lib/auth/face-tier";
import { FACE_ANALYSIS_CONSENT_VERSION } from "@/lib/face-analysis/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, createFaceRunSchema);
    if (input.consentVersion !== FACE_ANALYSIS_CONSENT_VERSION) {
      throw statusError("隱私同意版本已更新，請重新整理頁面後再試", 400);
    }
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // 品質檢查是免費流程：只驗證方案有效，不限制剩餘點數。
    const { data: entitlements, error: entitlementError } = await admin
      .from("member_entitlements")
      .select("id, expires_at, plans(code)")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .gte("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(10);

    if (entitlementError) throw entitlementError;

    const entitlement = (entitlements || []).find((item) => {
      const plan = Array.isArray(item.plans) ? item.plans[0] : item.plans;
      return Boolean(plan?.code && canUseFaceAnalysis(plan.code));
    });

    if (!entitlement) {
      throw statusError("會員尚未啟用可使用面相分析的方案，或方案已到期", 403);
    }

    const run = await createRun({
      profileId: profile.id,
      entitlementId: entitlement.id,
      request: {
        ...input,
        subjectAge: input.subjectAge ?? null,
        thirdPartyConsent: input.thirdPartyConsent ?? false
      }
    });

    return apiJson({ ok: true, runId: run.id, status: run.status }, 201);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

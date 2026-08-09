import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  getPublicMember,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { FACE_ANALYSIS_CREDIT_COST, canUseFaceAnalysis } from "@/lib/auth/face-tier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { appendFaceRunEvent, getOwnedPublicRun, getOwnedRun } from "@/lib/face-analysis/runs";
import { downloadPrivateImage } from "@/lib/face-analysis/storage";
import { ConfiguredFaceVisionProvider } from "@/lib/face-analysis/vision-http";
import { runFaceVisionProvider } from "@/lib/face-analysis/vision";
import { applyFaceRules } from "@/lib/face-analysis/rules";
import { generateFaceReport, renderFaceReportText } from "@/lib/face-analysis/report";
import { faceQualityResultSchema } from "@/lib/face-analysis/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let activeRunId: string | null = null;
  let activeUserId: string | null = null;
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    activeRunId = id;
    activeUserId = profile.id;

    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("分析任務不存在", 404);
    if (run.status === "completed") {
      return apiJson({ ok: true, run: await getOwnedPublicRun(profile.id, id), member: await getPublicMember(profile.id) });
    }
    if (run.status !== "uploaded" && run.status !== "failed") {
      throw statusError("照片尚未通過品質檢測，或分析正在執行", 409);
    }
    if (!run.storage_path || !run.mime_type || !run.quality_result) {
      throw statusError("分析照片不完整，請重新上傳", 409);
    }

    const admin = createSupabaseAdminClient();
    const entitlement = await findEligibleEntitlement(profile.id);
    if (!entitlement) throw statusError("會員方案未啟用或已到期", 403);
    if (entitlement.credits_remaining < FACE_ANALYSIS_CREDIT_COST) {
      throw statusError(`完整面相報告需要 ${FACE_ANALYSIS_CREDIT_COST} 點，目前點數不足`, 403);
    }

    const { data: locked, error: lockError } = await admin
      .from("face_analysis_runs")
      .update({ status: "analyzing", error_code: null })
      .eq("id", run.id)
      .eq("user_id", profile.id)
      .in("status", ["uploaded", "failed"])
      .select("id")
      .maybeSingle();
    if (lockError) throw lockError;
    if (!locked) throw statusError("分析已由另一個請求啟動", 409);

    await appendFaceRunEvent({ runId: run.id, userId: profile.id, eventType: "analysis_started" });
    const bytes = await downloadPrivateImage(run.storage_path);
    const visionStartedAt = Date.now();
    const vision = await runFaceVisionProvider(new ConfiguredFaceVisionProvider(), {
      bytes,
      mimeType: run.mime_type as "image/jpeg" | "image/png" | "image/webp"
    });
    const rules = applyFaceRules({ vision, mode: run.mode, subjectAge: run.subject_age });
    const quality = faceQualityResultSchema.parse(run.quality_result);
    const generated = await generateFaceReport({
      mode: run.mode,
      subjectAge: run.subject_age,
      quality,
      rules
    });
    const reportText = renderFaceReportText(generated.report);
    const modelTrace = {
      vision: {
        provider: "configured_face_vision",
        model: process.env.FACE_VISION_MODEL || "organization-approved",
        latencyMs: Date.now() - visionStartedAt
      },
      report: generated.trace
    };

    const { error: reportWriteError } = await admin
      .from("face_analysis_runs")
      .update({
        entitlement_id: entitlement.id,
        vision_result: vision,
        report_structured: generated.report,
        report_text: reportText,
        model_trace: modelTrace
      })
      .eq("id", run.id)
      .eq("user_id", profile.id)
      .eq("status", "analyzing");
    if (reportWriteError) throw reportWriteError;

    const { data: usage, error: usageError } = await admin
      .from("usage_logs")
      .insert({
        user_id: profile.id,
        entitlement_id: entitlement.id,
        type: "face_analysis",
        prompt: `face_analysis:${run.mode}`,
        reply: generated.report.summary,
        tokens_input: generated.trace.tokensInput,
        tokens_output: generated.trace.tokensOutput
      })
      .select("id")
      .single();
    if (usageError) throw usageError;

    let creditsCharged = 0;
    let creditWarning: string | null = null;
    const { error: creditError } = await admin.rpc("commit_face_analysis_credit", {
      p_run_id: run.id,
      p_user_id: profile.id,
      p_entitlement_id: entitlement.id,
      p_usage_log_id: usage.id,
      p_charge: FACE_ANALYSIS_CREDIT_COST
    });

    if (creditError) {
      creditWarning = "報告已完成，但點數狀態在分析期間變更；本次未扣點。";
      const { error: giftError } = await admin
        .from("face_analysis_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          usage_log_id: usage.id,
          credits_charged: 0,
          error_code: "CREDIT_COMMIT_FAILED"
        })
        .eq("id", run.id)
        .eq("user_id", profile.id)
        .eq("status", "analyzing");
      if (giftError) throw giftError;
      await appendFaceRunEvent({
        runId: run.id,
        userId: profile.id,
        eventType: "credit_commit_failed",
        metadata: { code: creditError.code || "unknown" }
      });
    } else {
      creditsCharged = FACE_ANALYSIS_CREDIT_COST;
      await appendFaceRunEvent({
        runId: run.id,
        userId: profile.id,
        eventType: "analysis_completed",
        metadata: { creditsCharged }
      });
    }

    return apiJson({
      ok: true,
      run: await getOwnedPublicRun(profile.id, run.id),
      creditsCharged,
      creditWarning,
      member: await getPublicMember(profile.id)
    });
  } catch (error) {
    if (activeRunId && activeUserId) await markRunFailed(activeRunId, activeUserId, safeErrorCode(error));
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

async function findEligibleEntitlement(profileId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("member_entitlements")
    .select("id, credits_remaining, expires_at, plans(code)")
    .eq("user_id", profileId)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false });
  if (error) throw error;
  for (const entitlement of data || []) {
    const plan = Array.isArray(entitlement.plans) ? entitlement.plans[0] : entitlement.plans;
    if (plan?.code && canUseFaceAnalysis(plan.code)) {
      return { ...entitlement, credits_remaining: Number(entitlement.credits_remaining || 0) };
    }
  }
  return null;
}

async function markRunFailed(runId: string, userId: string, code: string) {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("face_analysis_runs")
      .update({ status: "failed", error_code: code })
      .eq("id", runId)
      .eq("user_id", userId)
      .eq("status", "analyzing");
    if (!error) {
      await appendFaceRunEvent({ runId, userId, eventType: "analysis_failed", metadata: { code } });
    }
  } catch {
    // 原始錯誤優先；不可把 provider payload 或照片寫入 log。
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && /^FACE_[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "ANALYSIS_FAILED";
}


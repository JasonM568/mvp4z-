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
import { matchTeachings } from "@/lib/face-analysis/teachings";
import { mapSurfaceImpacts } from "@/lib/face-analysis/surface-map";
import { generateFaceReport, renderFaceReportText } from "@/lib/face-analysis/report";
import { faceQualityResultSchema } from "@/lib/face-analysis/schema";
import { isFaceAnalysisEnabled } from "@/lib/face-analysis/config";
import { getPublishedFaceKnowledge } from "@/lib/face-analysis/knowledge";
import { getActiveFaceProviderApproval } from "@/lib/face-analysis/provider-approval";
import { selectedFaceVisionProvider } from "@/lib/face-analysis/vision-http";
import { loadPublishedFaceRuleProfile } from "@/lib/face-analysis/rule-profiles";
import { loadPublishedTeachingRules } from "@/lib/face-analysis/teaching-rules";

export const runtime = "nodejs";
// Vision 45s ＋ 報告 110s ＋ 下載與扣點寫入；舊值 120s 光是前兩段就用完了。
export const maxDuration = 300;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let activeRunId: string | null = null;
  let activeUserId: string | null = null;
  try {
    if (!isFaceAnalysisEnabled()) throw statusError("面相分析功能尚未開放", 404);
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    activeRunId = id;
    activeUserId = profile.id;

    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("分析任務不存在", 404);
    if (run.status === "completed") {
      return apiJson({ ok: true, run: await getOwnedPublicRun(profile.id, id), member: await getPublicMember(profile.id) });
    }
    if (run.status === "expired") {
      throw statusError("這次的照片已超過保存時間，請重新拍攝並建立新任務", 409);
    }
    if (run.status !== "uploaded" && run.status !== "failed") {
      throw statusError("照片尚未通過品質檢測，或分析正在執行", 409);
    }
    if (run.analysis_attempts >= 2) {
      throw statusError("此照片已達分析重試上限，請重新拍攝並建立新任務", 409);
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
      .update({ status: "analyzing", error_code: null, analysis_attempts: run.analysis_attempts + 1 })
      .eq("id", run.id)
      .eq("user_id", profile.id)
      .eq("deletion_pending", false)
      .in("status", ["uploaded", "failed"])
      .select("id")
      .maybeSingle();
    if (lockError) throw lockError;
    if (!locked) throw statusError("分析已由另一個請求啟動", 409);

    await appendFaceRunEvent({ runId: run.id, userId: profile.id, eventType: "analysis_started" });
    const bytes = await downloadPrivateImage(run.storage_path);
    const visionStartedAt = Date.now();
    const selectedVisionProvider = selectedFaceVisionProvider();
    const providerApproval = selectedVisionProvider === "openai" || selectedVisionProvider === "gemini"
      ? await getActiveFaceProviderApproval(selectedVisionProvider)
      : null;
    const visionProvider = new ConfiguredFaceVisionProvider(Boolean(providerApproval));
    const vision = await runFaceVisionProvider(visionProvider, {
      bytes,
      mimeType: run.mime_type as "image/jpeg" | "image/png" | "image/webp"
    });
    const ruleProfile = await loadPublishedFaceRuleProfile();
    // 老師在後台發布的判讀規則；沒有已發布規則時自動回退程式碼內建預設值。
    const teachingRules = await loadPublishedTeachingRules();
    const rules = applyFaceRules({
      vision,
      mode: run.mode,
      subjectAge: run.subject_age,
      profileSettings: ruleProfile?.settings,
      teachingRules
    });
    const quality = faceQualityResultSchema.parse(run.quality_result);

    // 硬性閘門：沒有任何面相學理依據就不出報告，也不扣點。
    //
    // 報告的內容來源是規則層算出來的 teachings（命中的老師條文）與 photoFingerprint
    // （已接上老師部位、宮位、流年與正反向條件的特徵指紋）。兩者皆空時，
    // 撰稿模型手上就只剩幾何數據，寫出來的東西等於純 AI 推理 —— 那不是我們要賣的東西。
    // 先前只靠 prompt 指示模型「要說沒有命中條文」，那是軟約束，擋不住這件事。
    if (rules.teachings.length === 0 && rules.photoFingerprint.length === 0) {
      await appendFaceRunEvent({
        runId: run.id,
        userId: profile.id,
        eventType: "analysis_blocked_no_doctrine",
        metadata: { teachingRulesVersion: rules.teachingRulesVersion }
      });
      throw Object.assign(
        new Error("這張照片可判讀的部位無法對應到任何面相學理條文，因此不產生報告，本次不扣點。請在光線均勻的環境正面重拍後再試一次。"),
        { status: 422, code: "FACE_NO_DOCTRINE_BASIS" }
      );
    }

    const approvedKnowledge = await getPublishedFaceKnowledge();
    const generated = await generateFaceReport({
      mode: run.mode,
      subjectAge: run.subject_age,
      quality,
      rules,
      surface: { surfaceFeatures: vision.surfaceFeatures, complexion: vision.complexion },
      knowledge: approvedKnowledge,
      collaborationAssessment: run.collaboration_assessment,
      collaborationProject: run.collaboration_project
    });
    const reportText = renderFaceReportText(generated.report);
    const modelTrace = {
      vision: {
        provider: visionProvider.name,
        model: visionProvider.model,
        latencyMs: Date.now() - visionStartedAt
      },
      report: generated.trace,
      knowledgeSources: approvedKnowledge.map((item) => item.cardId),
      // 老師版稽核資料：教材原文（含望診健康等 CRITICAL 敘述）只存在這裡。
      // model_trace 不在 PUBLIC_RUN_FIELDS，會員 API 讀不到，也不會送進撰稿模型。
      teacherAudit: {
        teachings: matchTeachings(vision, "teacher", teachingRules.teachings),
        surfaceImpacts: mapSurfaceImpacts(vision.surfaceFeatures, run.subject_age, teachingRules.surfaces).map((impact) => ({
          region: impact.region,
          type: impact.type,
          side: impact.side,
          palaces: impact.palaces,
          themes: impact.themes,
          teacherNote: impact.teacherNote,
          flowYearAges: impact.flowYearAges,
          sourcePages: impact.sourcePages
        })),
        flowYear: rules.flowYear
      }
    };

    const { error: reportWriteError } = await admin
      .from("face_analysis_runs")
      .update({
        entitlement_id: entitlement.id,
        vision_result: vision,
        report_structured: generated.report,
        report_text: reportText,
        model_trace: modelTrace,
        knowledge_sources_used: approvedKnowledge.map((item) => ({
          cardId: item.cardId,
          title: item.title,
          sourceFile: item.sourceFile,
          sourcePages: item.sourcePages
        })),
        face_rule_profile_id: ruleProfile?.id || null,
        face_rule_version: ruleProfile?.version || "shen-v2-default",
        face_teaching_rules_version: rules.teachingRulesVersion
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

    if (creditError?.code === "FA001") {
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
    } else if (creditError) {
      throw creditError;
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
    const retryableInfrastructureFailure = [
      "FACE_REPORT_PROVIDER_ERROR",
      "FACE_REPORT_PROVIDER_TIMEOUT",
      "FACE_REPORT_EMPTY_OUTPUT",
      "FACE_REPORT_SCHEMA_INVALID"
    ].includes(code);
    let analysisAttempts: number | undefined;
    if (retryableInfrastructureFailure) {
      const { data: current } = await admin
        .from("face_analysis_runs")
        .select("analysis_attempts")
        .eq("id", runId)
        .eq("user_id", userId)
        .maybeSingle();
      analysisAttempts = Math.max(0, Number(current?.analysis_attempts || 0) - 1);
    }
    const { error } = await admin
      .from("face_analysis_runs")
      .update({
        status: "failed",
        error_code: code,
        ...(analysisAttempts === undefined ? {} : { analysis_attempts: analysisAttempts })
      })
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
  // 帶 code 屬性的錯誤：使用者看中文 message，稽核記英文代碼。
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: unknown }).code || "");
    if (/^FACE_[A-Z0-9_]+$/.test(code)) return code;
  }
  if (error instanceof Error && /^FACE_[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "ANALYSIS_FAILED";
}

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CreateFaceRunInput } from "@/lib/face-analysis/schema";
import { FaceAnalysisRun, FaceRunPublicSummary } from "@/lib/face-analysis/types";
import { filterDeep, filterReportText } from "@/lib/safety/report-filter";
import { nominalAge } from "@/lib/face-analysis/age";

const PUBLIC_RUN_FIELDS = [
  "id",
  "request_id",
  "mode",
  "subject_age",
  "status",
  "quality_result",
  "report_structured",
  "report_text",
  "credits_charged",
  "image_deleted_at",
  "completed_at",
  "created_at",
  "updated_at"
].join(", ");

/**
 * 會員目前保存了幾份面相報告。
 *
 * 只算 completed：那是有報告內容、會員真正「存著」的那些。
 * failed 與 expired 沒有報告可看，deleted 已經被會員自己清掉，都不佔額度——
 * 否則一次失敗的分析會永久吃掉一格，而會員完全不知道為什麼。
 *
 * 用 head + count 不撈資料：這個數字每次列表與每次建立任務都會問一遍。
 */
export async function countStoredFaceReports(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  profileId: string
): Promise<number> {
  const { count, error } = await admin
    .from("face_analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profileId)
    .eq("status", "completed");
  if (error) throw error;
  return count || 0;
}

export async function createRun(input: {
  profileId: string;
  entitlementId?: string | null;
  request: CreateFaceRunInput;
}) {
  const admin = createSupabaseAdminClient();
  const payload = {
    request_id: input.request.requestId,
    user_id: input.profileId,
    entitlement_id: input.entitlementId || null,
    mode: input.request.mode,
    // 流年以虛歲對照部位：有出生年就由伺服器換算，不信任前端算好的歲數。
    subject_age: nominalAge(input.request.birthYear) ?? input.request.subjectAge,
    consent_version: input.request.consentVersion,
    third_party_consent: input.request.thirdPartyConsent,
    collaboration_assessment: input.request.collaborationAssessment,
    collaboration_project: input.request.collaborationAssessment ? input.request.collaborationProject : null,
    status: "created"
  };

  const { data, error } = await admin
    .from("face_analysis_runs")
    .upsert(payload, { onConflict: "request_id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;

  if (data) {
    await appendFaceRunEvent({
      runId: data.id,
      userId: input.profileId,
      eventType: "run_created",
      metadata: { mode: input.request.mode, consentVersion: input.request.consentVersion }
    });
    return data as FaceAnalysisRun;
  }

  const existing = await getOwnedRunByRequestId(input.profileId, input.request.requestId);
  if (!existing) throw new Error("無法建立面相分析任務");
  return existing;
}

export async function getOwnedRun(profileId: string, runId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("face_analysis_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data as FaceAnalysisRun | null) || null;
}

export async function getOwnedPublicRun(profileId: string, runId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("face_analysis_runs")
    .select(PUBLIC_RUN_FIELDS)
    .eq("id", runId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (error) throw error;
  const run = (data as FaceRunPublicSummary | null) || null;
  if (!run) return null;
  // 讀取時再過濾一次：禁令上線前產出的舊報告也不能把名號或醫療用語送到會員眼前。
  // 資料庫裡的原文不動，過濾只作用在回給會員的這一份。
  return {
    ...run,
    report_text: typeof run.report_text === "string" ? filterReportText(run.report_text).text : run.report_text,
    report_structured: run.report_structured ? filterDeep(run.report_structured).value : run.report_structured
  };
}

export async function appendFaceRunEvent(input: {
  runId: string;
  userId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("face_analysis_events").insert({
    run_id: input.runId,
    user_id: input.userId,
    event_type: input.eventType,
    metadata: input.metadata || {}
  });
  if (error) throw error;
}

export async function recordFaceUploadResult(input: {
  runId: string;
  userId: string;
  status: "uploaded" | "quality_rejected";
  storagePath: string | null;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  qualityResult: unknown;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("face_analysis_runs")
    .update({
      status: input.status,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      width: input.width,
      height: input.height,
      quality_result: input.qualityResult,
      error_code: input.status === "quality_rejected" ? "QUALITY_REJECTED" : null
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId)
    .in("status", ["created", "quality_rejected"])
    .select("id, status")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("分析任務狀態已變更，請重新整理");

  await appendFaceRunEvent({
    runId: input.runId,
    userId: input.userId,
    eventType: input.status === "uploaded" ? "quality_passed" : "quality_rejected",
    metadata: { reasons: qualityReasons(input.qualityResult) }
  });
  return data;
}

async function getOwnedRunByRequestId(profileId: string, requestId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("face_analysis_runs")
    .select("*")
    .eq("request_id", requestId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data as FaceAnalysisRun | null) || null;
}

function qualityReasons(value: unknown) {
  if (!value || typeof value !== "object" || !("reasons" in value)) return [];
  return Array.isArray(value.reasons) ? value.reasons : [];
}

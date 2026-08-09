import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CreateFaceRunInput } from "@/lib/face-analysis/schema";
import { FaceAnalysisRun, FaceRunPublicSummary } from "@/lib/face-analysis/types";

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
    subject_age: input.request.subjectAge,
    consent_version: input.request.consentVersion,
    third_party_consent: input.request.thirdPartyConsent,
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
  return (data as FaceRunPublicSummary | null) || null;
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

import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildFaceAudit } from "@/lib/face-analysis/audit";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data: run, error } = await admin
      .from("face_analysis_runs")
      .select(
        "id, request_id, user_id, entitlement_id, mode, subject_age, consent_version, third_party_consent, status, mime_type, file_size, width, height, quality_result, vision_result, report_structured, report_text, model_trace, usage_log_id, credits_charged, error_code, image_expires_at, image_deleted_at, completed_at, deleted_at, created_at, updated_at, profiles!face_analysis_runs_user_id_fkey(email, name)"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!run) return apiJson({ error: "找不到該面相分析紀錄" }, 404);

    const { data: events, error: eventError } = await admin
      .from("face_analysis_events")
      .select("id, event_type, metadata, created_at")
      .eq("run_id", id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (eventError) throw eventError;

    // 教材依據稽核鏈：Vision 觀測 → 命中條件 → 教材條文與頁碼 → 報告是否引用。
    const audit = buildFaceAudit({
      visionResult: run.vision_result,
      reportStructured: run.report_structured,
      modelTrace: run.model_trace
    });

    // storage_path is deliberately omitted. This endpoint never creates previews.
    return NextResponse.json(
      { ok: true, run, events: events || [], audit },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

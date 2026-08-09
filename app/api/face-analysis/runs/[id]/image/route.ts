import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { appendFaceRunEvent, getOwnedRun } from "@/lib/face-analysis/runs";
import { deleteRunImage } from "@/lib/face-analysis/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    if (!isUuid(id)) throw statusError("找不到該面相記錄", 404);

    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("找不到該面相記錄", 404);
    if (run.status === "analyzing") throw statusError("報告正在分析，請完成後再刪除照片", 409);
    if (!run.storage_path || run.image_deleted_at) {
      return apiJson({ ok: true, runId: run.id, imageDeletedAt: run.image_deleted_at });
    }

    const admin = createSupabaseAdminClient();
    const { data: claimed, error: claimError } = await admin
      .from("face_analysis_runs")
      .update({ deletion_pending: true })
      .eq("id", id)
      .eq("user_id", profile.id)
      .eq("deletion_pending", false)
      .neq("status", "analyzing")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw statusError("照片正在分析或刪除中，請稍後再試", 409);

    try {
      await deleteRunImage(run.storage_path);
    } catch (error) {
      await admin.from("face_analysis_runs").update({ deletion_pending: false }).eq("id", id).eq("user_id", profile.id);
      throw error;
    }

    const deletedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("face_analysis_runs")
      .update({ storage_path: null, image_deleted_at: deletedAt, deletion_pending: false })
      .eq("id", id)
      .eq("user_id", profile.id)
      .eq("deletion_pending", true)
      .select("id, image_deleted_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("照片狀態已變更，請重新整理後再試", 409);

    await appendFaceRunEvent({
      runId: id,
      userId: profile.id,
      eventType: "image_deleted_by_member"
    });
    return apiJson({ ok: true, runId: data.id, imageDeletedAt: data.image_deleted_at });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

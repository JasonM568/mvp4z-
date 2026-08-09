import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { appendFaceRunEvent, getOwnedPublicRun, getOwnedRun } from "@/lib/face-analysis/runs";
import { deleteRunImage } from "@/lib/face-analysis/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    if (!isUuid(id)) throw statusError("找不到該面相報告", 404);

    const run = await getOwnedPublicRun(profile.id, id);
    if (!run) throw statusError("找不到該面相報告", 404);
    return apiJson({ ok: true, run });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    if (!isUuid(id)) throw statusError("找不到該面相報告", 404);

    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("找不到該面相報告", 404);
    if (run.status === "analyzing") throw statusError("報告正在分析，請完成後再刪除", 409);
    if (run.status === "deleted") {
      return apiJson({ ok: true, deleted: minimalStub(run) });
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
    if (!claimed) throw statusError("報告正在分析或刪除中，請稍後再試", 409);

    try {
      await deleteRunImage(run.storage_path);
    } catch (error) {
      await admin.from("face_analysis_runs").update({ deletion_pending: false }).eq("id", id).eq("user_id", profile.id);
      throw error;
    }

    const { data, error } = await admin.rpc("redact_face_analysis_run", {
      p_run_id: id,
      p_user_id: profile.id
    });
    if (error) throw error;

    await appendFaceRunEvent({
      runId: id,
      userId: profile.id,
      eventType: "run_deleted",
      metadata: { imageDeleted: Boolean(run.storage_path) }
    });
    return apiJson({ ok: true, deleted: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

function minimalStub(run: {
  id: string;
  credits_charged: number;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}) {
  return {
    id: run.id,
    credits_charged: run.credits_charged,
    created_at: run.created_at,
    completed_at: run.completed_at,
    deleted_at: run.deleted_at
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

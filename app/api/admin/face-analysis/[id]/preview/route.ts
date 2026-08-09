import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPrivateImagePreview } from "@/lib/face-analysis/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin(request);
    if (!actor.profile) throw statusError("照片預覽必須使用具名管理員帳號登入", 403);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data: run, error } = await admin
      .from("face_analysis_runs")
      .select("id, user_id, storage_path, image_expires_at, image_deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!run) throw statusError("找不到面相分析紀錄", 404);
    if (!run.storage_path || run.image_deleted_at) throw statusError("原始照片已刪除", 410);
    if (Date.parse(run.image_expires_at) <= Date.now()) throw statusError("原始照片已超過保存期限", 410);

    const createdAt = new Date().toISOString();
    const { error: requestedEventError } = await admin.from("face_analysis_events").insert({
      run_id: run.id,
      user_id: run.user_id,
      event_type: "admin_image_preview_requested",
      metadata: { adminUserId: actor.profile.id, createdAt }
    });
    if (requestedEventError) throw requestedEventError;
    await writeAdminAudit({
      adminUserId: actor.profile.id,
      action: "face_analysis.image_preview_requested",
      targetType: "face_analysis_run",
      targetId: run.id,
      metadata: { createdAt }
    });

    const url = await createPrivateImagePreview(run.storage_path);
    const { error: issuedEventError } = await admin.from("face_analysis_events").insert({
      run_id: run.id,
      user_id: run.user_id,
      event_type: "admin_image_preview_issued",
      metadata: { adminUserId: actor.profile.id, createdAt: new Date().toISOString() }
    });
    if (issuedEventError) throw issuedEventError;
    return apiJson({ ok: true, url, expiresIn: 300 });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

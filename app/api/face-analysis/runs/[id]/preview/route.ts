import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { appendFaceRunEvent, getOwnedRun } from "@/lib/face-analysis/runs";
import { createPrivateImagePreview } from "@/lib/face-analysis/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("分析任務不存在", 404);
    if (!run.storage_path || run.image_deleted_at) throw statusError("原始照片已刪除", 410);
    if (Date.parse(run.image_expires_at) <= Date.now()) throw statusError("原始照片已超過保存期限", 410);

    const url = await createPrivateImagePreview(run.storage_path);
    await appendFaceRunEvent({ runId: run.id, userId: profile.id, eventType: "member_image_previewed" });
    return apiJson({ ok: true, url, expiresIn: 300 });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}


import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { normalizeAndInspectFaceImage, FaceImageError } from "@/lib/face-analysis/image";
import {
  FaceQualityProviderError,
  inspectFaceGeometry
} from "@/lib/face-analysis/quality-provider";
import { evaluateFaceQuality } from "@/lib/face-analysis/quality";
import { getOwnedRun, recordFaceUploadResult } from "@/lib/face-analysis/runs";
import { storePrivateImage } from "@/lib/face-analysis/storage";
import { FACE_IMAGE_MAX_BYTES } from "@/lib/face-analysis/config";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;
    if (!isUuid(id)) throw statusError("分析任務不存在", 404);

    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("分析任務不存在", 404);
    if (!(["created", "quality_rejected"] as string[]).includes(run.status)) {
      throw statusError("此分析任務目前不能重新上傳照片", 409);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > FACE_IMAGE_MAX_BYTES + 1_000_000) {
      throw statusError("照片大小必須在 10 MB 以內", 413);
    }

    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) throw statusError("請選擇一張照片", 400);
    if (image.size < 1 || image.size > FACE_IMAGE_MAX_BYTES) {
      throw statusError("照片大小必須在 10 MB 以內", 413);
    }

    const normalized = await normalizeAndInspectFaceImage(await image.arrayBuffer());
    const observation = await inspectFaceGeometry({
      bytes: normalized.bytes,
      mimeType: normalized.mimeType
    });
    const quality = evaluateFaceQuality({
      blurScore: normalized.blurScore,
      brightnessScore: normalized.brightnessScore,
      observation
    });

    let storagePath: string | null = null;
    if (quality.passed) {
      storagePath = await storePrivateImage({
        profileId: profile.id,
        runId: run.id,
        mimeType: normalized.mimeType,
        bytes: toArrayBuffer(normalized.bytes)
      });
    }

    await recordFaceUploadResult({
      runId: run.id,
      userId: profile.id,
      status: quality.passed ? "uploaded" : "quality_rejected",
      storagePath,
      mimeType: normalized.mimeType,
      fileSize: normalized.fileSize,
      width: normalized.width,
      height: normalized.height,
      qualityResult: quality
    });

    return apiJson({
      ok: true,
      runId: run.id,
      status: quality.passed ? "uploaded" : "quality_rejected",
      quality: toPublicQuality(quality)
    });
  } catch (error) {
    if (error instanceof FaceImageError) {
      return apiJson({ error: error.message, code: error.code }, error.code === "FILE_TOO_LARGE" ? 413 : 400);
    }
    if (error instanceof FaceQualityProviderError) {
      return apiJson({ error: error.message, code: error.code }, error.status);
    }
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

function toPublicQuality(quality: ReturnType<typeof evaluateFaceQuality>) {
  return {
    passed: quality.passed,
    faceCount: quality.faceCount,
    sharpness: quality.blurScore >= 0.75 ? "good" : quality.blurScore >= 0.55 ? "acceptable" : "retake",
    lighting:
      quality.brightnessScore < 0.25
        ? "too_dark"
        : quality.brightnessScore > 0.92
          ? "too_bright"
          : "acceptable",
    pose: quality.reasons.includes("POSE_NOT_FRONT") ? "retake" : "front",
    reasons: quality.reasons
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}


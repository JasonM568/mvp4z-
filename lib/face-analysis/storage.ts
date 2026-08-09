import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  FACE_ANALYSIS_BUCKET,
  FACE_SIGNED_URL_TTL_SECONDS
} from "@/lib/face-analysis/config";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function buildFaceImagePath(input: {
  profileId: string;
  runId: string;
  mimeType: string;
}) {
  const extension = EXTENSION_BY_MIME[input.mimeType];
  if (!extension) throw new Error("不支援的照片格式");
  return `${input.profileId}/${input.runId}/source.${extension}`;
}

export async function storePrivateImage(input: {
  profileId: string;
  runId: string;
  mimeType: string;
  bytes: ArrayBuffer;
}) {
  const admin = createSupabaseAdminClient();
  const path = buildFaceImagePath(input);
  const { error } = await admin.storage.from(FACE_ANALYSIS_BUCKET).upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
    cacheControl: "private, max-age=0, no-store"
  });
  if (error) throw error;
  return path;
}

export async function createPrivateImagePreview(storagePath: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(FACE_ANALYSIS_BUCKET)
    .createSignedUrl(storagePath, FACE_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteRunImage(storagePath: string | null | undefined) {
  if (!storagePath) return false;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(FACE_ANALYSIS_BUCKET).remove([storagePath]);
  if (error) throw error;
  return true;
}

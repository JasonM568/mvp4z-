import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  FACE_ANALYSIS_BUCKET,
  FACE_REPORT_PDF_BUCKET,
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
  assertFaceStoragePath(storagePath);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(FACE_ANALYSIS_BUCKET)
    .createSignedUrl(storagePath, FACE_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadPrivateImage(storagePath: string) {
  assertFaceStoragePath(storagePath);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(FACE_ANALYSIS_BUCKET).download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteRunImage(storagePath: string | null | undefined) {
  if (!storagePath) return false;
  assertFaceStoragePath(storagePath);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(FACE_ANALYSIS_BUCKET).remove([storagePath]);
  if (error) throw error;
  return true;
}

function assertFaceStoragePath(storagePath: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.(jpg|png|webp)$/i.test(storagePath)) {
    throw new Error("FACE_STORAGE_PATH_INVALID");
  }
}


// ---------------------------------------------------------------- 報告 PDF

/** PDF 路徑與照片同構（會員／報告／檔名），方便刪除時一併處理。 */
export function buildFacePdfPath(profileId: string, runId: string) {
  return `${profileId}/${runId}/report.pdf`;
}

function assertFacePdfPath(storagePath: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/report\.pdf$/i.test(storagePath)) {
    throw new Error("FACE_PDF_PATH_INVALID");
  }
}

/**
 * 取已存的 PDF。沒有就回 null——第一次下載時才產生。
 *
 * 不在分析完成當下就產：analyze 那條路徑已經在跟 maxDuration 賽跑，
 * 多塞一個 PDF 產生會讓「報告產好了卻因為逾時被砍掉」的風險上升。
 */
export async function fetchStoredFacePdf(storagePath: string): Promise<Buffer | null> {
  assertFacePdfPath(storagePath);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(FACE_REPORT_PDF_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** 存 PDF。upsert 讓報告內容更新後重產不會卡在「已存在」。 */
export async function storeFacePdf(storagePath: string, bytes: Buffer) {
  assertFacePdfPath(storagePath);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(FACE_REPORT_PDF_BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "private, max-age=0, no-store"
  });
  if (error) throw error;
}

/**
 * 刪 PDF。會員刪報告時必須一併刪掉——
 * 報告從資料庫消失但 PDF 還躺在儲存桶裡，那不叫刪除。
 */
export async function deleteFacePdf(profileId: string, runId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(FACE_REPORT_PDF_BUCKET)
    .remove([buildFacePdfPath(profileId, runId)]);
  // 檔案本來就不存在不算錯：第一次下載前刪報告是正常情況。
  if (error && !/not found/i.test(error.message)) throw error;
}

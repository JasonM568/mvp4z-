import { NextRequest } from "next/server";
import { apiJson } from "../../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// 後台上傳海報／宣傳影片：先跟這支 API 換一個 signed upload URL，
// 瀏覽器再直接把檔案 PUT 到 Supabase Storage。
// 這樣不經過 Vercel function，就不會撞到 4.5MB request body 上限（大海報、影片都會超過）。
const BUCKET = "site-media";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mimeType = String(body.mime_type || "").toLowerCase();
    const sizeBytes = Number(body.size_bytes || 0);
    const kind = body.kind === "video" ? "video" : "image";

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw statusError("檔案不可為空", 400);

    let extension = "";
    if (kind === "video") {
      extension = VIDEO_TYPES[mimeType];
      if (!extension) throw statusError("影片只接受 MP4 / WebM / MOV（建議 MP4，H.264 編碼）", 400);
      if (sizeBytes > MAX_VIDEO_BYTES) throw statusError("單支影片不可超過 200MB", 413);
    } else {
      extension = IMAGE_TYPES[mimeType];
      if (!extension) throw statusError("只接受 JPG / PNG / WebP / GIF 圖片", 400);
      if (sizeBytes > MAX_IMAGE_BYTES) throw statusError("單張圖片不可超過 10MB", 413);
    }

    const folder = String(body.folder || "general").replace(/[^a-z0-9-]/gi, "") || "general";
    const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(objectPath);
    if (error || !data) {
      const message = error?.message || "無法建立上傳網址";
      if (/bucket not found/i.test(message)) {
        throw statusError("Storage bucket site-media 尚未建立，請先套用 supabase/migrations 內的 site_content_cms migration。", 503);
      }
      throw statusError(message, 500);
    }

    const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
    await writeAdminAudit({
      adminUserId: auth.profile?.id,
      action: "site_content.media_sign",
      targetType: "storage_object",
      targetId: objectPath,
      metadata: { size_bytes: sizeBytes, mime_type: mimeType, kind }
    });

    return apiJson(
      {
        ok: true,
        upload_url: data.signedUrl,
        token: data.token,
        path: objectPath,
        url: publicData.publicUrl,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      },
      201
    );
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

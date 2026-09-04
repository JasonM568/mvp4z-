import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// 後台上傳課程海報／案例照片。bucket 是 public，回傳的網址可直接寫進內容欄位。
const BUCKET = "site-media";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw statusError("請選擇圖片檔", 400);
    if (!file.size) throw statusError("檔案不可為空", 400);
    if (file.size > MAX_BYTES) throw statusError("單張圖片不可超過 10MB", 413);

    const extension = EXTENSIONS[file.type];
    if (!extension) throw statusError("只接受 JPG / PNG / WebP / GIF 圖片", 400);

    const folder = String(form.get("folder") || "general").replace(/[^a-z0-9-]/gi, "") || "general";
    const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false
      });
    if (uploadError) {
      if (/bucket not found/i.test(uploadError.message)) {
        throw statusError(
          "Storage bucket site-media 尚未建立，請先執行 supabase/migrations/20260901154318_site_content_cms.sql。",
          503
        );
      }
      throw statusError(uploadError.message, 500);
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
    await writeAdminAudit({
      adminUserId: auth.profile?.id,
      action: "site_content.media_upload",
      targetType: "storage_object",
      targetId: objectPath,
      metadata: { size_bytes: file.size, mime_type: file.type }
    });
    return apiJson({ ok: true, url: data.publicUrl, path: objectPath }, 201);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

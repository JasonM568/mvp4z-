import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  countChars,
  decodeTextFile,
  hasAllowedExtension,
  MAX_FILE_BYTES,
  normalizeText
} from "@/lib/documents/text";
import { DOCUMENT_CHAR_BUDGET } from "@/lib/ai/council/settings/schema";

const BUCKET = "yixue-documents";
const CATEGORIES = new Set(["principle", "case", "teaching", "reference"]);
const TERMS = new Set(["bazi", "qimen", "liuyao", "meihua"]);

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await createSupabaseAdminClient()
      .from("ai_documents")
      .select(
        "id,title,category,term,original_name,mime_type,size_bytes,char_count,include_in_prompt,created_at,updated_at"
      )
      .order("created_at", { ascending: false });

    if (error?.code === "42P01") {
      return apiJson({
        ok: true,
        documents: [],
        char_budget: DOCUMENT_CHAR_BUDGET,
        included_chars: 0,
        setup_required:
          "資料表尚未建立，請先執行 supabase/migrations/20260809141108_prompt_profiles_and_documents.sql。"
      });
    }
    if (error) throw statusError(error.message, 500);

    const documents = data || [];
    const includedChars = documents.reduce(
      (sum, document) => sum + (document.include_in_prompt ? document.char_count : 0),
      0
    );
    return apiJson({
      ok: true,
      documents,
      char_budget: DOCUMENT_CHAR_BUDGET,
      included_chars: includedChars
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;
  try {
    const adminAuth = await requireAdmin(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw statusError("請選擇文字檔", 400);
    if (!file.size) throw statusError("檔案不可為空", 400);
    if (file.size > MAX_FILE_BYTES) throw statusError("單檔不可超過 2MB", 413);
    if (!hasAllowedExtension(file.name)) throw statusError("目前只接受 .txt 與 .md", 400);

    const title = String(form.get("title") || file.name.replace(/\.[^.]+$/, "")).trim();
    const category = String(form.get("category") || "reference");
    const termValue = String(form.get("term") || "");
    if (!title || title.length > 160) throw statusError("標題需為 1 至 160 字", 400);
    if (!CATEGORIES.has(category)) throw statusError("文件分類不正確", 400);
    if (termValue && !TERMS.has(termValue)) throw statusError("術別不正確", 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeTextFile(bytes);
    const text = normalizeText(decoded.text);
    const charCount = countChars(text);
    if (!text || !charCount) throw statusError("檔案沒有可讀取的文字", 400);

    const extension = file.name.toLowerCase().endsWith(".md") ? "md" : "txt";
    uploadedPath = `${adminAuth.profile?.id || "admin-key"}/${crypto.randomUUID()}.${extension}`;
    const admin = createSupabaseAdminClient();
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(uploadedPath, bytes, {
      contentType: extension === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
      upsert: false
    });
    if (uploadError) throw statusError(uploadError.message, 500);

    const { data, error } = await admin
      .from("ai_documents")
      .insert({
        title,
        category,
        term: termValue || null,
        storage_path: uploadedPath,
        original_name: file.name.slice(0, 255),
        mime_type: extension === "md" ? "text/markdown" : "text/plain",
        size_bytes: file.size,
        extracted_text: text,
        char_count: charCount,
        include_in_prompt: false,
        created_by: adminAuth.profile?.id || null
      })
      .select("id,title,char_count,include_in_prompt")
      .single();
    if (error) {
      await admin.storage.from(BUCKET).remove([uploadedPath]);
      uploadedPath = null;
      throw statusError(error.message, 500);
    }

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "documents.upload",
      targetType: "ai_document",
      targetId: data.id,
      metadata: { original_name: file.name.slice(0, 255), chars: charCount, encoding: decoded.encoding }
    });
    return apiJson({ ok: true, document: data }, 201);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_CHAR_BUDGET } from "@/lib/ai/council/settings/schema";

const BUCKET = "yixue-documents";
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    category: z.enum(["principle", "case", "teaching", "reference"]).optional(),
    term: z.enum(["bazi", "qimen", "liuyao", "meihua"]).nullable().optional(),
    include_in_prompt: z.boolean().optional()
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminAuth = await requireAdmin(request);
    const { id } = await params;
    const input = await readJson(request, updateSchema);
    if (!Object.keys(input).length) throw statusError("沒有可更新的欄位", 400);

    const admin = createSupabaseAdminClient();
    if (input.include_in_prompt === true) {
      const { data: current, error: currentError } = await admin
        .from("ai_documents")
        .select("char_count")
        .eq("id", id)
        .single();
      if (currentError) throw statusError("找不到文件", 404);

      const included = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin
          .from("ai_documents")
          .select("id,char_count")
          .eq("include_in_prompt", true)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + 999);
        if (error) throw statusError(error.message, 500);
        included.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
      const nextTotal = included
        .filter((document) => document.id !== id)
        .reduce((sum, document) => sum + document.char_count, current.char_count);
      if (nextTotal > DOCUMENT_CHAR_BUDGET) {
        throw statusError(
          `勾選後共 ${nextTotal.toLocaleString()} 字，超過規則庫 ${DOCUMENT_CHAR_BUDGET.toLocaleString()} 字上限；檔案已保存，請依主題拆分並只勾選要啟用的部分`,
          400
        );
      }
    }

    const { data, error } = await admin
      .from("ai_documents")
      .update(input)
      .eq("id", id)
      .select("id,title,category,term,char_count,include_in_prompt,updated_at")
      .single();
    if (error) throw statusError(error.code === "PGRST116" ? "找不到文件" : error.message, error.code === "PGRST116" ? 404 : 500);

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "documents.update",
      targetType: "ai_document",
      targetId: id,
      metadata: { fields: Object.keys(input), include_in_prompt: data.include_in_prompt }
    });
    return apiJson({ ok: true, document: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminAuth = await requireAdmin(request);
    const { id } = await params;
    const admin = createSupabaseAdminClient();
    const { data: document, error: findError } = await admin
      .from("ai_documents")
      .select("id,title,storage_path")
      .eq("id", id)
      .single();
    if (findError) throw statusError("找不到文件", 404);

    const { error: removeError } = await admin.storage.from(BUCKET).remove([document.storage_path]);
    if (removeError) throw statusError(`刪除檔案失敗：${removeError.message}`, 500);

    const { error: deleteError } = await admin.from("ai_documents").delete().eq("id", id);
    if (deleteError) throw statusError(deleteError.message, 500);

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: "documents.delete",
      targetType: "ai_document",
      targetId: id,
      metadata: { title: document.title }
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

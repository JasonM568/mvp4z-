import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { requireNamedAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({ expectedVersion: z.number().int().positive(), title: z.string().trim().min(1).max(200).optional(), category: z.string().trim().min(1).max(100).optional(), school: z.string().trim().max(160).nullable().optional(), technique: z.string().trim().max(160).nullable().optional(), observation: z.string().max(10000).optional(), teacherOriginal: z.string().max(20000).nullable().optional(), editorSummary: z.string().max(10000).nullable().optional(), ruleCondition: z.record(z.unknown()).optional(), safetyLevel: z.enum(["standard", "high", "critical"]).optional(), autoReport: z.boolean().optional(), sourceFile: z.string().max(300).nullable().optional(), sourcePages: z.array(z.number().int().positive()).max(100).optional(), status: z.enum(["draft", "teacher_review", "published", "archived"]).optional(), changeNote: z.string().max(500).nullable().optional() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireNamedAdmin(request); const { id } = await params; const body = patchSchema.parse(await request.json()); const client = createSupabaseAdminClient();
    const map: Record<string, string> = { title: "title", category: "category", school: "school", technique: "technique", observation: "observation", teacherOriginal: "teacher_original", editorSummary: "editor_summary", ruleCondition: "rule_condition", safetyLevel: "safety_level", autoReport: "auto_report", sourceFile: "source_file", sourcePages: "source_pages", status: "status" };
    const payload: Record<string, unknown> = { id, expected_version: body.expectedVersion, change_note: body.changeNote || null };
    for (const [key, column] of Object.entries(map)) if (key in body) payload[column] = (body as Record<string, unknown>)[key];
    const { data, error } = await client.rpc("manage_face_knowledge", { p_action: "patch", p_payload: payload, p_admin_user_id: admin.profile?.id || null }); if (error) throw error;
    if (data?.conflict) return apiJson({ error: "此卡片已被其他管理員更新，您目前的編輯內容已保留；請重新載入最新版本、比對後再提交。", code: "FACE_KNOWLEDGE_VERSION_CONFLICT", currentVersion: data.current_version ?? null }, 409);
    return apiJson({ ok: true, item: data?.items?.[0] });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const admin = await requireNamedAdmin(request); const { id } = await params; const client = createSupabaseAdminClient(); const { error } = await client.rpc("manage_face_knowledge", { p_action: "archive", p_payload: { id }, p_admin_user_id: admin.profile?.id || null }); if (error) throw error; return apiJson({ ok: true }); } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

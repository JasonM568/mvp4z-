import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({ title: z.string().trim().min(1).max(200).optional(), category: z.string().trim().min(1).max(100).optional(), school: z.string().trim().max(160).nullable().optional(), technique: z.string().trim().max(160).nullable().optional(), observation: z.string().max(10000).optional(), teacherOriginal: z.string().max(20000).nullable().optional(), editorSummary: z.string().max(10000).nullable().optional(), ruleCondition: z.record(z.unknown()).optional(), safetyLevel: z.enum(["standard", "high", "critical"]).optional(), autoReport: z.boolean().optional(), sourceFile: z.string().max(300).nullable().optional(), sourcePages: z.array(z.number().int().positive()).max(100).optional(), status: z.enum(["draft", "teacher_review", "published", "archived"]).optional(), changeNote: z.string().max(500).nullable().optional() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request); const { id } = await params; const body = patchSchema.parse(await request.json()); const client = createSupabaseAdminClient();
    const { data: current, error: findError } = await client.from("face_knowledge_cards").select("*").eq("id", id).single(); if (findError) throw findError;
    const nextStatus = body.status || current.status; const patch: Record<string, unknown> = { updated_by: admin.profile?.id || null, version: current.version + 1 };
    const map: Record<string, string> = { title: "title", category: "category", school: "school", technique: "technique", observation: "observation", teacherOriginal: "teacher_original", editorSummary: "editor_summary", ruleCondition: "rule_condition", safetyLevel: "safety_level", autoReport: "auto_report", sourceFile: "source_file", sourcePages: "source_pages" };
    for (const [key, column] of Object.entries(map)) if (key in body) patch[column] = (body as Record<string, unknown>)[key];
    patch.status = nextStatus; patch.reviewed_by = nextStatus === "published" ? (admin.profile?.id || null) : current.reviewed_by; patch.reviewed_at = nextStatus === "published" ? new Date().toISOString() : current.reviewed_at;
    const { data, error } = await client.from("face_knowledge_cards").update(patch).eq("id", id).select("*").single(); if (error) throw error;
    await client.from("face_knowledge_revisions").insert({ knowledge_id: id, version: data.version, snapshot: data, changed_by: admin.profile?.id || null, change_note: body.changeNote || "更新" });
    await writeAdminAudit({ adminUserId: admin.profile?.id, action: "face_knowledge_updated", targetType: "face_knowledge", targetId: id, metadata: { status: nextStatus } }); return apiJson({ ok: true, item: data });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const admin = await requireAdmin(request); const { id } = await params; const client = createSupabaseAdminClient(); const { error } = await client.from("face_knowledge_cards").update({ status: "archived", auto_report: false, updated_by: admin.profile?.id || null }).eq("id", id); if (error) throw error; await writeAdminAudit({ adminUserId: admin.profile?.id, action: "face_knowledge_archived", targetType: "face_knowledge", targetId: id }); return apiJson({ ok: true }); } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

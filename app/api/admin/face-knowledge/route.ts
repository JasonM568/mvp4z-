import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({
  cardId: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100), school: z.string().trim().max(160).nullable().optional(),
  technique: z.string().trim().max(160).nullable().optional(), observation: z.string().max(10000).default(""),
  teacherOriginal: z.string().max(20000).nullable().optional(), editorSummary: z.string().max(10000).nullable().optional(),
  ruleCondition: z.record(z.unknown()).default({}), safetyLevel: z.enum(["standard", "high", "critical"]).default("standard"),
  autoReport: z.boolean().default(false), sourceFile: z.string().max(300).nullable().optional(),
  sourcePages: z.array(z.number().int().positive()).max(100).default([]), status: z.enum(["draft", "teacher_review", "published", "archived"]).default("draft"),
  changeNote: z.string().max(500).nullable().optional()
}).strict();

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const q = request.nextUrl.searchParams;
    const client = createSupabaseAdminClient();
    let query = client.from("face_knowledge_cards").select("*").order("updated_at", { ascending: false }).limit(100);
    for (const key of ["status", "category", "school"]) if (q.get(key)) query = query.eq(key, q.get(key));
    if (q.get("search")) { const term = q.get("search")!.replace(/[%_]/g, ""); query = query.or(`title.ilike.%${term}%,card_id.ilike.%${term}%`); }
    const { data, error } = await query;
    if (error) throw error;
    return apiJson({ ok: true, items: data || [] });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request); const body = inputSchema.parse(await request.json()); const client = createSupabaseAdminClient();
    const row = { card_id: body.cardId, title: body.title, category: body.category, school: body.school || null, technique: body.technique || null, observation: body.observation, teacher_original: body.teacherOriginal || null, editor_summary: body.editorSummary || null, rule_condition: body.ruleCondition, safety_level: body.safetyLevel, auto_report: body.autoReport, source_file: body.sourceFile || null, source_pages: body.sourcePages, status: body.status, reviewed_by: body.status === "published" ? (admin.profile?.id || null) : null, reviewed_at: body.status === "published" ? new Date().toISOString() : null, created_by: admin.profile?.id || null, updated_by: admin.profile?.id || null };
    const { data, error } = await client.from("face_knowledge_cards").insert(row).select("*").single(); if (error) throw error;
    await client.from("face_knowledge_revisions").insert({ knowledge_id: data.id, version: data.version, snapshot: data, changed_by: admin.profile?.id || null, change_note: body.changeNote || "建立" });
    await writeAdminAudit({ adminUserId: admin.profile?.id, action: "face_knowledge_created", targetType: "face_knowledge", targetId: data.id });
    return apiJson({ ok: true, item: data }, 201);
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

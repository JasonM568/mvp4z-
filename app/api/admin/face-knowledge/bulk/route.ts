import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), action: z.enum(["submit_review", "publish", "archive"]) }).strict();

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request); const body = schema.parse(await request.json()); const client = createSupabaseAdminClient();
    const status = body.action === "submit_review" ? "teacher_review" : body.action === "publish" ? "published" : "archived";
    const patch: Record<string, unknown> = { status, updated_by: admin.profile?.id || null };
    if (body.action === "publish") { patch.reviewed_by = admin.profile?.id || null; patch.reviewed_at = new Date().toISOString(); }
    if (body.action === "archive") patch.auto_report = false;
    const { data, error } = await client.from("face_knowledge_cards").update(patch).in("id", body.ids).select("id,card_id,status,safety_level,auto_report"); if (error) throw error;
    await writeAdminAudit({ adminUserId: admin.profile?.id, action: `face_knowledge_bulk_${body.action}`, targetType: "face_knowledge", metadata: { ids: body.ids, count: data?.length || 0 } });
    return apiJson({ ok: true, updated: data?.length || 0, items: data || [] });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

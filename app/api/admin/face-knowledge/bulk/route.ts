import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { requireNamedAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), action: z.enum(["submit_review", "publish", "archive"]) }).strict();

export async function POST(request: NextRequest) {
  try {
    const admin = await requireNamedAdmin(request); const body = schema.parse(await request.json()); const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("manage_face_knowledge", { p_action: "bulk", p_payload: { ids: body.ids, action: body.action }, p_admin_user_id: admin.profile?.id || null }); if (error) throw error;
    const items = (data?.items || []).map((item: Record<string, unknown>) => ({ id: item.id, card_id: item.card_id, status: item.status, safety_level: item.safety_level, auto_report: item.auto_report }));
    return apiJson({ ok: true, updated: items.length, items });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

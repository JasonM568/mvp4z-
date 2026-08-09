import { NextRequest } from "next/server";
import { apiJson } from "../../../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const { data, error } = await createSupabaseAdminClient().from("face_knowledge_revisions").select("id,knowledge_id,version,snapshot,changed_by,change_note,created_at").eq("knowledge_id", id).order("version", { ascending: false }).limit(50);
    if (error) throw error;
    return apiJson({ ok: true, revisions: data || [] });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

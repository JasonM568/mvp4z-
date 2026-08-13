import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { invalidateFaceRuleProfileCache } from "@/lib/face-analysis/rule-profiles";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request); const admin = createSupabaseAdminClient();
    const { data: draft, error } = await admin.from("face_rule_profiles").select("id,version_label,settings").eq("status", "draft").maybeSingle();
    if (error) throw error; if (!draft) throw statusError("目前沒有規則草稿可以發布", 400);
    const { data: current, error: currentError } = await admin.from("face_rule_profiles").select("id").eq("status", "published").maybeSingle();
    if (currentError) throw currentError;
    if (current) { const { error: archiveError } = await admin.from("face_rule_profiles").update({ status: "archived" }).eq("id", current.id); if (archiveError) throw archiveError; }
    const { error: publishError } = await admin.from("face_rule_profiles").update({ status: "published", published_at: new Date().toISOString() }).eq("id", draft.id);
    if (publishError) throw publishError;
    invalidateFaceRuleProfileCache();
    await writeAdminAudit({ adminUserId: auth.profile?.id, action: "face_rules.publish", targetType: "face_rule_profile", targetId: draft.id, metadata: { versionLabel: draft.version_label, archivedPrevious: current?.id || null } });
    return apiJson({ ok: true, id: draft.id });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

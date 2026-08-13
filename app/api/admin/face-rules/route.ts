import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";

const feature = z.enum(["forehead", "eyebrows", "eyes", "nose", "cheeks", "mouth", "jaw", "ears", "glabella", "nasalRoot", "outerEyeCorners", "tearTroughs", "philtrum", "chin"]);
const settingsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  palaces: z.array(z.object({ name: z.string().trim().min(1).max(20), primary: z.array(feature).min(1).max(4), auxiliary: z.array(feature).max(6) }).strict()).length(12)
}).strict();
const saveSchema = z.object({ versionLabel: z.string().trim().min(1).max(80), note: z.string().trim().max(1000).default(""), decidedBy: z.string().trim().max(80).default(""), settings: settingsSchema }).strict();

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await createSupabaseAdminClient().from("face_rule_profiles").select("id,version_label,status,settings,note,decided_by,published_at,updated_at").in("status", ["draft", "published"]).order("updated_at", { ascending: false });
    if (error?.code === "42P01") return apiJson({ ok: true, draft: null, published: null, setup_required: "尚未套用 face_rule_profiles migration" });
    if (error) throw error;
    return apiJson({ ok: true, draft: data?.find((row) => row.status === "draft") || null, published: data?.find((row) => row.status === "published") || null });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireAdmin(request); const input = await readJson(request, saveSchema); const admin = createSupabaseAdminClient();
    const { data: existing } = await admin.from("face_rule_profiles").select("id").eq("status", "draft").maybeSingle();
    const payload = { version_label: input.versionLabel, note: input.note, decided_by: input.decidedBy, settings: input.settings, status: "draft", created_by: adminAuth.profile?.id || null };
    const { data, error } = existing ? await admin.from("face_rule_profiles").update(payload).eq("id", existing.id).select("id").single() : await admin.from("face_rule_profiles").insert(payload).select("id").single();
    if (error) throw error;
    await writeAdminAudit({ adminUserId: adminAuth.profile?.id, action: "face_rules.save_draft", targetType: "face_rule_profile", targetId: data.id, metadata: { versionLabel: input.versionLabel } });
    return apiJson({ ok: true, id: data.id });
  } catch (error) { return apiJson({ error: errorMessage(error) }, errorStatus(error)); }
}

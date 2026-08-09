import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const approvalSchema = z.object({
  organizationLabel: z.string().trim().min(1).max(160),
  projectLabel: z.string().trim().min(1).max(160),
  approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attested: z.literal(true),
  note: z.string().trim().max(1000).optional().default("")
}).strict().superRefine((value, context) => {
  if (Number.isNaN(Date.parse(`${value.approvedAt}T00:00:00Z`))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["approvedAt"], message: "核准日期格式錯誤" });
  }
  const combined = `${value.organizationLabel}\n${value.projectLabel}\n${value.note}`;
  if (/\bsk-[A-Za-z0-9_-]{12,}\b|bearer\s+[A-Za-z0-9._-]{12,}/i.test(combined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "不可輸入 API Key 或 token" });
  }
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await createSupabaseAdminClient()
      .from("face_provider_approvals")
      .select("id,provider,organization_label,project_label,retention_mode,approved_at,status,note,verified_by,verified_at,revoked_at")
      .eq("provider", "openai")
      .maybeSingle();
    if (error?.code === "42P01") return apiJson({ ok: true, approval: null, setupRequired: true });
    if (error) throw error;
    return apiJson({ ok: true, approval: data || null });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminAuth = await requireNamedAdmin(request);
    const input = await readJson(request, approvalSchema);
    if (Date.parse(`${input.approvedAt}T00:00:00Z`) > Date.now()) {
      throw statusError("核准日期不能是未來日期", 400);
    }
    const now = new Date().toISOString();
    const { data, error } = await createSupabaseAdminClient()
      .from("face_provider_approvals")
      .upsert({
        provider: "openai",
        organization_label: input.organizationLabel,
        project_label: input.projectLabel,
        retention_mode: "zero_data_retention",
        approved_at: input.approvedAt,
        attested: true,
        status: "active",
        note: input.note,
        verified_by: adminAuth.profile.id,
        verified_at: now,
        revoked_at: null
      }, { onConflict: "provider" })
      .select("id,provider,organization_label,project_label,retention_mode,approved_at,status,verified_by,verified_at")
      .single();
    if (error) throw error;
    await writeAdminAudit({
      adminUserId: adminAuth.profile.id,
      action: "face_provider_zdr_attested",
      targetType: "face_provider_approval",
      targetId: data.id,
      metadata: { provider: "openai", projectLabel: input.projectLabel, approvedAt: input.approvedAt }
    });
    return apiJson({ ok: true, approval: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminAuth = await requireNamedAdmin(request);
    const now = new Date().toISOString();
    const { data, error } = await createSupabaseAdminClient()
      .from("face_provider_approvals")
      .update({ status: "revoked", revoked_at: now, updated_at: now })
      .eq("provider", "openai")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    await writeAdminAudit({
      adminUserId: adminAuth.profile.id,
      action: "face_provider_zdr_revoked",
      targetType: "face_provider_approval",
      targetId: data?.id || "openai"
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

async function requireNamedAdmin(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.profile) throw statusError("此認證必須由具名管理員登入後執行，不能使用共用 ADMIN_KEY", 403);
  return admin;
}

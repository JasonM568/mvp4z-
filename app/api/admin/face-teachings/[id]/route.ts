import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { invalidateTeachingRuleCache } from "@/lib/face-analysis/teaching-rules";

export const runtime = "nodejs";

const morphologyCondition = z.object({
  contour: z.array(z.enum(["rounded", "straight", "angular", "mixed", "not_assessable"])).optional(),
  relativeWidth: z.array(z.enum(["narrow", "medium", "wide", "not_assessable"])).optional(),
  relativeHeight: z.array(z.enum(["short", "medium", "long", "not_assessable"])).optional(),
  symmetry: z.array(z.enum(["balanced", "slightly_asymmetric", "asymmetric", "not_assessable"])).optional()
}).strict();

/**
 * rule_id 與 kind 發布後不可更改：報告的 citedTeachings 與稽核鏈都靠 rule_id 回溯，
 * 改掉會讓既有報告的引用對不回來。要換條件請改 payload，要停用請改 status。
 */
const patchSchema = z.object({
  condition: morphologyCondition.optional(),
  partName: z.string().trim().min(1).max(80).optional(),
  looksAt: z.string().trim().min(1).max(300).optional(),
  favorable: z.string().trim().min(1).max(1000).optional(),
  unfavorable: z.string().trim().min(1).max(1000).optional(),
  memberText: z.string().trim().max(2000).optional(),
  teacherText: z.string().trim().max(2000).optional(),
  themes: z.array(z.string().trim().min(1).max(20)).max(6).optional(),
  palaces: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
  flowYearAges: z.array(z.number().int().min(1).max(120)).max(40).optional(),
  safetyLevel: z.enum(["standard", "high", "critical"]).optional(),
  healthSensitive: z.boolean().optional(),
  sourcePages: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  note: z.string().trim().max(1000).optional(),
  decidedBy: z.string().trim().max(80).optional()
}).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireAdmin(request);
    const { id } = await context.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw statusError(parsed.error.issues[0]?.message || "更新內容不正確", 400);
    const input = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: existing, error: readError } = await admin
      .from("face_teaching_rules")
      .select("id,rule_id,kind,payload,status")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw statusError("找不到這條規則", 404);

    // payload 依 kind 合併，避免用 fingerprint 欄位污染 morphology 規則。
    const current = (existing.payload || {}) as Record<string, unknown>;
    let payload = current;
    if (existing.kind === "morphology" && input.condition) {
      const hasCondition = Object.values(input.condition).some((list) => Array.isArray(list) && list.length > 0);
      if (!hasCondition) throw statusError("至少要指定一個形態條件，否則這條規則會對每張照片都成立", 400);
      payload = { condition: input.condition };
    }
    if (existing.kind === "fingerprint") {
      payload = {
        ...current,
        ...(input.partName === undefined ? {} : { partName: input.partName }),
        ...(input.looksAt === undefined ? {} : { looksAt: input.looksAt }),
        ...(input.favorable === undefined ? {} : { favorable: input.favorable }),
        ...(input.unfavorable === undefined ? {} : { unfavorable: input.unfavorable })
      };
    }

    const publishing = input.status === "published" && existing.status !== "published";
    const { error } = await admin
      .from("face_teaching_rules")
      .update({
        payload,
        ...(input.memberText === undefined ? {} : { member_text: input.memberText }),
        ...(input.teacherText === undefined ? {} : { teacher_text: input.teacherText }),
        ...(input.themes === undefined ? {} : { themes: input.themes }),
        ...(input.palaces === undefined ? {} : { palaces: input.palaces }),
        ...(input.flowYearAges === undefined ? {} : { flow_year_ages: input.flowYearAges }),
        ...(input.safetyLevel === undefined ? {} : { safety_level: input.safetyLevel }),
        ...(input.healthSensitive === undefined ? {} : { health_sensitive: input.healthSensitive }),
        ...(input.sourcePages === undefined ? {} : { source_pages: input.sourcePages }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.decidedBy === undefined ? {} : { decided_by: input.decidedBy }),
        ...(publishing ? { published_at: new Date().toISOString(), reviewed_by: profile?.id || null, reviewed_at: new Date().toISOString() } : {}),
        updated_by: profile?.id || null
      })
      .eq("id", id);
    if (error) throw error;

    invalidateTeachingRuleCache();
    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: publishing ? "face_teaching_rule_publish" : "face_teaching_rule_update",
      targetType: "face_teaching_rule",
      targetId: existing.rule_id,
      metadata: { status: input.status ?? existing.status }
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireAdmin(request);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();

    const { data: existing, error: readError } = await admin
      .from("face_teaching_rules")
      .select("rule_id,status")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw statusError("找不到這條規則", 404);
    // 已發布的規則可能被既有報告引用；只能封存，不能真的刪掉，否則稽核鏈會斷。
    if (existing.status === "published") {
      throw statusError("已發布的規則不能刪除，請先改為封存；既有報告的引用需要靠它回溯", 409);
    }

    const { error } = await admin.from("face_teaching_rules").delete().eq("id", id);
    if (error) throw error;

    invalidateTeachingRuleCache();
    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: "face_teaching_rule_delete",
      targetType: "face_teaching_rule",
      targetId: existing.rule_id
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

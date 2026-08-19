import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { invalidateTeachingRuleCache } from "@/lib/face-analysis/teaching-rules";

export const runtime = "nodejs";

const FEATURE_NAMES = [
  "forehead", "eyebrows", "eyes", "nose", "cheeks", "mouth", "jaw", "ears",
  "glabella", "nasalRoot", "outerEyeCorners", "tearTroughs", "philtrum", "chin"
] as const;

const FINGERPRINT_FEATURES = [
  "foreheadShape", "eyebrowShape", "eyebrowTail", "eyeShape", "eyeTilt", "eyeSpacing",
  "nasalBridge", "noseTip", "noseWing", "cheekbone", "lipShape", "mouthCorner",
  "philtrumShape", "jawline", "chinShape", "earShape"
] as const;

const morphologyCondition = z.object({
  contour: z.array(z.enum(["rounded", "straight", "angular", "mixed", "not_assessable"])).optional(),
  relativeWidth: z.array(z.enum(["narrow", "medium", "wide", "not_assessable"])).optional(),
  relativeHeight: z.array(z.enum(["short", "medium", "long", "not_assessable"])).optional(),
  symmetry: z.array(z.enum(["balanced", "slightly_asymmetric", "asymmetric", "not_assessable"])).optional()
}).strict();

const baseFields = {
  memberText: z.string().trim().max(2000),
  teacherText: z.string().trim().max(2000).default(""),
  themes: z.array(z.string().trim().min(1).max(20)).max(6).default([]),
  palaces: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
  flowYearAges: z.array(z.number().int().min(1).max(120)).max(40).default([]),
  safetyLevel: z.enum(["standard", "high", "critical"]).default("standard"),
  healthSensitive: z.boolean().default(false),
  sourcePages: z.string().trim().max(200).default(""),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  note: z.string().trim().max(1000).default(""),
  decidedBy: z.string().trim().max(80).default("")
};

/**
 * 依 kind 分別驗證：morphology 必須有可比對的形態條件，
 * fingerprint 必須有部位名與正反向條件；空條件會導致規則永遠命中或永遠不命中。
 */
const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("morphology"),
    ruleId: z.string().trim().regex(/^[A-Za-z0-9_]{1,60}$/, "識別碼只能用英數與底線"),
    target: z.enum(FEATURE_NAMES),
    condition: morphologyCondition.refine(
      (value) => Object.values(value).some((list) => Array.isArray(list) && list.length > 0),
      "至少要指定一個形態條件，否則這條規則會對每張照片都成立"
    ),
    ...baseFields
  }).strict(),
  z.object({
    kind: z.literal("fingerprint"),
    ruleId: z.string().trim().regex(/^[A-Za-z0-9_]{1,60}$/),
    target: z.enum(FINGERPRINT_FEATURES),
    partName: z.string().trim().min(1).max(80),
    looksAt: z.string().trim().min(1).max(300),
    favorable: z.string().trim().min(1).max(1000),
    unfavorable: z.string().trim().min(1).max(1000),
    ...baseFields
  }).strict(),
  z.object({
    kind: z.literal("surface"),
    ruleId: z.string().trim().regex(/^[A-Za-z0-9_]{1,60}$/),
    target: z.enum(FEATURE_NAMES),
    ...baseFields
  }).strict()
]);

function toRow(input: z.infer<typeof createSchema>) {
  const payload =
    input.kind === "morphology"
      ? { condition: input.condition }
      : input.kind === "fingerprint"
        ? { partName: input.partName, looksAt: input.looksAt, favorable: input.favorable, unfavorable: input.unfavorable }
        : {};
  return {
    rule_id: input.ruleId,
    kind: input.kind,
    target: input.target,
    payload,
    member_text: input.memberText,
    teacher_text: input.teacherText,
    themes: input.themes,
    palaces: input.palaces,
    flow_year_ages: input.flowYearAges,
    safety_level: input.safetyLevel,
    health_sensitive: input.healthSensitive,
    source_pages: input.sourcePages,
    status: input.status,
    note: input.note,
    decided_by: input.decidedBy,
    published_at: input.status === "published" ? new Date().toISOString() : null
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const kind = request.nextUrl.searchParams.get("kind");
    const status = request.nextUrl.searchParams.get("status");
    let query = createSupabaseAdminClient()
      .from("face_teaching_rules")
      .select("id,rule_id,kind,target,payload,member_text,teacher_text,themes,palaces,flow_year_ages,safety_level,health_sensitive,source_pages,status,sort_order,note,decided_by,version,reviewed_version,reviewed_at,published_at,updated_at")
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true });
    if (kind) query = query.eq("kind", kind);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error?.code === "42P01") return apiJson({ ok: true, rules: [], tableMissing: true });
    if (error) throw error;
    return apiJson({ ok: true, rules: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireAdmin(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw statusError(parsed.error.issues[0]?.message || "規則內容不正確", 400);

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("face_teaching_rules")
      .insert({ ...toRow(parsed.data), created_by: profile?.id || null, updated_by: profile?.id || null })
      .select("id,rule_id")
      .single();
    if (error?.code === "23505") throw statusError("這個識別碼已經存在", 409);
    if (error) throw error;

    invalidateTeachingRuleCache();
    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: "face_teaching_rule_create",
      targetType: "face_teaching_rule",
      targetId: parsed.data.ruleId,
      metadata: { kind: parsed.data.kind, status: parsed.data.status }
    });
    return apiJson({ ok: true, rule: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

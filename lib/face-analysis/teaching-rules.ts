import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BUILT_IN_TEACHINGS, type Teaching, type TeachingTheme } from "@/lib/face-analysis/teachings";
import { BUILT_IN_FINGERPRINTS, type FingerprintFeature } from "@/lib/face-analysis/fingerprint-map";
import { BUILT_IN_SURFACE_MAPPINGS, type SurfaceRegion, type SurfaceTheme } from "@/lib/face-analysis/surface-map";
import type { FaceFeatureName } from "@/lib/face-analysis/face-features";

/**
 * 判讀規則的資料庫來源。
 *
 * 規則原本寫死在程式碼裡，每次調整都要改 code；現在由 `face_teaching_rules` 提供，
 * 老師可在後台逐條增刪改與具名發布。程式碼內建那份保留為**回退預設值**：
 * DB 沒有已發布規則（或資料表尚未建立）時才使用，避免 DB 異常時報告整段失去教材依據。
 *
 * 安全分級：
 *   standard ── 進會員報告與老師版
 *   high     ── 進會員報告（用已改寫的 member_text）與老師版；teacher_text 只給老師
 *   critical ── **不進會員報告**，只給老師版與稽核
 */

const FEATURE_NAMES = [
  "forehead", "eyebrows", "eyes", "nose", "cheeks", "mouth", "jaw", "ears",
  "glabella", "nasalRoot", "outerEyeCorners", "tearTroughs", "philtrum", "chin"
] as const;

const THEMES = ["感情", "事業", "健康", "財運", "家庭"] as const;
const SURFACE_THEMES = ["六親", "財運", "健康"] as const;

const morphologyPayload = z.object({
  condition: z.object({
    contour: z.array(z.enum(["rounded", "straight", "angular", "mixed", "not_assessable"])).optional(),
    relativeWidth: z.array(z.enum(["narrow", "medium", "wide", "not_assessable"])).optional(),
    relativeHeight: z.array(z.enum(["short", "medium", "long", "not_assessable"])).optional(),
    symmetry: z.array(z.enum(["balanced", "slightly_asymmetric", "asymmetric", "not_assessable"])).optional()
  }).strict()
}).strict();

const fingerprintPayload = z.object({
  partName: z.string().trim().min(1).max(80),
  looksAt: z.string().trim().min(1).max(300),
  favorable: z.string().trim().min(1).max(1000),
  unfavorable: z.string().trim().min(1).max(1000)
}).strict();

const rowSchema = z.object({
  rule_id: z.string().min(1),
  kind: z.enum(["morphology", "fingerprint", "surface"]),
  target: z.string().min(1),
  payload: z.unknown(),
  member_text: z.string(),
  teacher_text: z.string(),
  themes: z.array(z.string()),
  palaces: z.array(z.string()),
  flow_year_ages: z.array(z.number().int()),
  safety_level: z.enum(["standard", "high", "critical"]),
  health_sensitive: z.boolean(),
  source_pages: z.string(),
  updated_at: z.string()
});

export type TeachingRuleSet = Readonly<{
  /** 記入 face_analysis_runs，稽核鏈才追得回這份報告用的是哪一版規則。 */
  version: string;
  teachings: readonly Teaching[];
  fingerprints: typeof BUILT_IN_FINGERPRINTS;
  surfaces: typeof BUILT_IN_SURFACE_MAPPINGS;
}>;

/** DB 沒有已發布規則時使用的程式碼內建預設值。 */
export const BUILT_IN_RULE_SET: TeachingRuleSet = {
  version: "code-default",
  teachings: BUILT_IN_TEACHINGS,
  fingerprints: BUILT_IN_FINGERPRINTS,
  surfaces: BUILT_IN_SURFACE_MAPPINGS
};

let cached: { value: TeachingRuleSet; expires: number } | null = null;

function toTeaching(row: z.infer<typeof rowSchema>): Teaching | null {
  const payload = morphologyPayload.safeParse(row.payload);
  if (!payload.success) return null;
  if (!(FEATURE_NAMES as readonly string[]).includes(row.target)) return null;
  return {
    id: row.rule_id,
    feature: row.target as FaceFeatureName,
    when: payload.data.condition,
    memberText: row.member_text,
    teacherText: row.teacher_text || row.member_text,
    healthSensitive: row.health_sensitive,
    themes: row.themes.filter((theme): theme is TeachingTheme => (THEMES as readonly string[]).includes(theme)),
    palaces: row.palaces,
    source: row.source_pages
  };
}

export async function loadPublishedTeachingRules(): Promise<TeachingRuleSet> {
  if (cached && cached.expires > Date.now()) return cached.value;

  const { data, error } = await createSupabaseAdminClient()
    .from("face_teaching_rules")
    .select("rule_id,kind,target,payload,member_text,teacher_text,themes,palaces,flow_year_ages,safety_level,health_sensitive,source_pages,updated_at")
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  // 資料表尚未建立時回退內建規則，不讓報告整段失去教材依據。
  if (error?.code === "42P01") return BUILT_IN_RULE_SET;
  if (error) throw error;

  const rows = (data || []).map((row) => rowSchema.safeParse(row)).flatMap((r) => (r.success ? [r.data] : []));
  if (rows.length === 0) return BUILT_IN_RULE_SET;

  // critical 一律不進會員報告；會員側只收 standard 與 high。
  const memberRows = rows.filter((row) => row.safety_level !== "critical");

  const teachings = memberRows
    .filter((row) => row.kind === "morphology")
    .map(toTeaching)
    .flatMap((item) => (item ? [item] : []));

  // 指紋與斑痣必須覆蓋 Vision 可能回傳的每一個枚舉，
  // 因此以內建表為底，DB 只覆寫有提供的項目，避免缺項在執行期查不到表。
  const fingerprints = { ...BUILT_IN_FINGERPRINTS };
  for (const row of memberRows) {
    if (row.kind !== "fingerprint") continue;
    const payload = fingerprintPayload.safeParse(row.payload);
    if (!payload.success || !(row.target in fingerprints)) continue;
    fingerprints[row.target as FingerprintFeature] = {
      partName: payload.data.partName,
      palaces: row.palaces,
      flowYearAges: row.flow_year_ages,
      looksAt: payload.data.looksAt,
      favorable: payload.data.favorable,
      unfavorable: payload.data.unfavorable,
      source: row.source_pages
    };
  }

  const surfaces = { ...BUILT_IN_SURFACE_MAPPINGS };
  for (const row of memberRows) {
    if (row.kind !== "surface" || !(row.target in surfaces)) continue;
    surfaces[row.target as SurfaceRegion] = {
      palaces: row.palaces,
      themes: row.themes.filter((theme): theme is SurfaceTheme => (SURFACE_THEMES as readonly string[]).includes(theme)),
      memberNote: row.member_text,
      teacherNote: row.teacher_text,
      flowYearAges: row.flow_year_ages,
      sourcePages: row.source_pages ? row.source_pages.split("、") : []
    };
  }

  const latest = rows.reduce((newest, row) => (row.updated_at > newest ? row.updated_at : newest), "");
  const value: TeachingRuleSet = {
    version: `db:${latest}:${rows.length}`,
    // 沒有任何已發布的形態條文時回退內建，避免報告失去教材依據。
    teachings: teachings.length > 0 ? teachings : BUILT_IN_TEACHINGS,
    fingerprints,
    surfaces
  };
  cached = { value, expires: Date.now() + 30_000 };
  return value;
}

export function invalidateTeachingRuleCache() {
  cached = null;
}

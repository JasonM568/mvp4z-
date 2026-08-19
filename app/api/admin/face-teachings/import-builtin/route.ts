import { NextRequest } from "next/server";
import { apiJson } from "../../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BUILT_IN_TEACHINGS } from "@/lib/face-analysis/teachings";
import { BUILT_IN_FINGERPRINTS } from "@/lib/face-analysis/fingerprint-map";
import { BUILT_IN_SURFACE_MAPPINGS } from "@/lib/face-analysis/surface-map";
import { invalidateTeachingRuleCache } from "@/lib/face-analysis/teaching-rules";

export const runtime = "nodejs";

/**
 * 把程式碼內建的判讀規則匯入資料庫作為第一版。
 *
 * 用 on-conflict-do-nothing：已存在的 rule_id 一律不動，
 * 所以老師改過的內容不會被這個動作蓋掉，重跑也安全。
 * 新環境初始化、或想補回被刪掉的內建規則時都可以用。
 */
export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireAdmin(request);
    const now = new Date().toISOString();
    let order = 0;

    const rows = [
      ...BUILT_IN_TEACHINGS.map((teaching) => ({
        rule_id: teaching.id,
        kind: "morphology",
        target: teaching.feature,
        payload: { condition: teaching.when },
        member_text: teaching.memberText,
        teacher_text: teaching.teacherText,
        themes: [...teaching.themes],
        palaces: [...teaching.palaces],
        flow_year_ages: [],
        safety_level: teaching.healthSensitive ? "high" : "standard",
        health_sensitive: teaching.healthSensitive,
        source_pages: teaching.source,
        sort_order: (order += 10)
      })),
      ...Object.entries(BUILT_IN_FINGERPRINTS).map(([feature, mapping]) => ({
        rule_id: `FP_${feature}`,
        kind: "fingerprint",
        target: feature,
        payload: {
          partName: mapping.partName,
          looksAt: mapping.looksAt,
          favorable: mapping.favorable,
          unfavorable: mapping.unfavorable
        },
        member_text: mapping.looksAt,
        teacher_text: "",
        themes: [],
        palaces: [...mapping.palaces],
        flow_year_ages: [...mapping.flowYearAges],
        safety_level: "standard",
        health_sensitive: false,
        source_pages: mapping.source,
        sort_order: (order += 10)
      })),
      ...Object.entries(BUILT_IN_SURFACE_MAPPINGS).map(([region, mapping]) => {
        const health = mapping.themes.includes("健康");
        return {
          rule_id: `SF_${region}`,
          kind: "surface",
          target: region,
          payload: {},
          member_text: mapping.memberNote,
          teacher_text: mapping.teacherNote,
          themes: [...mapping.themes],
          palaces: [...mapping.palaces],
          flow_year_ages: [...mapping.flowYearAges],
          // 含健康主題者提高分級：會員側仍讀已改寫的 member_text，教材原文只留老師版。
          safety_level: health ? "high" : "standard",
          health_sensitive: health,
          source_pages: mapping.sourcePages.join("、"),
          sort_order: (order += 10)
        };
      })
    ].map((row) => ({
      ...row,
      status: "published",
      published_at: now,
      decided_by: "系統匯入內建規則",
      created_by: profile?.id || null,
      updated_by: profile?.id || null
    }));

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("face_teaching_rules")
      .upsert(rows, { onConflict: "rule_id", ignoreDuplicates: true })
      .select("rule_id");
    if (error) throw error;

    invalidateTeachingRuleCache();
    const inserted = data?.length || 0;
    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: "face_teaching_rule_import_builtin",
      targetType: "face_teaching_rule",
      metadata: { attempted: rows.length, inserted }
    });
    return apiJson({ ok: true, attempted: rows.length, inserted, skipped: rows.length - inserted });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

// 後台：奇門校對結果與簽核
//
// 老師逐盤回報「與我的盤一致」或「有差異（寫下哪一格不同）」。
// - 三盤全部一致 → approved，之後報告的奇門段落改印「已校對」。
// - 任何一盤有差異 → 存成不通過，**不簽核**，差異寫進紀錄供工程處理。
// 每次都新增一列，不覆蓋舊紀錄。盤面由伺服器重算後存入，不信任前端送來的內容。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { requireNamedAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadSchool } from "@/lib/school-settings/load";
import { invalidateQimenSignoffCache } from "@/lib/school-settings/qimen-signoff";
import { buildQimenChart, QIMEN_RULE_VERSION } from "@/lib/yixue/qimen/qimen";
import { QIMEN_REVIEW_CASES, qimenGrid, qimenHeadlines } from "@/lib/yixue/qimen/review";
import { makeSolarTime } from "@/lib/yixue/calendar/tyme";

const schema = z.object({
  signed_by: z.string().trim().min(1, "請填校對人").max(60),
  results: z
    .array(
      z.object({
        id: z.enum(["case1", "case2", "case3"]),
        match: z.boolean(),
        note: z.string().trim().max(1000).optional().default("")
      })
    )
    .length(3, "三張盤例都要回報"),
  note: z.string().trim().max(2000).optional().default("")
});

export async function POST(request: NextRequest) {
  try {
    // 簽核要留下是誰按的，所以不接受共用 ADMIN_KEY。
    const adminAuth = await requireNamedAdmin(request);
    const body = await readJson(request, schema);

    const ids = new Set(body.results.map((r) => r.id));
    if (ids.size !== 3) throw statusError("三張盤例各要回報一次，不可重複", 400);
    for (const r of body.results) {
      if (!r.match && !r.note) throw statusError("標記為「有差異」的盤例，請寫下哪一格不同", 400);
    }

    const approved = body.results.every((r) => r.match);
    const { school } = await loadSchool(Date.now());

    const caseResults = QIMEN_REVIEW_CASES.map((c) => {
      const chart = buildQimenChart(school, makeSolarTime(c.year, c.month, c.day, c.hour, c.minute));
      const r = body.results.find((x) => x.id === c.id)!;
      return { id: c.id, label: c.label, match: r.match, note: r.note, headlines: qimenHeadlines(chart), grid: qimenGrid(chart) };
    });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("qimen_signoffs")
      .insert({
        rule_version: QIMEN_RULE_VERSION,
        method: "拆補",
        approved,
        signed_by: body.signed_by,
        signed_by_profile: adminAuth.profile?.id || null,
        case_results: caseResults,
        note: body.note
      })
      .select("id")
      .single();
    if (error) throw statusError(`儲存失敗：${error.message}`, 500);

    invalidateQimenSignoffCache();

    await writeAdminAudit({
      adminUserId: adminAuth.profile?.id,
      action: approved ? "qimen.signoff.approved" : "qimen.signoff.rejected",
      targetType: "qimen_signoff",
      targetId: data.id,
      metadata: { rule_version: QIMEN_RULE_VERSION, signed_by: body.signed_by, mismatches: caseResults.filter((c) => !c.match).map((c) => c.id) }
    });

    return apiJson({ ok: true, id: data.id, approved });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

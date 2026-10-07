// 後台：奇門遁甲校對頁的資料
//
// 回三張校對盤例（由伺服器用「目前生效的流派」現算，不是存起來的快照）、
// 目前簽核狀態、以及校對歷史。老師看到的永遠是系統此刻真的會排出來的盤。

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadSchool } from "@/lib/school-settings/load";
import { evaluateSignoff } from "@/lib/school-settings/qimen-signoff";
import { buildQimenChart, QIMEN_RULE_VERSION } from "@/lib/yixue/qimen/qimen";
import { QIMEN_REVIEW_CASES, qimenGrid, qimenHeadlines } from "@/lib/yixue/qimen/review";
import { makeSolarTime } from "@/lib/yixue/calendar/tyme";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { school } = await loadSchool(Date.now());

    const cases = QIMEN_REVIEW_CASES.map((c) => {
      const chart = buildQimenChart(school, makeSolarTime(c.year, c.month, c.day, c.hour, c.minute));
      return { id: c.id, label: c.label, headlines: qimenHeadlines(chart), grid: qimenGrid(chart) };
    });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("qimen_signoffs")
      .select("id, rule_version, method, approved, signed_by, case_results, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    // 資料表還沒建立時（migration 未套用）照常回盤面，只是不能簽核。
    const setupRequired = error?.code === "42P01" ? "資料表尚未建立，請先執行 qimen_signoffs migration。" : null;
    const history = error ? [] : data || [];

    return apiJson({
      ok: true,
      rule_version: QIMEN_RULE_VERSION,
      method: "拆補法、轉盤",
      cases,
      status: evaluateSignoff(history[0] || null),
      history,
      setup_required: setupRequired
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

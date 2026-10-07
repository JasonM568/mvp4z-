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

    // 盤例用到的曆法設定。老師拿自己的盤比對時，這些會直接影響日柱與時柱，
    // 必須讓他看到，否則「日柱和文件寫的不一樣」會被誤認為排錯。
    const cal = school.calendar;
    const schoolNotes: string[] = [
      `晚子時（23:00–23:59）日柱：${cal.lateZiDayPillar === "next" ? "進位到隔日" : "不進位，仍算當日"}`,
      `早子與晚子的時柱：${cal.earlyLateZiHourPillar === "split" ? "分早子／晚子" : "合併不分"}`,
      `真太陽時校正：${cal.trueSolarTime === "off" ? "不校正" : cal.trueSolarTime === "longitude" ? "只校正經度時差" : "經度時差＋均時差"}`
    ];
    const schoolWarnings: string[] = [];
    if (cal.lateZiDayPillar === "same" && cal.earlyLateZiHourPillar === "split") {
      schoolWarnings.push(
        "目前設定是「晚子時日柱不進位」但「時柱分早晚子」。盤例一是 23:30，因此會出現「日柱甲子、時柱丙子」這種組合：日柱用當日、時干卻依隔日日干起。這兩項通常是連動的，請確認這是你要的；若不是，請先到「排盤流派設定」調整，再回來比對。"
      );
    }

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
      school_notes: schoolNotes,
      school_warnings: schoolWarnings,
      status: evaluateSignoff(history[0] || null),
      history,
      setup_required: setupRequired
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

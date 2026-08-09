// 巽風易學排盤引擎｜盤面轉 prompt 文字
//
// 這段文字會取代原本「把使用者填的生辰原樣塞進 prompt」的做法。
// 差別在於：以前是叫 LLM 自己從生日推四柱，現在是程式算好、叫它照用。
//
// 措辭刻意強調「既定事實」——沒有這句，模型會自行腦補一組干支然後跟盤面打架。

import type { YixueChart } from "../types";

export function renderChartForPrompt(chart: YixueChart, schoolLabel: string): string {
  const t = chart.resolvedTime;
  const lines: string[] = [
    "【系統排盤結果】",
    "以下干支由系統依曆法程式計算，為既定事實。",
    "請直接引用，不得自行改算年月日時柱，也不得寫「請提供出生資料」「無法推算」。",
    "若你的認知與此處不符，一律以本區塊為準——你的任務是解讀，不是排盤。",
    `採用流派：${schoolLabel}`,
    `出生時間：${t.civil}（${t.inputCalendar}輸入${t.isLeapMonth ? "，閏月" : ""}）`
  ];

  if (t.trueSolar) {
    const detail = t.corrections.map((c) => `${c.kind === "longitude" ? "經度時差" : "均時差"} ${fmt(c.minutes)} 分`).join("、");
    lines.push(`真太陽時：${t.trueSolar}${detail ? `（${detail}）` : ""}`);
  }
  if (t.placeLabel) lines.push(`出生地：${t.placeLabel}`);
  if (t.ziPeriod) lines.push(`子時判定：${t.ziPeriod}`);

  if (chart.bazi) {
    const p = chart.bazi.pillars;
    const hour = p.hour ? p.hour.ganzhi.label : "（時辰不確定，不排時柱）";
    lines.push(
      "",
      `四柱：年 ${p.year.ganzhi.label}　月 ${p.month.ganzhi.label}　日 ${p.day.ganzhi.label}　時 ${hour}`,
      `月令：${chart.bazi.monthOrder.term}（交節 ${chart.bazi.monthOrder.termAt}），距節 ${chart.bazi.monthOrder.daysIntoTerm} 天`
    );
  }

  lines.push("", `資料完整度：${chart.completeness.score} 分`);
  if (chart.completeness.missing.length) {
    lines.push(`缺少：${chart.completeness.missing.join("、")}`);
  }
  if (chart.warnings.length) {
    lines.push("判讀限制：");
    chart.warnings.forEach((w) => lines.push(`- ${w}`));
  }

  return lines.join("\n");
}

/** 第二輪用的短摘要。第二輪是攻擊第一輪的文字，不需要重讀完整盤面。 */
export function renderChartDigest(chart: YixueChart): string {
  if (!chart.bazi) return `系統排盤：資料完整度 ${chart.completeness.score} 分`;
  const p = chart.bazi.pillars;
  const hour = p.hour ? p.hour.ganzhi.label : "無時柱";
  return `系統排盤（既定事實）：四柱 ${p.year.ganzhi.label} ${p.month.ganzhi.label} ${p.day.ganzhi.label} ${hour}；月令 ${chart.bazi.monthOrder.term}；完整度 ${chart.completeness.score} 分`;
}

function fmt(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

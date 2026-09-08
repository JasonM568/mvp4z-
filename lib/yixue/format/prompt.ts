// 巽風易學排盤引擎｜盤面轉 prompt 文字
//
// 這段文字會取代原本「把使用者填的生辰原樣塞進 prompt」的做法。
// 差別在於：以前是叫 LLM 自己從生日推四柱，現在是程式算好、叫它照用。
//
// 措辭刻意強調「既定事實」——沒有這句，模型會自行腦補一組干支然後跟盤面打架。

import type { MeihuaChart, YixueChart } from "../types";

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
      // daysIntoTerm 是浮點（起運要用到小數），但直接印會漏出 27.312109030783176 這種數字。
      // 盤面保留原值，只在對外顯示時取到小數一位。
      `月令：${chart.bazi.monthOrder.term}（交節 ${chart.bazi.monthOrder.termAt}），距節 ${chart.bazi.monthOrder.daysIntoTerm.toFixed(1)} 天`
    );
  }

  if (chart.meihua) {
    lines.push("", ...meihuaLines(chart.meihua));
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

/**
 * 梅花盤面。
 *
 * 推導過程逐步列出不是為了給模型看，是為了讓老師與會員能驗算——
 * 「程式算的」如果不能被檢查，跟「模型編的」在可信度上沒有差別。
 */
function meihuaLines(m: MeihuaChart): string[] {
  const out: string[] = [
    "【梅花易數．系統起卦】",
    `起卦方式：${m.mode}`,
    ...m.derivation.map((d) => `　${d.label}：${d.value}${d.note ? `（${d.note}）` : ""}`),
    "",
    `本卦：${m.ben.name}（上${m.ben.upper.name} 下${m.ben.lower.name}）　動爻：第 ${m.movingLine} 爻`,
    `互卦：${m.hu.name}（上${m.hu.upper.name} 下${m.hu.lower.name}）`,
    `變卦：${m.bian.name}（上${m.bian.upper.name} 下${m.bian.lower.name}）`,
    `體卦：${m.ti.position} ${m.ti.trigram.name}（${m.ti.trigram.element}）　用卦：${m.yong.position} ${m.yong.trigram.name}（${m.yong.trigram.element}）`,
    `體用關係：${m.tiYong.relation}——${m.tiYong.note}`,
    `互卦對體（事情發展過程）：上互 ${m.hu.upper.name}（${m.hu.upper.element}）為 ${m.huToTi.upper.relation}；下互 ${m.hu.lower.name}（${m.hu.lower.element}）為 ${m.huToTi.lower.relation}`,
    `變卦對體（事情結果）：${m.bianToTi.relation}——${m.bianToTi.note}`,
    "",
    "以上卦象、動爻、體用與生剋關係皆由系統依梅花易數起卦法計算，為既定事實。",
    "請就此盤解讀，不得自行改起卦、改動爻、改體用，也不得另算一組卦象。"
  ];
  return out;
}

/** 第二輪用的短摘要。第二輪是攻擊第一輪的文字，不需要重讀完整盤面。 */
export function renderChartDigest(chart: YixueChart): string {
  const parts: string[] = [];
  if (chart.bazi) {
    const p = chart.bazi.pillars;
    const hour = p.hour ? p.hour.ganzhi.label : "無時柱";
    parts.push(
      `四柱 ${p.year.ganzhi.label} ${p.month.ganzhi.label} ${p.day.ganzhi.label} ${hour}；月令 ${chart.bazi.monthOrder.term}`
    );
  }
  if (chart.meihua) {
    const m = chart.meihua;
    parts.push(`梅花 本卦${m.ben.name}／互${m.hu.name}／變${m.bian.name}，動第 ${m.movingLine} 爻，${m.tiYong.relation}`);
  }
  if (!parts.length) return `系統排盤：資料完整度 ${chart.completeness.score} 分`;
  return `系統排盤（既定事實）：${parts.join("；")}；完整度 ${chart.completeness.score} 分`;
}

function fmt(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

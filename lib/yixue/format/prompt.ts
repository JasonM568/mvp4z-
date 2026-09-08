// 巽風易學排盤引擎｜盤面轉 prompt 文字
//
// 這段文字會取代原本「把使用者填的生辰原樣塞進 prompt」的做法。
// 差別在於：以前是叫 LLM 自己從生日推四柱，現在是程式算好、叫它照用。
//
// 措辭刻意強調「既定事實」——沒有這句，模型會自行腦補一組干支然後跟盤面打架。

import type { LiuyaoChart, LiuyaoLine, MeihuaChart, YixueChart } from "../types";

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

  if (chart.liuyao) {
    lines.push("", ...liuyaoLines(chart.liuyao));
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

/**
 * 六爻盤面。
 *
 * 逐爻一行，把納甲、六親、六神、世應、旬空、月破、與月建日辰的沖合生剋全部攤開。
 * 這些是斷卦的原料，模型過去得自己心算，現在只需要讀。
 *
 * 刻意不給旺衰分數：那需要先定權重模型，屬流派決策，未經老師拍板不能由工程代填。
 */
function liuyaoLines(c: LiuyaoChart): string[] {
  const out: string[] = [
    "【卜卦／六爻．系統裝盤】",
    `起卦方式：${c.mode}`,
    ...c.derivation.map((d) => `　${d.label}：${d.value}${d.note ? `（${d.note}）` : ""}`),
    "",
    `本卦：${c.ben.hexagram.name}　${c.ben.palace.palace}（${c.ben.palace.palaceElement}）${c.ben.palace.position}　世在${c.ben.palace.shiYao}爻、應在${c.ben.palace.yingYao}爻`,
    c.bian
      ? `變卦：${c.bian.hexagram.name}　${c.bian.palace.palace}${c.bian.palace.position}`
      : "變卦：無（六爻皆靜）",
    `月建：${c.monthBranch}（${c.monthNote}）　日辰：${c.dayGanzhi.label}　旬空：${c.voidBranches.join("、")}`,
    "",
    "六爻（由上爻往下讀，與畫卦順序一致）："
  ];

  // 由上往下印，符合看盤習慣；每行自帶爻位名稱，不靠順序辨識。
  for (let i = c.lines.length - 1; i >= 0; i--) {
    out.push(`　${renderLiuyaoLine(c.lines[i])}`);
  }

  out.push(
    "",
    "以上卦象、納甲干支、六親、六神、世應、旬空、月破與沖合生剋皆由系統依納甲筮法裝盤，為既定事實。",
    "請就此盤取用神與斷卦，不得自行改裝卦、改世應、改六親，也不得另起一組卦。",
    "旺衰輕重與用神取用屬判讀，由你依老師的規則判斷；盤面資料不得更動。"
  );
  return out;
}

function renderLiuyaoLine(l: LiuyaoLine): string {
  const parts = [
    l.positionName,
    l.yang ? "陽" : "陰",
    `${l.ganzhi.label}（${l.ganzhi.element}）`,
    l.relative,
    l.god
  ];
  const marks: string[] = [];
  if (l.isShi) marks.push("世");
  if (l.isYing) marks.push("應");
  if (l.moving) marks.push("動");
  if (l.isVoid) marks.push("旬空");
  if (l.isMonthBroken) marks.push("月破");
  // 用頓號分隔：〔世旬空〕會被讀成一個詞，〔世、旬空〕才看得出是兩個獨立標記。
  if (marks.length) parts.push(`〔${marks.join("、")}〕`);

  parts.push(`月${describeRelation(l.month)}`);
  parts.push(`日${describeRelation(l.day)}`);

  if (l.changed) {
    parts.push(`變出 ${l.changed.ganzhi.label}（${l.changed.ganzhi.element}）${l.changed.relative}，回頭${l.changed.relationToOriginal}`);
  }
  return parts.join("　");
}

function describeRelation(r: { relation: string; clash: boolean; combine: boolean }): string {
  const extra = [r.clash ? "沖" : "", r.combine ? "合" : ""].filter(Boolean).join("");
  return `${r.relation}${extra ? `．${extra}` : ""}`;
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
  if (chart.liuyao) {
    const l = chart.liuyao;
    const shi = l.lines.find((x) => x.isShi);
    parts.push(
      `六爻 ${l.ben.hexagram.name}（${l.ben.palace.palace}）${l.bian ? `之${l.bian.hexagram.name}` : "靜卦"}，` +
        `世${l.ben.palace.shiYao}爻${shi ? ` ${shi.ganzhi.label}${shi.relative}` : ""}，月建${l.monthBranch}、日辰${l.dayGanzhi.label}`
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

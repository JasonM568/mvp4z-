// 巽風易學排盤引擎｜盤面轉 prompt 文字
//
// 這段文字會取代原本「把使用者填的生辰原樣塞進 prompt」的做法。
// 差別在於：以前是叫 LLM 自己從生日推四柱，現在是程式算好、叫它照用。
//
// 措辭刻意強調「既定事實」——沒有這句，模型會自行腦補一組干支然後跟盤面打架。

import type { LiuyaoChart, LiuyaoLine, MeihuaChart, QimenChart, YixueChart } from "../types";
import { LUOSHU_LAYOUT } from "../qimen/tables";

export function renderChartForPrompt(
  chart: YixueChart,
  schoolLabel: string,
  /** 已簽核時傳「拍板人　日期」，未簽核傳空字串。 */
  signature = ""
): string {
  const t = chart.resolvedTime;
  const lines: string[] = [
    "【系統排盤結果】",
    "以下干支由系統依曆法程式計算，為既定事實。",
    "請直接引用，不得自行改算年月日時柱，也不得寫「請提供出生資料」「無法推算」。",
    "若你的認知與此處不符，一律以本區塊為準——你的任務是解讀，不是排盤。",
    `採用流派：${schoolLabel}`,
    // 簽核狀態獨立印一行：流派名稱是老師自己打的字，他簽核後未必會回去改，
    // 靠名稱判斷會讓「已簽核」的盤一直對客戶顯示「待簽核」。
    signature ? `流派簽核：${signature}` : "流派簽核：尚未簽核，本次判讀請據此說明限制",
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

    // 十神與藏干。2026-09-23 之前這一段完全沒給——等於把八個字丟過去
    // 叫模型自己在腦中推導十神，而它推錯不會有任何人發現。
    const d = chart.bazi.derived;
    lines.push(
      "",
      `日主：${d.dayMaster}（${d.dayMasterYinYang}${d.dayMasterElement}）。以下十神皆以此為「我」。`,
      "四柱十神與地支藏干："
    );
    for (const pillar of d.tenGods) {
      const hidden = pillar.hidden.map((h) => `${h.stem}（${h.role}・${h.god}）`).join("、");
      lines.push(`- ${pillar.position}柱 ${pillar.ganzhi}｜天干 ${pillar.stemGod}｜藏干 ${hidden}`);
    }
    const dist = (o: Record<string, number>) =>
      ["木", "火", "土", "金", "水"].map((k) => `${k}${o[k] ?? 0}`).join(" ");
    lines.push(
      `五行分佈｜天干：${dist(d.distribution.stems)}`,
      `五行分佈｜地支本氣：${dist(d.distribution.branchMain)}`,
      `五行分佈｜含全部藏干：${dist(d.distribution.allHidden)}`,
      "十神、藏干與五行分佈由系統查表推出，為既定事實，請直接引用，不得自行改判。",
      // 這一句是刻意的。旺衰要先定藏干權重，那是老師未簽核的流派分歧，
      // 系統給了數字反而會讓模型以為有官方結論可抄。
      "系統不提供旺衰強弱評分（藏干權重屬流派分歧，尚未簽核）；旺衰請依老師的規則自行判斷並說明依據。"
    );

    // 流年流月一起印，並逐月標出所屬流年——立春會換年，序列本來就可能跨兩個流年。
    // 措辭刻意寫「已由系統依曆法推定」：這兩者以前被當成缺少的客戶資料，
    // 報告因此年年降權並叫會員自己去補。現在它是既定事實，不得再列為待補項目。
    const f = chart.bazi.fleeting;
    if (f) {
      lines.push(
        "",
        `流年：${f.year.label}（以立春分界，與年柱同一套規則，已由系統依曆法推定）`,
        "流月（依節分界，逐月列出所屬流年）：",
        ...f.months.map(
          (m) =>
            `- ${m.year.label}年 ${m.ganzhi.label}月｜起於${m.term} ${m.termAt}${m.current ? "（事件時刻所在月）" : ""}`
        ),
        "流年流月為推導結果，不是待補資料；不得在報告中要求會員提供。"
      );
    }

    // 大運。2026-09-23 之前這裡印的是「本系統尚未提供程式排的大運」——
    // 那句話讓模型不再跟會員要大運，但會員打開報告仍然什麼都看不到。
    // 現在由 bazi/luck.ts 實際排出，只有性別未填時才回到「排不出」的說法。
    const luck = chart.bazi.luck;
    if (luck) {
      lines.push(
        "",
        `大運：${luck.directionLabel}（${luck.basis}）`,
        `起運：${luck.startAgeYears} 歲` +
          (luck.startAgeMonths ? ` ${luck.startAgeMonths} 個月` : "") +
          `　依據：出生距${luck.countedTerm}（${luck.countedTermAt}）${luck.countedDays} 天，三日折一年（${luck.startRule}）`,
        "大運序列（歲數為出生後經過的年數，非虛歲；西元年為準）：",
        ...luck.cycles.map(
          (c) =>
            `- 第${c.index}步 ${c.ganzhi.label}｜${c.fromAge}–${c.toAge} 歲｜${c.fromYear}–${c.toYear} 年` +
            (c.current ? "（事件時刻所在大運）" : "")
        ),
        "大運為系統依曆法與性別推排，不是待補資料；不得在報告中要求會員提供。"
      );
    } else {
      lines.push(
        "",
        "大運：性別未填，無法判定順逆排（陽男陰女順、陰男陽女逆），本次未排大運。",
        "涉及大運的判斷請明確降權並說明理由。",
        // 刻意不在這裡引用那句不該出現的話——模型有時會照抄 prompt 裡的字句，
        // 把反面示範寫進去等於提高它出現的機率。只講該怎麼寫。
        "若要提醒會員，唯一該說的是「補填性別即可排出大運」。",
        "缺的是性別這一個欄位，不是一份大運表，不要把它寫成要會員自行準備的資料。"
      );
    }
  }

  if (chart.qimen) {
    lines.push("", ...qimenLines(chart.qimen));
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
 * 奇門盤面。
 *
 * 依洛書方位排成三行三列（上南下北），與紙上排盤的樣子一致——
 * 奇門的判讀高度依賴方位關係，排成清單會讓「生門在東南」這種資訊消失。
 */
function qimenLines(c: QimenChart): string[] {
  const by = new Map(c.cells.map((x) => [x.palace, x]));
  const out: string[] = [
    "【奇門遁甲．系統排盤】",
    `${c.termName}（交節 ${c.termAt}）　${c.dun}${c.ju}局　${c.yuan}　定局符頭：${c.futou}`,
    `日柱 ${c.dayGanzhi}　時柱 ${c.hourGanzhi}　旬首 ${c.xunshou}（遁${c.xunshouYi}）`,
    `值符：${c.zhiFuStar}　落 ${c.zhiFuPalace} 宮${c.zhiFuInCenter ? "（時干在中五宮，寄坤二）" : ""}`,
    `值使：${c.zhiShiDoor}　落 ${c.zhiShiPalace} 宮`,
    `中五宮地盤干：${c.centerStem}（隨天禽寄坤二，不單獨佔宮）`,
    "",
    "九宮盤（依洛書方位，上南下北）："
  ];

  for (const row of LUOSHU_LAYOUT) {
    const parts = row.map((p) => {
      const cell = by.get(p);
      if (!cell) return `　${p}中宮　地盤 ${c.centerStem}`;
      return `${cell.gua}${p}（${cell.direction}）${cell.god}．${cell.star}．${cell.door}　天盤${cell.skyStem}／地盤${cell.earthStem}`;
    });
    out.push(...parts.map((x) => `　${x}`), "");
  }

  out.push(
    "以上局數、三奇六儀、值符值使、天盤九星、八門與八神皆由系統依時家奇門（拆補法、轉盤）排出，為既定事實。",
    "請就此盤判讀，不得自行改局數、改陰陽遁、改門星神位置，也不得另排一個局。",
    "格局取用（伏吟反吟、擊刑、入墓、十干克應等）與用神取用屬判讀，由你依老師的規則判斷。"
  );
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
      `四柱 ${p.year.ganzhi.label} ${p.month.ganzhi.label} ${p.day.ganzhi.label} ${hour}；月令 ${chart.bazi.monthOrder.term}` +
        (chart.bazi.fleeting
          ? `；流年 ${chart.bazi.fleeting.year.label}、當下流月 ${chart.bazi.fleeting.months[0].ganzhi.label}`
          : "")
    );
  }
  if (chart.qimen) {
    const q = chart.qimen;
    parts.push(
      `奇門 ${q.termName}${q.dun}${q.ju}局${q.yuan}，值符${q.zhiFuStar}落${q.zhiFuPalace}宮、值使${q.zhiShiDoor}落${q.zhiShiPalace}宮`
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

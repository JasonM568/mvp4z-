// 巽風 council｜把設定渲染成 prompt 文字
//
// 這一層取代原本寫死在 personas.ts / quality.ts / brand.ts 裡的字串模板。
// 輸出必須與改版前逐字元相同——prompt-baseline.test.ts 的 snapshot 是唯一判準。
//
// 中文序號由程式產生（老師只填標題，不填「一、」），因為段落會依啟用術數
// 數量增減，序號必須自動接上，讓老師手動維護一定會錯。

import type { PromptSettings, RuleItem } from "./schema";
import { PROMPT_TOKENS as T } from "./schema";

const CJK_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四"];

function cjk(index: number): string {
  return CJK_NUM[index] || `第${index + 1}`;
}

function fill(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(values)) {
    out = out.split(token).join(value);
  }
  return out;
}

function numbered(items: string[]): string {
  return items.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

function ruleTexts(items: RuleItem[], values: Record<string, string> = {}): string[] {
  return items.map((i) => fill(i.text, values));
}

// ---------------------------------------------------------------- 品牌與人設

export function renderBrandRules(s: PromptSettings): string {
  return [s.brand.heading, ...s.brand.items.map((i) => `- ${i.text}`)].join("\n");
}

export function renderPersona(s: PromptSettings, key: keyof PromptSettings["personas"]): string {
  const persona = s.personas[key];
  const parts = [...persona.lines];
  if (persona.formatHeading) {
    parts.push(persona.formatHeading);
    parts.push(numbered(persona.formatItems));
  }
  parts.push(renderBrandRules(s));
  return parts.join("\n");
}

// ---------------------------------------------------------------- 品質門檻

export function renderQualityGate(
  s: PromptSettings,
  ctx: { enabledTerms: string[]; topic: string }
): string {
  const values = {
    [T.ENABLED_TERMS]: ctx.enabledTerms.join("、"),
    [T.TOPIC]: ctx.topic
  };
  const g = s.qualityGate;
  const sections = [g.brandRules, g.formatRules, g.contentRules].map(
    (sec, i) => `${cjk(i)}、${sec.title}\n${numbered(ruleTexts(sec.items, values))}`
  );
  return [g.heading, "", sections.join("\n\n")].join("\n");
}

// ---------------------------------------------------------------- 報告骨架

export function renderReportSkeleton(s: PromptSettings, enabledTerms: string[]): string {
  const terms = enabledTerms.length ? enabledTerms : ["八字命理"];
  const r = s.reportSkeleton;
  const termList = terms.join("、");

  let n = 0;
  const num = () => cjk(n++);

  const head1 = `${num()}、${r.overview.title}\n${numbered(r.overview.items)}`;

  const head2 = `${num()}、${r.completeness.title}\n${r.completeness.intro}\n${r.completeness.headerRow}\n${terms
    .map((t) => `${t}｜`)
    .join("\n")}`;

  const termSections = terms
    .map((t) => {
      const subs = r.termSubsections.map((sub) => fill(sub, { [T.TERM_NAME]: t }));
      return `${num()}、${t}獨立判讀\n${numbered(subs)}`;
    })
    .join("\n\n");

  const cross =
    terms.length > 1 ? `${num()}、${r.crossValidation.title}\n${numbered(r.crossValidation.items)}\n\n` : "";

  const action = `${num()}、${r.actionPlan.title}\n${r.actionPlan.windows
    .map((w, i) => `${i + 1}. ${w.label}\n${w.fields.join("\n")}`)
    .join("\n\n")}`;

  const finalRec = `${num()}、${r.finalRecommendation.title}\n${r.finalRecommendation.body}`;
  const disclaimer = `${num()}、${r.disclaimer.title}\n${r.disclaimer.body}`;

  return [
    r.heading,
    "",
    `${cjk(0)}、${r.formatRules.title}`,
    numbered(ruleTexts(r.formatRules.items)),
    "",
    `${cjk(1)}、${fill(r.termInstruction.title, { [T.ENABLED_TERMS]: termList })}`,
    r.termInstruction.body,
    "",
    `${cjk(2)}、${r.layoutHeading}`,
    "",
    r.reportTitle,
    "",
    head1,
    "",
    head2,
    "",
    termSections,
    "",
    `${cross}${action}`,
    "",
    finalRec,
    "",
    disclaimer
  ].join("\n");
}

// ---------------------------------------------------------------- 兜底報告

export type FallbackContext = {
  clientName: string;
  question: string;
  topic: string;
  birthText: string;
  eventText: string;
  qimenMode: string;
  qimenDirection: string;
  liuyaoMode: string;
  liuyaoYao: string;
  meihuaMode: string;
  meihuaUpper: string;
  meihuaLower: string;
};

function renderWeights(w: PromptSettings["fallbackReport"]["weights"]): string {
  return `奇門 ${w.qimen}%、八字 ${w.bazi}%、六爻 ${w.liuyao}%、梅花 ${w.meihua}%`;
}

export function renderFallbackReport(s: PromptSettings, ctx: FallbackContext): string {
  const f = s.fallbackReport;
  const values = {
    [T.CLIENT_NAME]: ctx.clientName,
    [T.QUESTION]: ctx.question,
    [T.TOPIC]: ctx.topic,
    [T.BIRTH]: ctx.birthText,
    [T.EVENT_TIME]: ctx.eventText,
    [T.QIMEN_MODE]: ctx.qimenMode,
    [T.QIMEN_DIRECTION]: ctx.qimenDirection,
    [T.LIUYAO_MODE]: ctx.liuyaoMode,
    [T.LIUYAO_YAO]: ctx.liuyaoYao,
    [T.MEIHUA_MODE]: ctx.meihuaMode,
    [T.MEIHUA_UPPER]: ctx.meihuaUpper,
    [T.MEIHUA_LOWER]: ctx.meihuaLower,
    [T.WEIGHTS]: renderWeights(f.weights)
  };

  // 兜底稿固定列出四術，不隨啟用模組增減——這是改版前的既有行為，
  // 為了保持輸出一致而保留。要改成只列啟用術數，必須是獨立一次的刻意調整。
  const termOrder = Object.keys(f.termReadings);

  let n = 0;
  const num = () => cjk(n++);

  const overview = `${num()}、${f.overview.title}\n${numbered(f.overview.items.map((i) => fill(i, values)))}`;

  const completeness = `${num()}、${f.completeness.title}\n${f.completeness.headerRow}\n${termOrder
    .map((t) => `${t}｜${fill(f.completeness.rows[t] ?? "", values)}`)
    .join("\n")}`;

  const readings = termOrder
    .map((t) => `${num()}、${t}獨立判讀\n${fill(f.termReadings[t] ?? "", values)}`)
    .join("\n\n");

  const cross = `${num()}、${f.crossValidation.title}\n${numbered(
    f.crossValidation.items.map((i) => fill(i, values))
  )}`;

  const action = `${num()}、${f.actionPlan.title}\n${f.actionPlan.windows
    .map((w, i) => `${i + 1}. ${w.label}\n${w.fields.map((x) => fill(x, values)).join("\n")}`)
    .join("\n\n")}`;

  const advice = `${num()}、${f.finalAdvice.title}\n${numbered(f.finalAdvice.items.map((i) => fill(i, values)))}`;

  const disclaimer = `${num()}、${f.disclaimer.title}\n${fill(f.disclaimer.body, values)}`;

  return [f.reportTitle, "", overview, "", completeness, "", readings, "", cross, "", action, "", advice, "", disclaimer].join(
    "\n"
  );
}

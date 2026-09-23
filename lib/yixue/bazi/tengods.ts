// 巽風易學排盤引擎｜十神、地支藏干、五行分佈
//
// 為什麼補這三項：2026-09-23 稽核時發現，引擎丟給模型的八字只有四柱八個字
// 加月令與流年流月。十神與藏干沒有給——而那是八字判讀的基本詞彙。
// 等於把八個字丟過去叫模型自己在腦中推導，正是排盤引擎當初要消滅的事。
//
// 這三項**完全沒有流派分歧**：藏干是定表、十神是五行生剋加陰陽同異的機械推導、
// 五行分佈是數數。所以不開任何設定欄位。
//
// ★ 刻意不做旺衰評分。藏干的本氣／中氣／餘氣要給多少權重才是流派分歧
//   （SCHOOL-DECISIONS.md 的八字待決項列著），未經老師拍板就給一個分數，
//   等於把「共鳴度 87」的錯誤換個地方再犯。這裡只給原料，不給結論。

import type { Element } from "../gua/trigram";
import { STEM_ELEMENTS, branchIndexOf, stemIndexOf } from "../gua/ganzhi";
import type { BaziDerived, HiddenStem, TenGodPillar } from "../types";
import type { FourPillars } from "../types";

/**
 * 十二地支藏干。本氣、中氣、餘氣依序，沒有就省略。
 *
 * ⚠️ 硬資料。子午卯酉為四正只藏本氣（午多一個己），寅申巳亥為四生藏三，
 * 辰戌丑未為四庫藏三。tengods.test.ts 用這些結構性質反驗，
 * 任何一格抄錯位置都會被抓到。
 */
const HIDDEN_STEMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  子: ["癸"],
  丑: ["己", "癸", "辛"],
  寅: ["甲", "丙", "戊"],
  卯: ["乙"],
  辰: ["戊", "乙", "癸"],
  巳: ["丙", "庚", "戊"],
  午: ["丁", "己"],
  未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"],
  酉: ["辛"],
  戌: ["戊", "辛", "丁"],
  亥: ["壬", "甲"]
});

const HIDDEN_ROLE = ["本氣", "中氣", "餘氣"] as const;

export function hiddenStemsOf(branch: string): HiddenStem[] {
  const list = HIDDEN_STEMS[branch];
  if (!list) throw new Error(`未知的地支：${branch}`);
  return list.map((stem, i) => ({
    stem,
    role: HIDDEN_ROLE[i],
    element: STEM_ELEMENTS[stemIndexOf(stem)]
  }));
}

// ---------------------------------------------------------------- 十神

const GENERATES: Record<Element, Element> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const OVERCOMES: Record<Element, Element> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

/** 天干陰陽：index 為偶數者陽（甲丙戊庚壬）。 */
function isYang(stem: string): boolean {
  return stemIndexOf(stem) % 2 === 0;
}

/**
 * 十神。以日主為「我」，判另一個天干對我的關係。
 *
 * 同五行 → 同陰陽比肩、異陰陽劫財
 * 我生   → 同食神、異傷官
 * 我剋   → 同偏財、異正財
 * 剋我   → 同七殺、異正官
 * 生我   → 同偏印、異正印
 *
 * 「同陰陽為偏、異陰陽為正」只適用於財官印；比劫與食傷的命名相反，
 * 所以不能用一條通則套完，必須逐類寫死。
 */
export function tenGodOf(dayStem: string, other: string): string {
  const me = STEM_ELEMENTS[stemIndexOf(dayStem)];
  const it = STEM_ELEMENTS[stemIndexOf(other)];
  const same = isYang(dayStem) === isYang(other);

  if (it === me) return same ? "比肩" : "劫財";
  if (GENERATES[me] === it) return same ? "食神" : "傷官";
  if (OVERCOMES[me] === it) return same ? "偏財" : "正財";
  if (OVERCOMES[it] === me) return same ? "七殺" : "正官";
  if (GENERATES[it] === me) return same ? "偏印" : "正印";
  throw new Error(`十神判定失敗：日主 ${dayStem} 對 ${other}`);
}

// ---------------------------------------------------------------- 組裝

export function buildBaziDerived(pillars: FourPillars): BaziDerived {
  const dayStem = pillars.day.ganzhi.stem;

  const entries: Array<[TenGodPillar["position"], typeof pillars.year | null]> = [
    ["年", pillars.year],
    ["月", pillars.month],
    ["日", pillars.day],
    ["時", pillars.hour]
  ];

  const tenGods: TenGodPillar[] = [];
  const stemCount: Record<string, number> = {};
  const branchMainCount: Record<string, number> = {};
  const hiddenCount: Record<string, number> = {};

  for (const [position, pillar] of entries) {
    if (!pillar) continue;
    const { stem, branch } = pillar.ganzhi;
    const hidden = hiddenStemsOf(branch);

    tenGods.push({
      position,
      ganzhi: pillar.ganzhi.label,
      // 日柱天干就是日主本身，標「日主」而不是「比肩」——寫比肩會讓模型
      // 以為命局裡多了一顆比劫。
      stemGod: position === "日" ? "日主" : tenGodOf(dayStem, stem),
      hidden: hidden.map((h) => ({ ...h, god: tenGodOf(dayStem, h.stem) }))
    });

    stemCount[STEM_ELEMENTS[stemIndexOf(stem)]] = (stemCount[STEM_ELEMENTS[stemIndexOf(stem)]] || 0) + 1;
    branchMainCount[hidden[0].element] = (branchMainCount[hidden[0].element] || 0) + 1;
    for (const h of hidden) hiddenCount[h.element] = (hiddenCount[h.element] || 0) + 1;
  }

  const ELEMENTS: Element[] = ["木", "火", "土", "金", "水"];
  const fill = (src: Record<string, number>) =>
    Object.fromEntries(ELEMENTS.map((e) => [e, src[e] || 0])) as Record<Element, number>;

  return {
    dayMaster: dayStem,
    dayMasterElement: STEM_ELEMENTS[stemIndexOf(dayStem)],
    dayMasterYinYang: isYang(dayStem) ? "陽" : "陰",
    tenGods,
    distribution: {
      // 三種數法都給，因為「該怎麼加權」是老師要決定的事。
      // 只給一種等於工程替他選了權重。
      stems: fill(stemCount),
      branchMain: fill(branchMainCount),
      allHidden: fill(hiddenCount)
    }
  };
}

/** 測試與文件用。 */
export const HIDDEN_STEM_TABLE = HIDDEN_STEMS;
export { branchIndexOf };

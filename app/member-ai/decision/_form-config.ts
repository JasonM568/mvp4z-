// 巽風易學決策報告｜表單常數（從 v3 巽風 yixue system 搬入）
// 抽到獨立檔案，方便 SSR / 後台共用、減少 page.tsx 行數

import { TAIWAN_PLACES } from "@/lib/yixue/geo/places";

export const years = Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - i);
export const months = Array.from({ length: 12 }, (_, i) => i + 1);
export const days = Array.from({ length: 31 }, (_, i) => i + 1);
export const hours = Array.from({ length: 24 }, (_, i) => i);
export const minutes = Array.from({ length: 60 }, (_, i) => i);

export const hourBranches: Array<[string, string]> = [
  ["子", "23:00-00:59"],
  ["丑", "01:00-02:59"],
  ["寅", "03:00-04:59"],
  ["卯", "05:00-06:59"],
  ["辰", "07:00-08:59"],
  ["巳", "09:00-10:59"],
  ["午", "11:00-12:59"],
  ["未", "13:00-14:59"],
  ["申", "15:00-16:59"],
  ["酉", "17:00-18:59"],
  ["戌", "19:00-20:59"],
  ["亥", "21:00-22:59"],
  ["不確定", "不知道"]
];

export const trigramOptions = ["不確定", "乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];

/**
 * 奇門「事件方位」的白話選項：[方位, 後天八卦宮]。
 * 會員選的是東南西北，不是卦名；送出時才附上卦名，讓排盤的宮位（例如「乾六宮（西北）」）對得上。
 */
export const DIRECTION_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["北", "坎"],
  ["東北", "艮"],
  ["東", "震"],
  ["東南", "巽"],
  ["南", "離"],
  ["西南", "坤"],
  ["西", "兌"],
  ["西北", "乾"]
];

/** 表單值（「不確定」或方位名）轉成送給後端的文字，例如「東北（艮宮）」。 */
export function directionPayload(direction: string): string {
  const hit = DIRECTION_OPTIONS.find(([name]) => name === direction);
  return hit ? `${hit[0]}（${hit[1]}宮）` : "不確定";
}
export const reportTemplates = ["商業決策顧問報告", "標準個人諮詢報告", "企業主管簡報版", "教學展示版"];
export const topics = ["事業／工作", "財運／投資", "考試／升學", "感情／人際", "房產／陽宅", "健康／身心"];
// 性別與身分拆成兩欄。原本擠在同一格（男／女／其他／企業主／考生），
// 選「企業主」就等於沒有性別——而大運的順逆是陽男陰女順排、陰男陽女逆排，
// 沒有乾淨的男／女就排不出來。拆開是為大運鋪路，本身也比較合理。
export const genderOptions = ["男", "女", "不指定"];
export const calendarOptions = ["國曆", "農曆"];

// 出生地：只為真太陽時校正而收。清單直接取自排盤引擎的經緯度表，
// 不另外維護一份，避免兩邊縣市名稱對不起來。
export const birthPlaceOptions = ["不確定", ...TAIWAN_PLACES.map((p) => p.label), "海外／其他"];
export const yesNoUncertain = ["否", "是", "不確定"];
export const yesNoUncertain2 = ["是", "否", "不確定"];

// 奇門與六爻不再有起局／起卦方式可選：六爻一律由案主親手搖卦，
// 奇門與梅花（時間起卦）一律用第一搖的時刻，見 lib/divination/casting.ts。
export const meihuaModes = ["時間起卦", "數字起卦", "上下卦起卦"];
export const meihuaUpperTrigrams = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
export const meihuaLowerTrigrams = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
export const meihuaMovingLines = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

/** 問題類型的關鍵字建議。只是建議，必須由會員點選確認才算數，不得預設。 */
export const TOPIC_KEYWORDS: Array<[string, string[]]> = [
  ["感情／人際", ["婚", "感情", "戀", "伴侶", "老公", "老婆", "先生", "太太", "男友", "女友", "分手", "復合", "桃花", "家人", "朋友", "人際", "相親"]],
  ["事業／工作", ["工作", "事業", "換工作", "轉職", "創業", "升遷", "老闆", "公司", "合夥", "客戶", "面試", "離職"]],
  ["財運／投資", ["投資", "股票", "基金", "財運", "賺錢", "買賣", "貸款", "資金", "生意", "收入"]],
  ["考試／升學", ["考試", "升學", "學校", "考上", "證照", "論文", "留學", "志願"]],
  ["房產／陽宅", ["房", "買屋", "賣屋", "搬家", "陽宅", "風水", "租屋", "土地"]],
  ["健康／身心", ["健康", "身體", "睡眠", "壓力", "情緒", "焦慮", "作息"]]
];

/** 依問題文字建議類型；沒有任何關鍵字命中回 null（不猜）。命中數最多者勝，平手取清單靠前。 */
export function suggestTopic(question: string): string | null {
  const text = question.trim();
  if (!text) return null;
  let best: { topic: string; hits: number } | null = null;
  for (const [topic, words] of TOPIC_KEYWORDS) {
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { topic, hits };
  }
  return best ? best.topic : null;
}

export type CouncilForm = {
  clientName: string;
  gender: string;
  /** 身分／角色，自由填寫。只作為判讀背景，不參與任何術數計算。 */
  identity: string;
  topic: string;
  reportTemplate: string;
  question: string;
  context: string;
  calendarType: string;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  /** 會員是否明確確認過出生年月日時。預設值是 1990/1/1，沒確認就送出會悄悄排錯盤。 */
  birthConfirmed: boolean;
  birthHourBranch: string;
  /** 精確出生鐘點（選填）。有填時優先於時辰中點，真太陽時校正才有意義。 */
  birthHour: string;
  birthMinute: string;
  /** 出生地縣市，用於真太陽時的經度校正。 */
  birthPlace: string;
  isLeapMonth: string;
  birthTimeKnown: string;
  /**
   * 「這件事有確切日期嗎？」選填，格式 YYYY-MM-DD。只作判讀背景，不用來起局；
   * 每次開新表單都清空，不沿用舊值。
   */
  eventDate: string;
  direction: string;
  /** 案主親手搖卦的紀錄（每搖一次一筆）。搖滿六次才能送出，見 casting-panel。 */
  castThrows: Array<{ at: string; yao: string }>;
  meihuaMode: string;
  upperTrigram: string;
  lowerTrigram: string;
  meihuaNum1: string;
  meihuaNum2: string;
  meihuaNum3: string;
  meihuaMovingLine: string;
};

export type CouncilModules = {
  bazi: boolean;
  qimen: boolean;
  liuyao: boolean;
  meihua: boolean;
};

export function buildInitialForm(): CouncilForm {
  return {
    clientName: "",
    // 刻意留空，三顆按鈕都不預選。
    // 2026-09-22 之前性別沒有任何計算會用到，預設「男」是無害的；
    // 隔天大運上線後，順逆排完全由性別決定，預選就變成
    // 「女性會員沒注意到就拿到男性的大運」——上面那行警語當初有寫，但沒有人回來執行。
    gender: "",
    identity: "",
    // 刻意留空：預設值曾讓「婚姻」問題套上事業決策語句。要由會員確認類型才能送出。
    topic: "",
    reportTemplate: "商業決策顧問報告",
    question: "",
    context: "",
    calendarType: "國曆",
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    birthConfirmed: false,
    birthHourBranch: "寅",
    birthHour: "",
    birthMinute: "",
    birthPlace: "不確定",
    isLeapMonth: "否",
    birthTimeKnown: "是",
    eventDate: "",
    direction: "不確定",
    castThrows: [],
    meihuaMode: "時間起卦",
    upperTrigram: "乾",
    lowerTrigram: "坤",
    meihuaNum1: "",
    meihuaNum2: "",
    meihuaNum3: "",
    meihuaMovingLine: "初爻"
  };
}

export function buildInitialModules(): CouncilModules {
  return { bazi: true, qimen: true, liuyao: true, meihua: true };
}

// 巽風易學決策系統｜多重分身校核 system prompts
// 對應四個內部角色：主判讀／策略推演／攻防反證／最終定稿
//
// 2026-08-09 起人設內容改由 lib/ai/council/settings 提供，可由風羿老師在後台編輯。
// 本檔只負責組裝與環境變數覆寫，不再持有文案。

import { DEFAULT_PROMPT_SETTINGS } from "./settings/defaults";
import { renderPersona } from "./settings/render";
import type { PromptSettings } from "./settings/schema";

export type YixuePayload = {
  clientName?: string;
  gender?: string;
  birth?: {
    calendar?: string;
    /** 農曆才有意義。前端一直有送、schema 一直有收，型別漏宣告導致被靜默丟棄。 */
    isLeapMonth?: string;
    year?: number | string;
    month?: number | string;
    day?: number | string;
    hourBranch?: string;
    timeKnown?: string;
    /** 選填精度補充：精確鐘點與出生地，供排盤引擎做真太陽時校正。 */
    hour?: number | string;
    minute?: number | string;
    place?: string;
  };
  eventTime?: {
    year?: number | string;
    month?: number | string;
    day?: number | string;
    hour?: number | string;
    minute?: number | string;
  };
  modules?: {
    bazi?: boolean;
    qimen?: boolean;
    liuyao?: boolean;
    meihua?: boolean;
  };
  qimen?: {
    mode?: string;
    direction?: string;
  };
  liuyao?: {
    mode?: string;
    yao?: string[];
  };
  meihua?: {
    mode?: string;
    timeMode?: string;
    time?: string;
    numbers?: Array<number | string>;
    upperTrigram?: string | null;
    lowerTrigram?: string | null;
    movingLine?: string | null;
  };
};

export type CouncilInput = {
  question: string;
  context?: string;
  clientProfile?: string;
  topic?: string;
  deliverableMode?: string;
  yixue?: YixuePayload;
};

// 依使用者勾選的模組回傳啟用術數名稱（有序）。報告與各輪 prompt 都只針對這些術數，
// 未啟用的術數不應出現在輸出。全空時保底給八字。
export function enabledTermNames(modules?: YixuePayload["modules"]): string[] {
  const m = modules || {};
  const names: string[] = [];
  if (m.bazi) names.push("八字命理");
  if (m.qimen) names.push("奇門遁甲");
  if (m.liuyao) names.push("卜卦／六爻");
  if (m.meihua) names.push("梅花易數");
  return names.length ? names : ["八字命理"];
}

function enabledModules(input: CouncilInput) {
  const names = enabledTermNames(input.yixue?.modules);
  return names.length ? names.join("、") : "未指定";
}

function meihuaBlock(m: YixuePayload["meihua"]): string {
  const mode = m?.mode || "未填";
  const lines = [`起卦方式：${mode}`];
  if (mode === "時間起卦") {
    lines.push(`時間依據：${m?.timeMode || "現在時間"}`);
    lines.push(`起卦時間：${m?.time || "未提供"}`);
    lines.push("請依此時間推算上下卦與動爻");
    return lines.join("\n");
  }
  if (Array.isArray(m?.numbers) && m.numbers.length) {
    lines.push(`輸入數字：${m.numbers.join("、")}（已依先天八卦數換算）`);
  }
  lines.push(`上卦：${m?.upperTrigram || "未填"}　下卦：${m?.lowerTrigram || "未填"}`);
  lines.push(`動爻：${m?.movingLine || "未填"}`);
  return lines.join("\n");
}

// 閏月只在農曆下有意義。使用者一直有填、schema 也一直有收，但這個區塊過去
// 沒印出來，農曆閏月的個案等於把閏月資訊丟掉——同一組年月日，閏月與正常月
// 相差約一個月，四柱會完全不同。
function leapMonthNote(input: CouncilInput): string {
  if (input.yixue?.birth?.calendar !== "農曆") return "";
  const flag = input.yixue?.birth?.isLeapMonth;
  return flag ? `（閏月：${flag}）` : "（閏月：未填）";
}

/**
 * @param chartBlock 系統排盤結果（已格式化）。有值時取代原本的出生資料區塊——
 *   以前是把生日原樣丟給 LLM 叫它自己推四柱，現在是程式算好叫它照用。
 *   排盤失敗時為空字串，行為與排盤引擎上線前完全相同。
 */
export function yixueDataBlock(input: CouncilInput, chartBlock = "") {
  if (chartBlock) {
    return `
【個案基本資料】
案主：${input.yixue?.clientName || "未填"}
性別／身份：${input.yixue?.gender || "未填"}
問題類型：${input.topic || "未指定"}
交付模式：${input.deliverableMode || "商業決策顧問報告"}
問題：${input.question || "未填"}
背景：${input.context || "未填"}

${chartBlock}

【事件／起局時間】
${input.yixue?.eventTime?.year || "未填"}-${input.yixue?.eventTime?.month || "未填"}-${input.yixue?.eventTime?.day || "未填"} ${input.yixue?.eventTime?.hour || "未填"}:${input.yixue?.eventTime?.minute || "未填"}

【啟用術數模組】
${enabledModules(input)}

【奇門遁甲資料】
起局方式：${input.yixue?.qimen?.mode || "未填"}
事件／對方方位：${input.yixue?.qimen?.direction || "未填"}

【卜卦／六爻資料】
起卦方式：${input.yixue?.liuyao?.mode || "未填"}
六爻：${input.yixue?.liuyao?.yao?.join("、") || "未填"}

【梅花易數資料】
${meihuaBlock(input.yixue?.meihua)}
`.trim();
  }

  return `
【個案基本資料】
案主：${input.yixue?.clientName || "未填"}
性別／身份：${input.yixue?.gender || "未填"}
問題類型：${input.topic || "未指定"}
交付模式：${input.deliverableMode || "商業決策顧問報告"}
問題：${input.question || "未填"}
背景：${input.context || "未填"}

【出生資料】
曆法：${input.yixue?.birth?.calendar || "未填"}${leapMonthNote(input)}
年月日：${input.yixue?.birth?.year || "未填"} 年 ${input.yixue?.birth?.month || "未填"} 月 ${input.yixue?.birth?.day || "未填"} 日
出生時辰：${input.yixue?.birth?.hourBranch || "未填"}；時辰確認：${input.yixue?.birth?.timeKnown || "未填"}

【事件／起局時間】
${input.yixue?.eventTime?.year || "未填"}-${input.yixue?.eventTime?.month || "未填"}-${input.yixue?.eventTime?.day || "未填"} ${input.yixue?.eventTime?.hour || "未填"}:${input.yixue?.eventTime?.minute || "未填"}

【啟用術數模組】
${enabledModules(input)}

【奇門遁甲資料】
起局方式：${input.yixue?.qimen?.mode || "未填"}
事件／對方方位：${input.yixue?.qimen?.direction || "未填"}

【卜卦／六爻資料】
起卦方式：${input.yixue?.liuyao?.mode || "未填"}
六爻：${input.yixue?.liuyao?.yao?.join("、") || "未填"}

【梅花易數資料】
${meihuaBlock(input.yixue?.meihua)}
`.trim();
}

// 四個分身的人設現在來自可編輯設定（後台）；未帶 settings 時用系統預設，
// 與改版前的寫死內容逐字元相同。
//
// 環境變數仍為最高優先，因為正式站可能設過。但它會讓後台編輯「看似無效」，
// 所以 promptEnvOverrides() 會把覆寫狀態送到後台顯示警告。
export function openaiFengYiSystem(settings: PromptSettings = DEFAULT_PROMPT_SETTINGS) {
  return process.env.OPENAI_FENGYI_SYSTEM_PROMPT || renderPersona(settings, "main");
}

export function geminiFengYiSystem(settings: PromptSettings = DEFAULT_PROMPT_SETTINGS) {
  return process.env.GEMINI_FENGYI_SYSTEM_PROMPT || renderPersona(settings, "strategy");
}

export function deepseekAttackSystem(settings: PromptSettings = DEFAULT_PROMPT_SETTINGS) {
  return process.env.DEEPSEEK_ATTACK_SYSTEM_PROMPT || renderPersona(settings, "attack");
}

export function fengYiFinalSystem(settings: PromptSettings = DEFAULT_PROMPT_SETTINGS) {
  return process.env.FENGYI_FINAL_SYSTEM_PROMPT || renderPersona(settings, "final");
}

/** 哪些分身目前被環境變數蓋掉。後台據此提示老師「這裡改了不會生效」。 */
export function promptEnvOverrides(): string[] {
  return [
    ["主判讀分身", process.env.OPENAI_FENGYI_SYSTEM_PROMPT],
    ["策略推演分身", process.env.GEMINI_FENGYI_SYSTEM_PROMPT],
    ["攻防反證分身", process.env.DEEPSEEK_ATTACK_SYSTEM_PROMPT],
    ["最終定稿分身", process.env.FENGYI_FINAL_SYSTEM_PROMPT]
  ]
    .filter(([, v]) => Boolean(v))
    .map(([label]) => label as string);
}

export function firstRoundPrompt(input: CouncilInput, chartBlock = "") {
  const terms = enabledTermNames(input.yixue?.modules);
  const termLines = terms.map((t) => `- ${t}初判`).join("\n");
  return `
請依「巽風易學決策系統」進行第一輪內部判讀。重點不是聊天，而是術數決策分析。
本次只啟用以下術數：${terms.join("、")}。只針對這些術數判讀，未啟用的術數不要分析、不要提及。

${yixueDataBlock(input, chartBlock)}

請輸出：
- 啟用術數資料完整度檢查
${termLines}
- 主要風險
- 可執行建議
`.trim();
}

export function debatePrompt(input: CouncilInput, firstRoundText: string, chartBlock = "") {
  return `
以下是第一輪內部判讀，請進行攻防校核與修正。不得離開易學決策系統主軸。

${yixueDataBlock(input, chartBlock)}

【第一輪內容】
${firstRoundText}

請輸出：
- 哪些判斷可以保留
- 哪些判斷過度或資料不足
- 四術之間是否互相支持或矛盾
- 如何修正成可交付顧問報告
`.trim();
}

export function finalSummaryPrompt(
  input: CouncilInput,
  firstRoundText: string,
  debateRoundText: string,
  chartBlock = ""
) {
  const terms = enabledTermNames(input.yixue?.modules);
  return `
請以「風羿老師最終定稿」輸出正式報告。不要分列任何模型名稱；它們只是內部校核。
本次只啟用以下術數：${terms.join("、")}。正式報告只能分析並輸出這些術數，未啟用的術數一律不得出現（不要寫占位、不要寫「資料不足無法判斷」）。

${yixueDataBlock(input, chartBlock)}

【第一輪內部判讀】
${firstRoundText}

【攻防校核內容】
${debateRoundText}

請整合上述內容，依後續「最終定稿要求」所列的段落與順序輸出正式報告。
`.trim();
}

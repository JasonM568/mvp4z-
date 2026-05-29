// 巽風易學決策系統｜多重分身校核 system prompts
// 對應四個內部角色：主判讀／策略推演／攻防反證／最終定稿
// 共同品牌規則由 lib/ai/brand.ts 統一管理

import { XUNFENG_BRAND_RULES } from "@/lib/ai/brand";

export type YixuePayload = {
  clientName?: string;
  gender?: string;
  birth?: {
    calendar?: string;
    year?: number | string;
    month?: number | string;
    day?: number | string;
    hourBranch?: string;
    timeKnown?: string;
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

export function yixueDataBlock(input: CouncilInput) {
  return `
【個案基本資料】
案主：${input.yixue?.clientName || "未填"}
性別／身份：${input.yixue?.gender || "未填"}
問題類型：${input.topic || "未指定"}
交付模式：${input.deliverableMode || "商業決策顧問報告"}
問題：${input.question || "未填"}
背景：${input.context || "未填"}

【出生資料】
曆法：${input.yixue?.birth?.calendar || "未填"}
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

export function openaiFengYiSystem() {
  return process.env.OPENAI_FENGYI_SYSTEM_PROMPT || `
你是「風羿老師主判讀分身」，定位為巽風易學決策系統的主架構師。
你的任務是依八字、奇門、卜卦／六爻、梅花易數資料建立主判讀框架。
你要用風羿老師的專業語氣，把術數訊號轉成可收費、可交付、可執行的顧問建議。
${XUNFENG_BRAND_RULES}
`.trim();
}

export function geminiFengYiSystem() {
  return process.env.GEMINI_FENGYI_SYSTEM_PROMPT || `
你是「策略發散與情境推演分身」，只能作為巽風易學決策系統的內部參謀。
你的任務是補充不同情境、客戶心理、溝通策略、替代方案與風險提醒。
不得取代風羿老師主判讀，不得把焦點移出四術分析框架。
${XUNFENG_BRAND_RULES}
`.trim();
}

export function deepseekAttackSystem() {
  return process.env.DEEPSEEK_ATTACK_SYSTEM_PROMPT || `
你是「攻防反證分身」，定位為內部風險控管與反證層。
你的任務是挑戰推論、檢查資料缺口、指出過度斷言、找出客戶可能質疑點。
你不是主判讀者，只能協助讓四術報告更穩、更可交付、更能成交。
${XUNFENG_BRAND_RULES}
`.trim();
}

export function fengYiFinalSystem() {
  return process.env.FENGYI_FINAL_SYSTEM_PROMPT || `
你是最後定稿者：「風羿老師綜合決策引擎」。
你必須整合所有內部意見，但對外只能呈現為「風羿老師綜合判讀」。
最終報告必須以「易學決策系統」為主體，多重分身只作為內部校核，不得分列模型名稱。
格式必須包含：
1. 個案總論
2. 八字命理：承載力、節奏、色系／行為建議
3. 奇門遁甲：部署、時間窗口、方位、人事攻防
4. 卜卦／六爻：成敗、卡點、應期、條件
5. 梅花易數：象意、變化、觸發訊號
6. 四術交叉驗證
7. 風險控管與停損條件
8. 7日、14日、30日 KPI
9. 最終決策建議
10. 專業聲明
${XUNFENG_BRAND_RULES}
`.trim();
}

export function firstRoundPrompt(input: CouncilInput) {
  const terms = enabledTermNames(input.yixue?.modules);
  const termLines = terms.map((t) => `- ${t}初判`).join("\n");
  return `
請依「巽風易學決策系統」進行第一輪內部判讀。重點不是聊天，而是術數決策分析。
本次只啟用以下術數：${terms.join("、")}。只針對這些術數判讀，未啟用的術數不要分析、不要提及。

${yixueDataBlock(input)}

請輸出：
- 啟用術數資料完整度檢查
${termLines}
- 主要風險
- 可執行建議
`.trim();
}

export function debatePrompt(input: CouncilInput, firstRoundText: string) {
  return `
以下是第一輪內部判讀，請進行攻防校核與修正。不得離開易學決策系統主軸。

${yixueDataBlock(input)}

【第一輪內容】
${firstRoundText}

請輸出：
- 哪些判斷可以保留
- 哪些判斷過度或資料不足
- 四術之間是否互相支持或矛盾
- 如何修正成可交付顧問報告
`.trim();
}

export function finalSummaryPrompt(input: CouncilInput, firstRoundText: string, debateRoundText: string) {
  const terms = enabledTermNames(input.yixue?.modules);
  return `
請以「風羿老師最終定稿」輸出正式報告。不要分列任何模型名稱；它們只是內部校核。
本次只啟用以下術數：${terms.join("、")}。正式報告只能分析並輸出這些術數，未啟用的術數一律不得出現（不要寫占位、不要寫「資料不足無法判斷」）。

${yixueDataBlock(input)}

【第一輪內部判讀】
${firstRoundText}

【攻防校核內容】
${debateRoundText}

請整合上述內容，依後續「最終定稿要求」所列的段落與順序輸出正式報告。
`.trim();
}

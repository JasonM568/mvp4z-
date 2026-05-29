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

function enabledModules(input: CouncilInput) {
  const m = input.yixue?.modules || {};
  const names: string[] = [];
  if (m.bazi) names.push("八字命理");
  if (m.qimen) names.push("奇門遁甲");
  if (m.liuyao) names.push("卜卦／六爻");
  if (m.meihua) names.push("梅花易數");
  return names.length ? names.join("、") : "未指定";
}

function meihuaBlock(m: YixuePayload["meihua"]): string {
  const mode = m?.mode || "未填";
  const lines = [`起卦方式：${mode}`];
  if (mode === "時間起卦") {
    lines.push("依事件／起局時間起卦（請依上方事件時間推算上下卦與動爻）");
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
  return `
請依「巽風易學決策系統」進行第一輪內部判讀。重點不是聊天，而是四術決策分析。

${yixueDataBlock(input)}

請輸出：
- 四術資料完整度檢查
- 八字命理初判
- 奇門部署初判
- 卜卦／六爻事件初判
- 梅花象意初判
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
  return `
請以「風羿老師最終定稿」輸出正式報告。不要分列任何模型名稱；它們只是內部校核。

${yixueDataBlock(input)}

【第一輪內部判讀】
${firstRoundText}

【攻防校核內容】
${debateRoundText}

請輸出正式商業報告，格式如下：

巽風易學綜合決策報告

一、個案總論
說明本案整體局勢、可動／不可動、主風險與主策略。

二、八字命理判讀
包含承載力、節奏、色系、行為策略。若出生時辰或節氣資料不足，必須標明降權。

三、奇門遁甲部署
包含方位、時機、人事攻防、先後手策略、可借勢資源。

四、卜卦／六爻事件判讀
包含成敗條件、卡點、應期、需要補強的承諾或文件。

五、梅花易數象意提示
包含象意、變化訊號、三日內可觀察的人事物、數字、方向或語句。

六、四術交叉驗證
指出四術同向處、矛盾處、資料不足處。

七、行動方案
列出 7日、14日、30日 KPI。

八、風險控管
列出停損條件、不可做事項、需要補資料事項。

九、最終建議
直接給結論：可進、可試行、暫緩、或需重新起局／補資料。

十、專業聲明
本報告為易學決策輔助；涉及陽宅、陰宅或重大決策，仍需由風羿老師本人親至現場評估。
`.trim();
}

// 巽風 council 品質門檻與品牌替換層
// 1. cleanReportText：對外硬性替換所有技術字眼為品牌語
// 2. buildQualityGate / buildFinalFormatPrompt：強制十段式輸出結構
// 3. buildSafeFallbackReport：LLM 全失敗時的兜底正式報告
// 4. hasUsableFinal：判定終稿是否可交付

import { CouncilInput } from "@/lib/ai/council/personas";

export function cleanReportText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s?/g, "")
    .replace(/---+/g, "")
    .replace(/OpenAI/gi, "巽風主判讀分身")
    .replace(/Gemini/gi, "巽風策略推演分身")
    .replace(/DeepSeek/gi, "巽風攻防反證分身")
    .replace(/AI\s*軍團/g, "風羿老師多重分身校核")
    .replace(/API\s*Key/gi, "系統金鑰")
    .replace(/API/gi, "系統介面")
    .replace(/後端/g, "後台")
    .replace(/quota/gi, "系統額度狀態")
    .replace(/billing/gi, "系統帳務狀態")
    .replace(/access denied/gi, "系統權限狀態")
    .replace(/denied access/gi, "系統權限狀態")
    .replace(/timeout/gi, "系統回應逾時")
    .replace(/error/gi, "系統狀態")
    .replace(/Error/g, "系統狀態")
    .trim();
}

export function buildQualityGate(input: CouncilInput) {
  return `
品質門檻，必須遵守：

一、品牌規則
1. 對外正式報告不得出現：OpenAI、Gemini、DeepSeek、AI軍團、模型、API、後端、quota、billing、access denied、timeout、error 等技術字眼。
2. 對外統一稱為：「風羿老師多重分身校核」或「巽風多維校核系統」。
3. 報告要像顧問交付文件，不要像一般聊天回答。
4. 若分身校核未完整完成，正式報告只能說「資料仍需補強」或「校核未達交付標準」，不得揭露技術錯誤。

二、格式規則
1. 不准使用 Markdown 粗體符號，例如：**、*、###、---。
2. 標題只用中文序號，例如：「一、個案總論」。
3. 不准輸出星號項目符號。
4. 條列請使用「1.」「2.」「3.」。
5. 每一段都要清楚、可讀、可交付。

三、內容規則
1. 不得寫空話，例如：低風險推進、調整作息、注意文件，除非明確說明怎麼做、何時做、做到什麼標準。
2. 每一術都必須有自己的獨立論述，不可只寫綜合結論。
3. 每一術至少要包含：資料輸入、推理過程、初步判斷、風險點、可行策略、本術數小結。
4. 如果資料不足，要說明哪些資料不足、造成哪個判斷降權、要補什麼資料。
5. ${input.topic || "本案"}必須輸出具體決策語句：可進、可試行、暫緩、不可進、或需補資料後再判。
6. 行動方案必須分成：3日內、7日內、30日內。
7. 投資、財務、法律、醫療相關內容必須提醒風險，不可保證獲利或結果。
8. 結論要明確，但不得神化或保證結果。
`.trim();
}

export function buildFinalFormatPrompt() {
  return `
最終定稿要求：

一、格式規則
1. 不准使用 Markdown 粗體符號，例如 **、*、###、---。
2. 標題只用中文序號，例如：「一、個案總論」。
3. 不准輸出星號項目符號。
4. 條列請使用「1.」「2.」「3.」。
5. 對外報告不得出現 OpenAI、Gemini、DeepSeek、AI軍團、模型、API、後端、quota、billing、access denied、timeout、error 等技術字眼。
6. 統一使用「風羿老師多重分身校核」或「巽風多維校核系統」。

二、內容規則
本報告不是摘要，必須寫出四術各自的分析過程。每一項術數都必須依照以下結構輸出：

1. 資料輸入
2. 推理過程
3. 初步判斷
4. 風險點
5. 可行策略
6. 本術數小結

三、正式報告格式

巽風易學綜合決策報告

一、個案總論
1. 最終決策建議：可進、可試行、暫緩、不建議、或補資料後再判。
2. 最大機會。
3. 最大風險。
4. 本案建議採取的操作節奏。

二、四術資料完整度檢核
請用純文字表格呈現：
術數｜已取得資料｜不足資料｜可判斷程度｜降權原因
八字命理｜
奇門遁甲｜
卜卦／六爻｜
梅花易數｜

三、八字命理獨立判讀
1. 資料輸入
2. 推理過程
3. 初步判斷
4. 風險點
5. 可行策略
6. 八字小結

四、奇門遁甲獨立判讀
1. 資料輸入
2. 推理過程
3. 初步判斷
4. 風險點
5. 可行策略
6. 奇門小結

五、卜卦／六爻獨立判讀
1. 資料輸入
2. 推理過程
3. 初步判斷
4. 風險點
5. 可行策略
6. 卜卦／六爻小結

六、梅花易數獨立判讀
1. 資料輸入
2. 推理過程
3. 初步判斷
4. 風險點
5. 可行策略
6. 梅花易數小結

七、四術交叉驗證
1. 同向訊號
2. 矛盾訊號
3. 權重排序
4. 綜合判斷

八、行動方案
1. 3日內
動作：
檢核標準：
停損條件：

2. 7日內
動作：
檢核標準：
停損條件：

3. 30日內
動作：
檢核標準：
停損條件：

九、最終建議
請用五句話內做決策收束，必須具體，不可空泛。

十、專業聲明
本報告為易學決策輔助；涉及陽宅、陰宅、重大投資、法律、醫療或不可逆決策，仍需由風羿老師本人進一步確認或親至現場評估。
`.trim();
}

export function buildSafeFallbackReport(input: CouncilInput) {
  const anyInput = input as any;
  const yixue = anyInput?.yixue || {};
  const clientName = yixue?.clientName || input?.clientProfile || "未填";
  const question = input?.question || "未填";
  const topic = input?.topic || "未指定";

  const birth = yixue?.birth;
  const eventTime = yixue?.eventTime;
  const qimenMode = yixue?.qimen?.mode || "未指定";
  const direction = yixue?.qimen?.direction || "不確定";
  const liuyaoMode = yixue?.liuyao?.mode || "未指定";
  const liuyaoYao = Array.isArray(yixue?.liuyao?.yao) ? yixue.liuyao.yao.join("、") : "未提供";
  const meihuaMode = yixue?.meihua?.mode || "未指定";
  const upperGua = yixue?.meihua?.upperTrigram || "未提供";
  const lowerGua = yixue?.meihua?.lowerTrigram || "未提供";

  const birthText = birth
    ? `${birth.calendar || "曆法未填"} ${birth.year || "年未填"}年${birth.month || "月未填"}月${birth.day || "日未填"}日 ${birth.hourBranch || "時辰未填"}時`
    : "未提供";
  const eventText = eventTime
    ? `${eventTime.year || "年未填"}年${eventTime.month || "月未填"}月${eventTime.day || "日未填"}日 ${eventTime.hour || "時未填"}時${eventTime.minute || "分未填"}分`
    : "未提供";

  return `巽風易學綜合決策報告

一、個案總論
1. 案主：${clientName}。
2. 問題主軸：${question}。
3. 問題類型：${topic}。
4. 最終決策建議：補資料後再判，現階段不建議直接做不可逆決策。
5. 最大機會：本案已具備初步問事資料，可先建立風險盤點、四術補件與短期觀察架構。
6. 最大風險：目前部分術數資料尚未完整，若直接下定論，容易把象意提示誤當成最後決策。
7. 操作節奏：暫緩擴大投入，先補齊資料，再由風羿老師進行正式覆核。

二、四術資料完整度檢核
術數｜已取得資料｜不足資料｜可判斷程度｜降權原因
八字命理｜出生資料：${birthText}｜仍需確認完整四柱、大運、流年、問題標的屬性｜中｜未完成命局與大運交叉比對
奇門遁甲｜問事時間：${eventText}；起局方式：${qimenMode}；方位：${direction}｜仍需確認用神、事件方、資金方、對手方或標的方｜中低｜方位與用神資料不足
卜卦／六爻｜起卦方式：${liuyaoMode}；六爻資料：${liuyaoYao}｜仍需確認世應、用神、動爻、變卦｜低｜若未親自起卦，判斷效力需降權
梅花易數｜起卦方式：${meihuaMode}；上卦：${upperGua}；下卦：${lowerGua}｜仍需確認動爻、互卦、變卦、體用生剋｜中低｜缺動爻時不能直接定後勢

三、八字命理獨立判讀
本段需依案主出生資料、大運、流年、問題標的屬性進行完整評估。資料尚不完整前，僅作承載力與風險提示，不下定論。

四、奇門遁甲獨立判讀
需補事件方位、資金狀態、標的性質與決策期限。建議先採控局策略，找出觀察點、推進點、停損點。

五、卜卦／六爻獨立判讀
若以時間起卦，僅能作為輔助參考。建議由案主親自起卦，並把問題縮小為可判斷成敗與應期的具體題目。

六、梅花易數獨立判讀
本段需補動爻、互卦、變卦資料，方能完整判斷後勢。

七、四術交叉驗證
1. 同向訊號：四術共同指向「資料尚需補強，暫不宜做不可逆決策」。
2. 矛盾訊號：尚待補齊資料後再判定。
3. 權重排序：本案初步建議奇門 35%、八字 30%、六爻 20%、梅花 15%。
4. 綜合判斷：暫緩擴大投入，補齊資料再決定。

八、行動方案
1. 3日內
動作：整理本案所有已投入資源、金額、時間、人員、合約與關鍵承諾。
檢核標準：能清楚列出成本、風險、可承受損失與最壞情境。
停損條件：若無法說清楚停損點，不得追加資金或承諾。

2. 7日內
動作：補齊完整八字、大運資料、事件方位、六爻卦象與梅花動爻。
檢核標準：四術資料完整度至少達到 80%。
停損條件：若補資料後三術以上同時指向不利，停止所有新投入。

3. 30日內
動作：建立追蹤表，每週檢查一次結果、風險、資金壓力與是否符合原策略。
檢核標準：每週都能判斷續行、減碼、停損或觀望。
停損條件：若實際結果連續兩週偏離原判斷，立即進入保守模式。

九、最終建議
1. 本案目前不建議直接加碼或做不可逆承諾。
2. 已投入的資源應先進入風險控管模式。
3. 四術資料尚未完整，正式定案前只能採「暫緩與補件」策略。
4. 若後續補齊資料後出現三術以上同向，才可進一步判定是否推進。
5. 最終仍需由風羿老師本人進一步覆核後，才能作為正式交付建議。

十、專業聲明
本報告為易學決策輔助；涉及陽宅、陰宅、重大投資、法律、醫療或不可逆決策，仍需由風羿老師本人進一步確認或親至現場評估。`;
}

export function hasUsableFinal(final: { ok: boolean; text?: string } | null | undefined) {
  if (!final || !final.ok || !final.text) return false;
  const text = String(final.text);
  const forbidden = [
    "exceeded your current quota",
    "quota",
    "billing",
    "denied access",
    "access denied",
    "timeout",
    "逾時",
    "失敗",
    "API",
    "OpenAI",
    "Gemini",
    "DeepSeek",
    "error",
    "Error"
  ];
  return !forbidden.some((word) => text.includes(word));
}

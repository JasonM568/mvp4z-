// 巽風 council 品質門檻與品牌替換層
// 1. cleanReportText：對外硬性替換所有技術字眼為品牌語
// 2. buildQualityGate / buildFinalFormatPrompt：強制十段式輸出結構
// 3. buildSafeFallbackReport：LLM 全失敗時的兜底正式報告
// 4. hasUsableFinal：判定終稿是否可交付

import { CouncilInput, enabledTermNames } from "@/lib/ai/council/personas";
import { DEFAULT_PROMPT_SETTINGS } from "./settings/defaults";
import {
  renderFallbackReport,
  renderQualityGate,
  renderReportSkeleton,
  type FallbackContext
} from "./settings/render";
import type { PromptSettings } from "./settings/schema";

const CJK_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四"];

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

export function buildQualityGate(input: CouncilInput, settings: PromptSettings = DEFAULT_PROMPT_SETTINGS) {
  return renderQualityGate(settings, {
    enabledTerms: enabledTermNames(input.yixue?.modules),
    topic: input.topic || "本案"
  });
}

export function buildFinalFormatPrompt(
  enabledTerms: string[],
  settings: PromptSettings = DEFAULT_PROMPT_SETTINGS
) {
  return renderReportSkeleton(settings, enabledTerms);
}

export function buildSafeFallbackReport(
  input: CouncilInput,
  settings: PromptSettings = DEFAULT_PROMPT_SETTINGS
) {
  return renderFallbackReport(settings, fallbackContext(input));
}

/** 從 CouncilInput 取出兜底報告要填的值。缺值一律用中文佔位詞，不留空。 */
function fallbackContext(input: CouncilInput): FallbackContext {
  const yixue = (input as { yixue?: Record<string, unknown> })?.yixue as Record<string, any> | undefined;
  const birth = yixue?.birth;
  const eventTime = yixue?.eventTime;

  return {
    clientName: yixue?.clientName || input?.clientProfile || "未填",
    question: input?.question || "未填",
    topic: input?.topic || "未指定",
    birthText: birth
      ? `${birth.calendar || "曆法未填"} ${birth.year || "年未填"}年${birth.month || "月未填"}月${birth.day || "日未填"}日 ${birth.hourBranch || "時辰未填"}時`
      : "未提供",
    eventText: eventTime
      ? `${eventTime.year || "年未填"}年${eventTime.month || "月未填"}月${eventTime.day || "日未填"}日 ${eventTime.hour || "時未填"}時${eventTime.minute || "分未填"}分`
      : "未提供",
    qimenMode: yixue?.qimen?.mode || "未指定",
    qimenDirection: yixue?.qimen?.direction || "不確定",
    liuyaoMode: yixue?.liuyao?.mode || "未指定",
    liuyaoYao: Array.isArray(yixue?.liuyao?.yao) ? yixue.liuyao.yao.join("、") : "未提供",
    meihuaMode: yixue?.meihua?.mode || "未指定",
    meihuaUpper: yixue?.meihua?.upperTrigram || "未提供",
    meihuaLower: yixue?.meihua?.lowerTrigram || "未提供"
  };
}

export function hasUsableFinal(final: { ok: boolean; text?: string } | null | undefined) {
  if (!final || !final.ok || !final.text) return false;
  const text = String(final.text).trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  // 第一關：只攔「絕不會出現在正式顧問報告」的硬錯誤／額度／金鑰／限流特徵。
  // 不再用「失敗」這類風險／停損報告本來就會出現的正常詞，
  // 也不攔 error／API／模型名——那些由 cleanReportText 洗稿處理，誤殺只會把好報告退成兜底稿。
  const hardErrorMarkers = [
    "exceeded your current quota",
    "insufficient_quota",
    "incorrect api key",
    "invalid api key",
    "access denied",
    "denied access",
    "rate limit",
    "無內容回傳",
    "校核未完成"
  ];
  if (hardErrorMarkers.some((marker) => lower.includes(marker.toLowerCase()))) return false;
  // 第二關：結構檢查取代「字數門檻」。真正的易學決策報告一定具備十段式骨架
  // （四術名稱 + 關鍵段落）；模型回的短拒絕訊息或錯誤短訊不會命中這些錨點。
  // 用「命中幾個結構錨點」判斷，比猜字數更準也不用魔術數字。
  const structureAnchors = [
    "八字",
    "奇門",
    "梅花",
    "卜卦",
    "六爻",
    "個案總論",
    "行動方案",
    "最終建議",
    "專業聲明",
    "交叉驗證"
  ];
  const anchorHits = structureAnchors.filter((anchor) => text.includes(anchor)).length;
  return anchorHits >= 4;
}

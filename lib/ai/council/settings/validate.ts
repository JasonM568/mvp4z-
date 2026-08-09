// 巽風 council｜存檔前驗證
//
// zod 只驗形狀。這裡驗的是「形狀對但會出事」的內容問題：
// 1. 鎖定條目被刪掉 → 品牌露餡、技術字眼外洩
// 2. 必要變數被刪掉 → 報告會出現未啟用的術數，或缺少決策語句
// 3. 內容長度失控 → prompt 在一份報告裡送 7 次，字數成本是七倍
//
// 錯誤訊息會直接顯示給風羿老師，所以要講人話：說清楚哪一段、為什麼不行。

import { DEFAULT_PROMPT_SETTINGS } from "./defaults";
import type { PromptSettings, RuleItem } from "./schema";

/** 整份設定進 prompt 的字數上限（不含文件庫）。超過會擠壓模型 45 秒的回應視窗。 */
export const SETTINGS_CHAR_BUDGET = 12000;

type RuleList = { label: string; items: RuleItem[]; defaults: RuleItem[] };

function ruleLists(s: PromptSettings): RuleList[] {
  const d = DEFAULT_PROMPT_SETTINGS;
  return [
    { label: "品牌共同規則", items: s.brand.items, defaults: d.brand.items },
    { label: "品質門檻／品牌規則", items: s.qualityGate.brandRules.items, defaults: d.qualityGate.brandRules.items },
    { label: "品質門檻／格式規則", items: s.qualityGate.formatRules.items, defaults: d.qualityGate.formatRules.items },
    { label: "品質門檻／內容規則", items: s.qualityGate.contentRules.items, defaults: d.qualityGate.contentRules.items },
    { label: "報告骨架／格式規則", items: s.reportSkeleton.formatRules.items, defaults: d.reportSkeleton.formatRules.items }
  ];
}

/** 粗估整份設定會產生多少 prompt 字數。 */
export function estimateSettingsChars(s: PromptSettings): number {
  return JSON.stringify(s).length;
}

export function validateSettings(s: PromptSettings): string[] {
  const errors: string[] = [];

  for (const list of ruleLists(s)) {
    const requiredLocked = list.defaults.filter((i) => i.isLocked).length;
    const stillLocked = list.items.filter((i) => i.isLocked).length;
    if (stillLocked < requiredLocked) {
      errors.push(
        `「${list.label}」少了 ${requiredLocked - stillLocked} 條系統鎖定規則。` +
          `這些規則刪掉會讓報告出現技術字眼或模型名稱，請按「還原成預設」把它們補回來。`
      );
    }

    for (const item of list.items) {
      for (const token of item.requiredTokens) {
        if (!item.text.includes(token)) {
          errors.push(
            `「${list.label}」有一條規則刪掉了必要變數 ${token}：「${item.text.slice(0, 24)}⋯」。` +
              `這個變數會被系統換成實際內容，刪掉報告就會出錯。`
          );
        }
      }
    }
  }

  // 各術共用小節若沒有術數名稱變數，四術的小結標題會長得一模一樣
  if (!s.reportSkeleton.termSubsections.join("").includes("{{術數名稱}}")) {
    errors.push(
      "「報告骨架／各術共用小節」缺少 {{術數名稱}} 變數，四個術數的小結會變成一樣的標題。"
    );
  }

  const weights = s.fallbackReport.weights;
  const total = weights.bazi + weights.qimen + weights.liuyao + weights.meihua;
  if (total !== 100) {
    errors.push(`兜底報告的四術權重加總是 ${total}%，請調整成 100%。`);
  }

  if (!s.reportSkeleton.actionPlan.windows.length) {
    errors.push("「報告骨架／行動方案」至少要保留一個期別。");
  }

  const chars = estimateSettingsChars(s);
  if (chars > SETTINGS_CHAR_BUDGET) {
    errors.push(
      `設定內容共 ${chars} 字，超過上限 ${SETTINGS_CHAR_BUDGET} 字。` +
        `這些文字在一份報告裡會被送出 7 次，過長會讓模型回應逾時，請精簡後再存。`
    );
  }

  return errors;
}

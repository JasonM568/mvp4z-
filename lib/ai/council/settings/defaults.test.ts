// 巽風 council｜設定預設值健全性
//
// 這個檔原本是重構期間的「渲染器 vs 寫死實作」逐字元 A/B 比對。
// 2026-08-09 重構完成、寫死實作移除後，兩邊都走同一條渲染路徑，再比就是套套邏輯，
// 所以那組比對已刪除。輸出正確性改由 prompt-baseline.test.ts 的 snapshot 把關——
// 那些 snapshot 是在動手重構前、從寫死實作的實際輸出寫入的。
//
// 這裡保留的是預設值本身的健全性檢查，這些在日後編輯預設值時仍有價值。

import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPT_SETTINGS as D } from "./defaults";
import { promptSettingsSchema } from "./schema";

function allRuleItems() {
  return [
    ...D.brand.items,
    ...D.qualityGate.brandRules.items,
    ...D.qualityGate.formatRules.items,
    ...D.qualityGate.contentRules.items,
    ...D.reportSkeleton.formatRules.items
  ];
}

describe("預設設定健全性", () => {
  it("通過 zod 驗證", () => {
    expect(() => promptSettingsSchema.parse(D)).not.toThrow();
  });

  it("鎖定條目都有寫鎖定原因", () => {
    // 後台會把 lockReason 顯示給老師看。沒有理由的鎖定只會讓他覺得系統在刁難。
    for (const item of allRuleItems().filter((i) => i.isLocked)) {
      expect(item.lockReason, item.text.slice(0, 24)).not.toBe("");
    }
  });

  it("宣告 requiredTokens 的條目確實含有該 token", () => {
    for (const item of allRuleItems()) {
      for (const token of item.requiredTokens) {
        expect(item.text, `${token} 應出現在條文中`).toContain(token);
      }
    }
  });

  it("兜底報告的四術權重加總為 100", () => {
    const w = D.fallbackReport.weights;
    expect(w.bazi + w.qimen + w.liuyao + w.meihua).toBe(100);
  });

  it("兜底報告的完整度表格與各術判讀涵蓋相同的四術", () => {
    expect(Object.keys(D.fallbackReport.completeness.rows).sort()).toEqual(
      Object.keys(D.fallbackReport.termReadings).sort()
    );
  });

  it("各術共用小節有帶術數名稱 token，否則四術小結會長一樣", () => {
    expect(D.reportSkeleton.termSubsections.join()).toContain("{{術數名稱}}");
  });
});

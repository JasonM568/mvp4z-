import { describe, expect, it } from "vitest";
import { mergeSignature } from "./load";

// 這組測試重現 2026-09-22 查到的實際狀況：
// 老師 2026-09-08 12:39 發布了流派 v2，DB 的 decided_by 欄位寫著「風羿老師」，
// 但 settings.decidedBy 是空字串。引擎與後台橫幅讀的都是 settings，
// 於是每一份收費報告都對客戶印「採用流派：…（暫定，待簽核）」，
// 後台也顯示「尚未經老師簽核」——他簽了，系統說他沒簽。
const LEGACY = {
  id: "fengyi-v1",
  label: "風羿老師流派 v1（暫定，待簽核）",
  decidedAt: "",
  decidedBy: "",
  calendar: { timezone: "Asia/Taipei" }
};

function sig(settings: unknown, by: unknown, at: unknown) {
  return mergeSignature(settings, by, at) as { decidedBy: string; decidedAt: string };
}

describe("mergeSignature", () => {
  it("重現事故：settings 沒有簽核、DB 欄位有，必須補起來", () => {
    const r = sig(LEGACY, "風羿老師", "2026-09-08T12:39:00+00:00");
    expect(r.decidedBy).toBe("風羿老師");
    expect(r.decidedAt).toBe("2026-09-08");
  });

  it("settings 已有簽核時不覆蓋——那是更晚寫入的來源", () => {
    const r = sig(
      { ...LEGACY, decidedBy: "風羿老師本人", decidedAt: "2026-09-10" },
      "誰",
      "2026-01-01T00:00:00+00:00"
    );
    expect(r.decidedBy).toBe("風羿老師本人");
    expect(r.decidedAt).toBe("2026-09-10");
  });

  it("兩邊都沒有就維持未簽核，不得憑空生出拍板人", () => {
    const r = sig(LEGACY, null, null);
    expect(r.decidedBy).toBe("");
    expect(r.decidedAt).toBe("");
  });

  it("只有發布時間沒有拍板人時，不算簽核", () => {
    const r = sig(LEGACY, "", "2026-09-08T12:39:00+00:00");
    expect(r.decidedBy).toBe("");
  });

  it("不動 settings 的其他欄位", () => {
    const r = mergeSignature(LEGACY, "風羿老師", "2026-09-08T12:39:00+00:00") as Record<string, unknown>;
    expect(r.id).toBe("fengyi-v1");
    expect(r.label).toBe("風羿老師流派 v1（暫定，待簽核）");
    expect(r.calendar).toEqual({ timezone: "Asia/Taipei" });
  });

  it("settings 形狀壞掉時原樣回傳，不得丟例外", () => {
    // 流派讀不到要回退預設值讓報告照常產出，不是讓報告掛掉。
    expect(mergeSignature(null, "風羿老師", "2026-09-08")).toBeNull();
    expect(mergeSignature("壞掉", "風羿老師", "2026-09-08")).toBe("壞掉");
  });
});

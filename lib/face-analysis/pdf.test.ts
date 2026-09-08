// 面相報告 PDF。
//
// ⚠️ 這組測試只能證明「產得出檔、內容有進去」，**不能證明畫面是對的**。
// 2026-09-08 的教訓：pdf-lib 產出通篇亂碼時，API 不報錯、位元組數正常、
// 連字寬量測都正確——只有把 PDF 轉成圖片看過才會發現。
// 改字型或改 PDF 套件時，請務必人工看一次產出的畫面。

import { describe, expect, it } from "vitest";
import { renderFaceReportPdf } from "./pdf";

const FIXTURE = {
  summary: "目前處在「機會多但承接力不足」的階段，先收斂戰線再談擴張。",
  currentTrend: "近三個月人事變動頻繁，決策容易被他人情緒帶走。",
  coreHighlights: [
    "額頭寬闊飽滿，早年得長輩助力，規劃能力是強項。",
    "山根略低，長期承擔的事情容易在中途動搖。",
    "法令紋清晰，對規則與制度有天然的掌握力。"
  ],
  photoFingerprint: [
    {
      partName: "額頭",
      observation: "額頭寬闊飽滿，髮際線平整",
      palaces: ["官祿宮", "父母宮"],
      teaching: "額主早年運與長輩緣，寬闊者思慮開闊。",
      interpretation: "早年得長輩提攜，規劃與統籌是天生的強項。",
      flowYearNote: "十五至三十歲行額部運。"
    },
    {
      partName: "山根",
      observation: "山根位置略低，兩側略窄",
      palaces: ["疾厄宮"],
      teaching: "山根為疾厄所在，宜豐隆不宜低陷。",
      interpretation: "面對需要長期承擔的事，中途容易動搖，宜先立書面承諾。"
    }
  ],
  lifeAreas: {
    career: {
      conclusion: "可推進，但要先把權責寫清楚。",
      alignment: "high",
      confidence: "medium",
      visibleBasis: "額頭寬闊、法令紋清晰。",
      teacherInterpretation: "有統籌能力，但缺乏中途受阻時的支撐。",
      watchout: "承諾過多而分身乏術。",
      action: "本月只推進一個專案，其餘延後。"
    },
    health: {
      conclusion: "留意休息節奏。",
      alignment: "medium",
      confidence: "low",
      visibleBasis: "山根略低。",
      teacherInterpretation: "傳統認為此處主承受力。",
      watchout: "連續熬夜。",
      action: "固定就寢時間。"
    }
  },
  priorityAdvice: [
    { problem: "戰線過長", reason: "同時推進的事情超過可承接的量。", advice: "本月只留一件主線，其餘明確延後。" },
    { problem: "決策被情緒影響", reason: "近期人事變動頻繁。", advice: "重大決定隔一天再確認一次。" },
    { problem: "口頭承諾過多", reason: "山根所示的中途動搖。", advice: "所有承諾改為書面。" }
  ],
  surfaceAnalysis: {
    summary: "整體氣色平穩，無明顯異常。",
    complexionObservation: "面部氣色偏亮，兩頰略帶乾。",
    filterWarning: null,
    detectedFeatures: [
      { type: "mole", location: "左眉尾上方", observation: "小痣一顆", traditionalReference: "眉尾主兄弟宮。" }
    ]
  },
  flowYear: {
    age: 38,
    positions: [
      { method: "seventy_five_regions", position: "年上", observation: "略顯低陷。" },
      { method: "nine_value", position: "中停", observation: "整體平穩。" }
    ],
    crossCheck: "兩法皆指向中段承擔力偏弱。",
    gates: ["三十九歲前後的合約年", "四十一歲的人事更替"],
    focus: "先鞏固既有基礎再談擴張。",
    reflection: "現在手上有幾件事是別人的期待、而不是你的目標？"
  }
};

describe("面相報告 PDF", () => {
  it("產得出合法的 PDF，且帶有中文字型", async () => {
    const buf = await renderFaceReportPdf({
      runId: "11111111-2222-3333-4444-555555555555",
      mode: "self",
      completedAt: "2026-09-08T10:33:00.000Z",
      createdAt: "2026-09-08T10:20:00.000Z",
      memberName: "測試會員",
      report: FIXTURE,
      reportText: null
    });

    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.subarray(-6).toString()).toContain("%%EOF");
    // 有嵌入子集字型才會出現 FontFile3／CIDFont；沒有的話中文一定是空白或亂碼。
    const raw = buf.toString("latin1");
    expect(raw).toContain("CIDFontType0");
    expect(raw).toMatch(/FontFile3|FontFile2/);
  });

  it("子集化有效：檔案遠小於 5.4MB 的字型本身", async () => {
    const buf = await renderFaceReportPdf({
      runId: "r", mode: "self", completedAt: null, createdAt: "2026-09-08T00:00:00.000Z",
      memberName: "測試會員", report: FIXTURE, reportText: null
    });
    // 沒有子集化的話這裡會是 5MB 起跳。
    expect(buf.length).toBeLessThan(600 * 1024);
    expect(buf.length).toBeGreaterThan(10 * 1024);
  });

  it("structured 缺漏時退回純文字，不是產不出來", async () => {
    const buf = await renderFaceReportPdf({
      runId: "r", mode: "other", completedAt: null, createdAt: "2026-09-08T00:00:00.000Z",
      memberName: "測試會員", report: null, reportText: "這是舊格式的純文字報告內容。"
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5 * 1024);
  });

  it("完全沒有內容也不 throw", async () => {
    const buf = await renderFaceReportPdf({
      runId: "r", mode: "self", completedAt: null, createdAt: "2026-09-08T00:00:00.000Z",
      memberName: "測試會員", report: null, reportText: null
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("長報告會自動分頁", async () => {
    const long = { ...FIXTURE, coreHighlights: Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 項重點，內容夠長才會把版面撐開到下一頁，這裡刻意寫滿一整行以上的文字。`) };
    const buf = await renderFaceReportPdf({
      runId: "r", mode: "self", completedAt: null, createdAt: "2026-09-08T00:00:00.000Z",
      memberName: "測試會員", report: long, reportText: null
    });
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages).toBeGreaterThan(1);
  });
});

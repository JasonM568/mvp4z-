import { afterEach, describe, expect, it, vi } from "vitest";
import { FACE_REPORT_DISCLAIMER } from "@/lib/face-analysis/report-schema";
import { FACE_PALACE_NAMES } from "@/lib/face-analysis/rules";
const parse = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/openai", () => ({ createOpenAIClient: () => ({ responses: { parse } }), openAIModel: () => "gpt-4.1-mini" }));
const { generateFaceReport } = await import("@/lib/face-analysis/report");

const area = (conclusion: string, sources: string[]) => ({
  conclusion,
  alignment: "medium" as const,
  visibleBasis: "本次可見主部位寬度適中且左右對稱。",
  teacherInterpretation: "依沈師教材的主輔部位進行交叉觀察。",
  watchout: "輔助部位仍需更清晰照片核對。",
  action: "未來十四天記錄三次實際結果再比對。",
  confidence: "medium" as const,
  sources
});

const validReport = {
  schemaVersion: "1.0",
  mode: "self",
  summary: Array(10).fill("以實際資料持續驗證觀察結果。").join(""),
  photoQuality: "照片品質可供有限的文化觀察參考。",
  currentTrend: "目前僅就清楚可見的結構做趨勢式整理。",
  photoFingerprint: ["眉線平直且眉尾略向外延伸", "眼裂橫向比例較長且上緣弧度平緩", "鼻樑中央線條平直且寬度均勻", "上唇弓線明顯且下唇中央較飽滿", "下巴末端呈圓弧且縱向長度適中"],
  coreHighlights: ["先整理目前最明顯的狀態。", "把握可驗證且能持續的方向。", "避免在資料不足時做重大承諾。"],
  priorityAdvice: [
    { problem: "行動焦點分散", reason: "可見宮位資料顯示需要先收斂目標。", advice: "本週只設定一個主要目標。" },
    { problem: "資訊仍不完整", reason: "部分證據仍需搭配現實資料核對。", advice: "決定前補齊三項可驗證資料。" },
    { problem: "缺少定期回顧", reason: "單次觀察不適合直接形成長期結論。", advice: "每三十天回顧一次實際結果。" }
  ],
  palaces: FACE_PALACE_NAMES.map((name) => ({
    name,
    status: "limited",
    evidence: "可見資料有限。",
    interpretation: "本項僅作民俗文化觀察。",
    advice: "請以實際資料持續驗證。"
  })),
  flowYear: null,
  actions: [
    { period: "30_days", action: "建立一份每週觀察記錄。" },
    { period: "60_days", action: "根據實際回饋調整行動。" },
    { period: "90_days", action: "回顧記錄並整理可重複方法。" }
  ],
  disclaimer: FACE_REPORT_DISCLAIMER,
  lifeAreas: {
    relationship: area("感情互動建議先觀察溝通節奏。", ["沈師筆記 p.72–77"]),
    career: area("事業上可先用小型任務驗證執行節奏。", ["沈師筆記 p.60–69"]),
    health: area("健康項目只作部位可判讀度說明。", ["沈師筆記 p.78–84"]),
    finance: area("財運項目應按年齡對應三倉核對。", ["沈師筆記 p.84–86"]),
    family: area("家庭項目需要多宮位交叉觀察。", ["沈師筆記 p.66–90"])
  },
  surfaceAnalysis: {
    detectedFeatures: [],
    complexionObservation: "照片呈現亮度適中、色偏中性，僅代表本次拍攝畫面。",
    filterWarning: null,
    summary: "本次未辨識到可信度足夠的斑、痣、疤或痕。"
  },
  collaborationFramework: {
    verdict: "conditional",
    verdictReason: "可先以小型任務試行合作。",
    suitableRole: "適合先承擔有明確驗收標準的執行角色。",
    suitability: "先用短期小型任務驗證配合方式，再決定是否擴大合作。",
    interactionStyle: "每週固定書面同步進度，決策權與交付標準先寫清楚。",
    riskSignals: ["連續兩次未按約定回覆進度。", "重要決策沒有書面確認。"],
    questionsToVerify: ["遇到延遲時如何通知？", "最終決策由誰負責？", "驗收標準如何確認？"],
    boundaries: "不以面部觀察代替實際合作紀錄、徵信或專業審查。"
  }
};

const input = {
  mode: "self" as const,
  subjectAge: null,
  quality: {
    passed: true,
    faceCount: 1,
    faceCoverage: 0.5,
    blurScore: 0.1,
    brightnessScore: 0.5,
    pose: { yaw: 0, pitch: 0, roll: 0 },
    occlusion: { eyes: false, nose: false, mouth: false },
    reasons: []
  },
  rules: {
    version: "2.0" as const,
    mode: "self" as const,
    photoFingerprint: [
      { ruleId: "F1", text: "眉線平直且眉尾略向外延伸", evidence: [] },
      { ruleId: "F2", text: "眼裂橫向比例較長且上緣弧度平緩", evidence: [] },
      { ruleId: "F3", text: "鼻樑中央線條平直且寬度均勻", evidence: [] },
      { ruleId: "F4", text: "上唇弓線明顯且下唇中央較飽滿", evidence: [] },
      { ruleId: "F5", text: "下巴末端呈圓弧且縱向長度適中", evidence: [] }
    ],
    overallTrend: { ruleId: "overall", text: "limited", evidence: [] },
    palaces: [],
    flowYear: null,
    observations: [],
    cautions: [],
    actionPlan: []
  }
};

describe("OpenAI face report provider", () => {
  afterEach(() => {
    parse.mockReset();
    delete process.env.FACE_REPORT_PROVIDER;
    delete process.env.FACE_REPORT_OPENAI_MODEL;
  });

  it("sends structured text and validates parsed output", async () => {
    process.env.FACE_REPORT_PROVIDER = "openai";
    parse.mockResolvedValue({ output_parsed: validReport, usage: { input_tokens: 123, output_tokens: 456 } });

    const result = await generateFaceReport({ ...input, collaborationAssessment: true, collaborationProject: "合作執行一項為期三個月的網站專案。" });
    expect(parse).toHaveBeenCalledOnce();
    const providerRequest = parse.mock.calls[0][0] as { input: string };
    const providerInput = JSON.parse(providerRequest.input.replace(/^請依下列資料輸出單一 JSON object：\n/, ""));
    expect(providerInput.teacherAreaFramework.finance.calculatedAlignment).toBe("insufficient");
    expect(result.trace).toMatchObject({ provider: "openai", model: "gpt-4.1-mini", tokensInput: 123, tokensOutput: 456 });
    expect(result.report.palaces).toHaveLength(12);
  });

  it("fails closed when OpenAI returns no parsed output", async () => {
    process.env.FACE_REPORT_PROVIDER = "openai";
    parse.mockResolvedValue({ output_parsed: null });
    await expect(generateFaceReport(input)).rejects.toThrow("FACE_REPORT_EMPTY_OUTPUT");
  });

  it("rewrites forbidden stability overclaims instead of discarding a valid report", async () => {
    process.env.FACE_REPORT_PROVIDER = "openai";
    parse.mockResolvedValue({
      output_parsed: {
        ...validReport,
        lifeAreas: {
          ...validReport.lifeAreas,
          health: { ...validReport.lifeAreas.health, conclusion: "健康狀況穩定，山根可見。" },
          finance: { ...validReport.lifeAreas.finance, conclusion: "財務狀況穩定，財帛宮可見。" }
        }
      }
    });
    const result = await generateFaceReport({ ...input, collaborationAssessment: true, collaborationProject: "合作執行一項為期三個月的網站專案。" });
    expect(result.report.lifeAreas.health.conclusion).toContain("不代表實際健康狀況");
    expect(result.report.lifeAreas.finance.conclusion).toContain("傳統觀察條件");
  });
});

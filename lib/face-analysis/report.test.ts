import { afterEach, describe, expect, it, vi } from "vitest";
import { FACE_REPORT_DISCLAIMER } from "@/lib/face-analysis/report-schema";
import { FACE_PALACE_NAMES } from "@/lib/face-analysis/rules";
const parse = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/openai", () => ({ createOpenAIClient: () => ({ responses: { parse } }), openAIModel: () => "gpt-4.1-mini" }));
const { generateFaceReport } = await import("@/lib/face-analysis/report");

const validReport = {
  schemaVersion: "1.0",
  mode: "self",
  summary: Array(10).fill("以實際資料持續驗證觀察結果。").join(""),
  photoQuality: "照片品質可供有限的文化觀察參考。",
  currentTrend: "目前僅就清楚可見的結構做趨勢式整理。",
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
    finance: "以實際收支與風險資料為準。",
    career: "以可驗證的工作目標為準。",
    relationship: "以雙方實際互動為準。",
    communication: "保留澄清與回饋的空間。",
    routine: "用實際作息記錄檢視狀態。"
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

    const result = await generateFaceReport(input);
    expect(parse).toHaveBeenCalledOnce();
    expect(result.trace).toMatchObject({ provider: "openai", model: "gpt-4.1-mini", tokensInput: 123, tokensOutput: 456 });
    expect(result.report.palaces).toHaveLength(12);
  });

  it("fails closed when OpenAI returns no parsed output", async () => {
    process.env.FACE_REPORT_PROVIDER = "openai";
    parse.mockResolvedValue({ output_parsed: null });
    await expect(generateFaceReport(input)).rejects.toThrow("FACE_REPORT_EMPTY_OUTPUT");
  });
});

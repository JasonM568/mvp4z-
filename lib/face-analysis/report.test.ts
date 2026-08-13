import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFaceReport } from "@/lib/face-analysis/report";
import { FACE_REPORT_DISCLAIMER } from "@/lib/face-analysis/report-schema";
import { FACE_PALACE_NAMES } from "@/lib/face-analysis/rules";

const validReport = {
  schemaVersion: "1.0",
  mode: "self",
  summary: Array(10).fill("以實際資料持續驗證觀察結果。").join(""),
  photoQuality: "照片品質可供有限的文化觀察參考。",
  currentTrend: "目前僅就清楚可見的結構做趨勢式整理。",
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

describe("DeepSeek face report provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FACE_REPORT_PROVIDER;
    delete process.env.FACE_REPORT_MODEL;
  });

  it("sends only structured text input and validates DeepSeek JSON", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    process.env.FACE_REPORT_PROVIDER = "deepseek";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.model).toBe("deepseek-v4-pro");
      expect(request.response_format).toEqual({ type: "json_object" });
      expect(String(init?.body)).not.toContain("input_image");
      expect(String(init?.body)).not.toContain("base64");
      return new Response(JSON.stringify({
        model: "deepseek-v4-pro",
        choices: [{ message: { content: JSON.stringify(validReport) } }],
        usage: { prompt_tokens: 123, completion_tokens: 456 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFaceReport(input);
    expect(result.trace).toMatchObject({ provider: "deepseek", model: "deepseek-v4-pro", tokensInput: 123, tokensOutput: 456 });
    expect(result.report.palaces).toHaveLength(12);
  });

  it("fails closed when DeepSeek returns invalid JSON", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 })));
    await expect(generateFaceReport(input)).rejects.toThrow("FACE_REPORT_INVALID_OUTPUT");
  });
});

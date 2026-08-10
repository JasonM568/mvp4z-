import { FaceRuleResult } from "@/lib/face-analysis/rules";
import {
  FACE_REPORT_DISCLAIMER,
  FaceReport,
  faceReportSchema
} from "@/lib/face-analysis/report-schema";
import { FaceQualityResult, FaceAnalysisMode } from "@/lib/face-analysis/types";

const REPORT_INSTRUCTIONS = `你是巽風面相民俗文化報告整理器。
你只能根據輸入的結構化規則結果撰寫，不得重新分析照片，也不得加入輸入沒有的事實。
所有內容必須使用趨勢式、可驗證、非確定性的繁體中文。
禁止推論疾病、心理診斷、犯罪傾向、種族、國籍、宗教、政治、性傾向、真實年齡、人格真相或可信度。
不得保證財運、獲利、成功、感情或未來事件。
mode=other 時只提供合作溝通的觀察與核對問題，不判定對方忠誠、善惡或是否可信。
十二宮與 30/60/90 天行動必須完整，disclaimer 必須逐字使用 server 提供的固定內容。`;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_REPORT_MODEL = "deepseek-v4-pro";

export async function generateFaceReport(input: {
  mode: FaceAnalysisMode;
  subjectAge: number | null;
  quality: FaceQualityResult;
  rules: FaceRuleResult;
  knowledge?: Array<{ cardId: string; title: string; category: string; observation: string; editorSummary: string | null }>;
}) {
  if ((process.env.FACE_REPORT_PROVIDER || "deepseek").trim().toLowerCase() !== "deepseek") {
    throw new Error("FACE_REPORT_PROVIDER_UNSUPPORTED");
  }
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("FACE_REPORT_PROVIDER_UNAVAILABLE");
  const model = process.env.FACE_REPORT_MODEL?.trim() || DEEPSEEK_REPORT_MODEL;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const reportInput = {
      mode: input.mode,
      subjectAge: input.subjectAge,
      photoQuality: {
        faceCoverage: input.quality.faceCoverage,
        blurScore: input.quality.blurScore,
        brightnessScore: input.quality.brightnessScore,
        limitations: input.quality.reasons
      },
      rules: input.rules,
      approvedKnowledge: (input.knowledge || []).map((item) => ({ cardId: item.cardId, title: item.title, category: item.category, observation: item.observation, editorSummary: item.editorSummary })),
      fixedDisclaimer: FACE_REPORT_DISCLAIMER
  };
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${REPORT_INSTRUCTIONS}\n\n${outputContract(input.mode)}` },
          { role: "user", content: `請依下列資料輸出單一 JSON object，不要使用 Markdown：\n${JSON.stringify(reportInput)}` }
        ]
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("FACE_REPORT_PROVIDER_TIMEOUT");
    throw new Error("FACE_REPORT_PROVIDER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  if (!response.ok) throw new Error("FACE_REPORT_PROVIDER_ERROR");
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("FACE_REPORT_INVALID_OUTPUT");
  let decoded: unknown;
  try {
    decoded = JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new Error("FACE_REPORT_INVALID_OUTPUT");
  }
  const report = faceReportSchema.parse(decoded);
  return {
    report,
    trace: {
      provider: "deepseek",
      model,
      tokensInput: Number(payload?.usage?.prompt_tokens || 0),
      tokensOutput: Number(payload?.usage?.completion_tokens || 0),
      latencyMs: Date.now() - startedAt
    }
  };
}

function outputContract(mode: FaceAnalysisMode) {
  const common = `輸出 JSON 契約：
- schemaVersion 必須為 "1.0"；mode 必須為 "${mode}"。
- summary 必須是 100–180 個字元的繁體中文。
- photoQuality、currentTrend 為字串。
- palaces 必須恰好 12 筆且不可重複，name 依序為：命宮、財帛宮、兄弟宮、田宅宮、男女宮、奴僕宮、妻妾宮、疾厄宮、遷移宮、官祿宮、福德宮、相貌宮。
- 每筆 palace 只有 name、status、evidence、interpretation、advice；status 只能是 balanced、watch 或 limited。
- flowYear 為 null，或只含 age(整數)、stage、reflection。
- actions 必須恰好三筆，period 依序為 30_days、60_days、90_days，每筆只有 period 與 action。
- disclaimer 必須與 fixedDisclaimer 完全一致。
- 不得輸出未列出的欄位。`;
  return mode === "self"
    ? `${common}\n- lifeAreas 必須只含 finance、career、relationship、communication、routine 五個字串欄位。\n- 不得輸出 collaborationFramework。`
    : `${common}\n- collaborationFramework 必須只含 observableInteraction、questionsToVerify(2–8 個字串)、boundaries。\n- 不得輸出 lifeAreas。`;
}

export function renderFaceReportText(report: FaceReport) {
  const sections = [
    `# 巽風面相文化觀察報告`,
    `## 摘要\n${report.summary}`,
    `## 照片品質\n${report.photoQuality}`,
    `## 目前趨勢\n${report.currentTrend}`,
    `## 十二宮觀察\n${report.palaces
      .map((item) => `### ${item.name}\n${item.interpretation}\n\n建議：${item.advice}\n\n依據：${item.evidence}`)
      .join("\n\n")}`
  ];

  if (report.flowYear) {
    sections.push(`## 流年回顧提示\n${report.flowYear.stage}\n\n${report.flowYear.reflection}`);
  }
  if (report.mode === "self") {
    sections.push(
      `## 生活面向\n### 財務\n${report.lifeAreas.finance}\n\n### 事業\n${report.lifeAreas.career}\n\n### 關係\n${report.lifeAreas.relationship}\n\n### 溝通\n${report.lifeAreas.communication}\n\n### 作息\n${report.lifeAreas.routine}`
    );
  } else {
    sections.push(
      `## 合作觀察框架\n${report.collaborationFramework.observableInteraction}\n\n核對問題：\n${report.collaborationFramework.questionsToVerify.map((item) => `- ${item}`).join("\n")}\n\n界線：${report.collaborationFramework.boundaries}`
    );
  }
  sections.push(
    `## 30／60／90 天行動\n${report.actions.map((item) => `- ${item.period}: ${item.action}`).join("\n")}`,
    `## 使用說明\n${report.disclaimer}`
  );
  return sections.join("\n\n");
}

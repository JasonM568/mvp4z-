import { FaceRuleResult } from "@/lib/face-analysis/rules";
import {
  FACE_REPORT_DISCLAIMER,
  FaceReport,
  faceReportResponseSchema,
  faceReportSchema
} from "@/lib/face-analysis/report-schema";
import { FaceQualityResult, FaceAnalysisMode } from "@/lib/face-analysis/types";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";
import { zodTextFormat } from "openai/helpers/zod";

const REPORT_INSTRUCTIONS = `你是巽風面相民俗文化報告整理器。
你只能根據輸入的結構化規則結果撰寫，不得重新分析照片，也不得加入輸入沒有的事實。
所有內容必須使用趨勢式、可驗證、非確定性的繁體中文。
禁止推論疾病、心理診斷、犯罪傾向、種族、國籍、宗教、政治、性傾向、真實年齡、人格真相或可信度。
不得保證財運、獲利、成功、感情或未來事件。
mode=other 時只提供合作溝通的觀察與核對問題，不判定對方忠誠、善惡或是否可信。
十二宮與 30/60/90 天行動必須完整，disclaimer 必須逐字使用 server 提供的固定內容。`;

const DEFAULT_OPENAI_REPORT_MODEL = "gpt-4.1-mini";

export async function generateFaceReport(input: {
  mode: FaceAnalysisMode;
  subjectAge: number | null;
  quality: FaceQualityResult;
  rules: FaceRuleResult;
  knowledge?: Array<{ cardId: string; title: string; category: string; observation: string; editorSummary: string | null }>;
}) {
  if ((process.env.FACE_REPORT_PROVIDER || "openai").trim().toLowerCase() !== "openai") {
    throw new Error("FACE_REPORT_PROVIDER_UNSUPPORTED");
  }
  const model = process.env.FACE_REPORT_OPENAI_MODEL?.trim() || openAIModel() || DEFAULT_OPENAI_REPORT_MODEL;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
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
  let response: { output_parsed?: unknown; usage?: { input_tokens?: number; output_tokens?: number } };
  try {
    response = await createOpenAIClient().responses.parse({
      model, store: false,
      instructions: `${REPORT_INSTRUCTIONS}\n\n${outputContract(input.mode)}`,
      input: `請依下列資料輸出單一 JSON object：\n${JSON.stringify(reportInput)}`,
      text: { format: zodTextFormat(faceReportResponseSchema(input.mode), "face_report") },
      max_output_tokens: 3200, temperature: 0
    }, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("FACE_REPORT_PROVIDER_TIMEOUT");
    const providerError = error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown };
    console.error("FACE_REPORT_PROVIDER_FAILED", {
      name: typeof providerError.name === "string" ? providerError.name : "unknown",
      status: typeof providerError.status === "number" ? providerError.status : null,
      code: typeof providerError.code === "string" ? providerError.code : null,
      message: typeof providerError.message === "string" ? providerError.message.slice(0, 240) : "unknown"
    });
    throw new Error("FACE_REPORT_PROVIDER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.output_parsed) throw new Error("FACE_REPORT_EMPTY_OUTPUT");
  let report: FaceReport;
  try {
    report = faceReportSchema.parse(response.output_parsed);
  } catch {
    throw new Error("FACE_REPORT_SCHEMA_INVALID");
  }
  return {
    report,
    trace: {
      provider: "openai",
      model,
      tokensInput: Number(response.usage?.input_tokens || 0),
      tokensOutput: Number(response.usage?.output_tokens || 0),
      latencyMs: Date.now() - startedAt
    }
  };
}

function outputContract(mode: FaceAnalysisMode) {
  const common = `輸出 JSON 契約：
- schemaVersion 必須為 "1.0"；mode 必須為 "${mode}"。
- summary 必須是 100–180 個字元的繁體中文。
- photoQuality、currentTrend 為字串。
- coreHighlights 必須恰好三筆，依序回答「目前最明顯的狀態」、「最值得把握的方向」、「最需要避免的風險」，每筆都要直接、有重點。
- priorityAdvice 必須恰好三筆，每筆只有 problem、reason、advice；理由必須引用同名宮位或可見證據，建議必須能實際執行。
- palaces 必須恰好 12 筆且不可重複，name 依序為：命宮、官祿宮、父母宮、福德宮、遷移宮、兄弟宮、夫妻宮、子女宮、疾厄宮、財帛宮、奴僕宮、田宅宮。
- 每筆 palace 只有 name、status、evidence、interpretation、advice；status 只能是 balanced、watch 或 limited。
- 各宮解讀必須依據輸入 rules.palaces 內同名宮位的 parts（沈師部位）與 evidence 形態特徵（輪廓／寬窄／長短／對稱），不得依光線或拍攝條件下論斷。
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
    `## 三個核心重點\n${report.coreHighlights.map((item) => `- ${item}`).join("\n")}`,
    `## 明確問題與建議\n${report.priorityAdvice.map((item, index) => `### 問題 ${index + 1}：${item.problem}\n理由：${item.reason}\n\n建議：${item.advice}`).join("\n\n")}`,
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

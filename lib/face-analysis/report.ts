import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";
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

export async function generateFaceReport(input: {
  mode: FaceAnalysisMode;
  subjectAge: number | null;
  quality: FaceQualityResult;
  rules: FaceRuleResult;
}) {
  const client = createOpenAIClient();
  const startedAt = Date.now();
  const response = await client.responses.parse({
    model: process.env.FACE_REPORT_MODEL || openAIModel(),
    instructions: REPORT_INSTRUCTIONS,
    input: JSON.stringify({
      mode: input.mode,
      subjectAge: input.subjectAge,
      photoQuality: {
        faceCoverage: input.quality.faceCoverage,
        blurScore: input.quality.blurScore,
        brightnessScore: input.quality.brightnessScore,
        limitations: input.quality.reasons
      },
      rules: input.rules,
      fixedDisclaimer: FACE_REPORT_DISCLAIMER
    }),
    text: { format: zodTextFormat(faceReportSchema, "face_analysis_report") },
    max_output_tokens: 5000,
    temperature: 0.2
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("FACE_REPORT_INVALID_OUTPUT");
  const report = faceReportSchema.parse(parsed);
  return {
    report,
    trace: {
      provider: "openai",
      model: process.env.FACE_REPORT_MODEL || openAIModel(),
      tokensInput: response.usage?.input_tokens || 0,
      tokensOutput: response.usage?.output_tokens || 0,
      latencyMs: Date.now() - startedAt
    }
  };
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


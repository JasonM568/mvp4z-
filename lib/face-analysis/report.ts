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
不得把「不要依賴面相、保持理性、實際驗證」本身當成核心重點或問題；這些只能放在 disclaimer。
不得使用「持續努力、保持正向、維持和諧、善用人脈、提升品質」等沒有具體對象與期限的萬用建議。
不得由臉部形態斷言「過度自信、注意力分散、溝通不細膩、容易誤解、企圖心、性格」等人格或行為；只能寫成「建議核對的生活情境」，並明示需用實際紀錄確認。
核心重點與 priorityAdvice.reason 只能引用 rules.palaces.evidence 中的 contour、relativeWidth、relativeHeight、symmetry；禁止用亮度、模糊度、照片覆蓋率、拍攝品質推論疲勞、健康、溝通、財務或任何生活結果。
「生命力、健康狀況、疾病風險、收入穩定、感情穩定、家庭和諧」均不得由照片直接宣稱。
若十二宮全部為 balanced，仍須從 evidence 的輪廓、寬高、對稱與主輔部位差異中選出三組最具辨識度的觀察，不得把十二宮逐一寫成相同的穩定結論。
lifeAreas 必須固定依感情、事業、健康、財運、家庭五項整理；健康只能提供作息、自我觀察與就醫邊界，不得從面部推論健康狀況或疾病。
collaborationFramework 必須提供合作條件、相處方式、風險訊號與核對問題，但不得只憑面相判定「適合／不適合合作」，不判定對方忠誠、善惡或是否可信。
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
      max_output_tokens: 4800, temperature: 0
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
- coreHighlights 必須恰好三筆，依序回答「最明顯的具體部位組合」、「該組合在民俗語境下的可用方向」、「近期最需節制的做法」。每筆必須點名至少一個宮位或部位，禁止寫成使用說明。
- priorityAdvice 必須恰好三筆，每筆只有 problem、reason、advice；problem 必須以「建議核對：」開頭，描述生活中可辨認的具體情境，不得宣稱該情境已存在；reason 必須點名宮位與可見形態證據；advice 必須包含明確動作、期限或檢核方式。
- palaces 必須恰好 12 筆且不可重複，name 依序為：命宮、官祿宮、父母宮、福德宮、遷移宮、兄弟宮、夫妻宮、子女宮、疾厄宮、財帛宮、奴僕宮、田宅宮。
- 每筆 palace 只有 name、status、evidence、interpretation、advice；status 只能是 balanced、watch 或 limited。
- 各宮解讀必須依據輸入 rules.palaces 內同名宮位的 parts（沈師部位）與 evidence 形態特徵（輪廓／寬窄／長短／對稱），不得依光線或拍攝條件下論斷。
- flowYear 為 null，或只含 age(整數)、stage、reflection。
- actions 必須恰好三筆，period 依序為 30_days、60_days、90_days，每筆只有 period 與 action。
- 三筆 actions 的內容不得相同：30 天是立即整理或測試，60 天是根據紀錄調整，90 天是決定保留、加碼或停止。
- disclaimer 必須與 fixedDisclaimer 完全一致。
- 不得輸出未列出的欄位。`;
  return `${common}
- lifeAreas 必須只含 relationship、career、health、finance、family 五個字串欄位，依序回答感情、事業、健康、財運、家庭。每項都要有「趨勢觀察＋現實核對方法」，不能只寫空泛提醒。
- health 不得宣稱健康狀況、器官功能、疾病風險或壽命，只能提醒以實際作息、健檢與專業意見核對。
- collaborationFramework 必須只含 suitability、interactionStyle、riskSignals(2–6 個字串)、questionsToVerify(3–8 個字串)、boundaries。
- suitability 只能說明「在什麼合作條件下值得試行」，不得宣告此人適合或不適合合作。
- interactionStyle 要給具體的溝通頻率、決策方式、分工與衝突處理建議。
- riskSignals 與 questionsToVerify 必須是合作過程中可觀察、可記錄的現實行為，不得當作已發生的人格事實。`;
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
  sections.push(
    `## 五大面向\n### 感情\n${report.lifeAreas.relationship}\n\n### 事業\n${report.lifeAreas.career}\n\n### 健康\n${report.lifeAreas.health}\n\n### 財運\n${report.lifeAreas.finance}\n\n### 家庭\n${report.lifeAreas.family}`,
    `## 合作與相處建議\n### 合作適配條件\n${report.collaborationFramework.suitability}\n\n### 建議相處模式\n${report.collaborationFramework.interactionStyle}\n\n### 需留意的合作訊號\n${report.collaborationFramework.riskSignals.map((item) => `- ${item}`).join("\n")}\n\n### 合作前核對問題\n${report.collaborationFramework.questionsToVerify.map((item) => `- ${item}`).join("\n")}\n\n### 判斷界線\n${report.collaborationFramework.boundaries}`
  );
  sections.push(
    `## 30／60／90 天行動\n${report.actions.map((item) => `- ${item.period}: ${item.action}`).join("\n")}`,
    `## 使用說明\n${report.disclaimer}`
  );
  return sections.join("\n\n");
}

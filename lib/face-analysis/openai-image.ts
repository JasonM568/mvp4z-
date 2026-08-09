import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";

const BASE_INSTRUCTIONS = `你是影像幾何觀察器，只能描述照片中可直接看見的人臉數量、角度、遮擋、相對比例、輪廓、光線與 landmark 覆蓋程度。
禁止辨識或猜測身分、真實年齡、健康、疾病、情緒、人格、可信度、犯罪傾向、種族、國籍、宗教、政治立場、性傾向或其他敏感屬性。
看不清楚時必須降低 confidence 或使用 not_assessable，不可補猜。只輸出指定 JSON schema。`;

export function isOpenAIFaceProvider(provider: string | undefined) {
  return provider?.trim().toLowerCase() === "openai";
}

export function hasAcknowledgedZeroRetention() {
  const approvedAt = process.env.FACE_VISION_RETENTION_APPROVED_AT?.trim() || "";
  return process.env.FACE_VISION_ZERO_RETENTION === "true"
    && process.env.FACE_VISION_RETENTION_MODE === "zero_data_retention"
    && /^\d{4}-\d{2}-\d{2}$/.test(approvedAt)
    && !Number.isNaN(Date.parse(`${approvedAt}T00:00:00Z`));
}

export async function parseOpenAIImage<T>(input: {
  bytes: Uint8Array;
  mimeType: string;
  schema: z.ZodType<T>;
  schemaName: string;
  task: string;
}): Promise<T> {
  if (!hasAcknowledgedZeroRetention()) {
    throw new Error("FACE_VISION_RETENTION_POLICY_UNSUPPORTED");
  }

  const response = await createOpenAIClient().responses.parse({
    model: process.env.FACE_VISION_MODEL || openAIModel(),
    store: false,
    instructions: BASE_INSTRUCTIONS,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: input.task },
        {
          type: "input_image",
          image_url: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`,
          detail: "high"
        }
      ]
    }],
    text: { format: zodTextFormat(input.schema, input.schemaName) },
    max_output_tokens: 2400,
    temperature: 0
  });

  if (!response.output_parsed) throw new Error("FACE_VISION_INVALID_OUTPUT");
  return input.schema.parse(response.output_parsed);
}

import {
  FaceVisionInput,
  FaceVisionProvider,
  faceVisionResultSchema
} from "@/lib/face-analysis/vision";
import {
  hasAcknowledgedZeroRetention,
  isOpenAIFaceProvider,
  parseOpenAIImage
} from "@/lib/face-analysis/openai-image";
import {
  geminiVisionResponseSchema,
  isGeminiFaceProvider,
  parseGeminiImage
} from "@/lib/face-analysis/gemini-image";
import type { FaceImageProviderName } from "@/lib/face-analysis/provider-approval";

export function selectedFaceVisionProvider(): FaceImageProviderName | "configured" {
  const value = process.env.FACE_VISION_PROVIDER?.trim().toLowerCase();
  if (value === "gemini" || value === "openai") return value;
  return "configured";
}

export class ConfiguredFaceVisionProvider implements FaceVisionProvider {
  private readonly provider = selectedFaceVisionProvider();

  constructor(private readonly databaseApproved = false) {}
  readonly name = this.provider === "gemini"
    ? "gemini_face_vision"
    : this.provider === "openai"
      ? "openai_face_vision"
      : "configured_face_vision";
  readonly model = this.provider === "gemini"
    ? process.env.FACE_GEMINI_VISION_MODEL || "gemini-2.5-flash"
    : process.env.FACE_VISION_MODEL || "organization-approved";
  readonly supportsZeroRetention = this.databaseApproved
    || (this.provider === "openai" && hasAcknowledgedZeroRetention());

  async analyze(input: FaceVisionInput) {
    if (this.provider === "gemini" || isGeminiFaceProvider(process.env.FACE_VISION_PROVIDER)) {
      return parseGeminiImage({
        ...input,
        schema: faceVisionResultSchema,
        responseSchema: geminiVisionResponseSchema,
        task: VISION_TASK,
        databaseApproved: this.databaseApproved
      });
    }

    if (this.provider === "openai" || isOpenAIFaceProvider(process.env.FACE_VISION_PROVIDER)) {
      return parseOpenAIImage({
        ...input,
        schema: faceVisionResultSchema,
        schemaName: "face_visible_geometry",
        task: VISION_TASK,
        databaseApproved: this.databaseApproved
      });
    }

    const endpoint = process.env.FACE_VISION_PROVIDER_URL?.trim();
    if (!endpoint) throw new Error("FACE_VISION_PROVIDER_NOT_CONFIGURED");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const bytes = input.bytes.buffer.slice(
        input.bytes.byteOffset,
        input.bytes.byteOffset + input.bytes.byteLength
      ) as ArrayBuffer;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": input.mimeType,
          ...(process.env.FACE_VISION_PROVIDER_TOKEN
            ? { Authorization: `Bearer ${process.env.FACE_VISION_PROVIDER_TOKEN}` }
            : {})
        },
        body: bytes,
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("FACE_VISION_PROVIDER_FAILED");
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

const VISION_TASK = "回傳單一正面人臉的可見觀察：姿態、幾何、八大區塊、六個細部位，並特別列出照片中可見的斑、痣、疤、痕之類型、位置、左右、明顯度與信心度。氣色只記錄畫面明暗、均勻度與色偏，並判斷是否可能有美肌、磨皮或濾鏡；不得連結器官、疾病、種族、人格或命運。看不清楚必須降低 confidence 或回 not_assessable。";

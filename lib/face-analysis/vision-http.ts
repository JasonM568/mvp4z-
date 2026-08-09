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

export class ConfiguredFaceVisionProvider implements FaceVisionProvider {
  constructor(private readonly databaseApproved = false) {}
  readonly name = this.databaseApproved || isOpenAIFaceProvider(process.env.FACE_VISION_PROVIDER)
    ? "openai_face_vision"
    : "configured_face_vision";
  readonly model = process.env.FACE_VISION_MODEL || "organization-approved";
  readonly supportsZeroRetention = this.databaseApproved || hasAcknowledgedZeroRetention();

  async analyze(input: FaceVisionInput) {
    if (this.databaseApproved || isOpenAIFaceProvider(process.env.FACE_VISION_PROVIDER)) {
      return parseOpenAIImage({
        ...input,
        schema: faceVisionResultSchema,
        schemaName: "face_visible_geometry",
        task: "回傳單一正面人臉的純幾何觀察：姿態、landmark 覆蓋，以及額頭、眉毛、眼睛、鼻子、臉頰、嘴巴、下顎、耳朵八區的可見度、相對寬高、輪廓、對稱與光線。不可推論任何人格、命運、健康或敏感屬性。",
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

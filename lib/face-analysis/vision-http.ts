import {
  FaceVisionInput,
  FaceVisionProvider
} from "@/lib/face-analysis/vision";

export class ConfiguredFaceVisionProvider implements FaceVisionProvider {
  readonly name = "configured_face_vision";
  readonly model = process.env.FACE_VISION_MODEL || "organization-approved";
  readonly supportsZeroRetention = process.env.FACE_VISION_ZERO_RETENTION === "true";

  async analyze(input: FaceVisionInput) {
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


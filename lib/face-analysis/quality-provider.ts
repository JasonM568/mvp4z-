import { z } from "zod";

const providerObservationSchema = z.object({
  faceCount: z.number().int().min(0).max(20),
  faceCoverage: z.number().min(0).max(1),
  pose: z.object({
    yaw: z.number().finite(),
    pitch: z.number().finite(),
    roll: z.number().finite()
  }).strict(),
  occlusion: z.object({
    eyes: z.boolean(),
    nose: z.boolean(),
    mouth: z.boolean()
  }).strict()
}).strict();

export type FaceProviderObservation = z.infer<typeof providerObservationSchema>;

/**
 * 呼叫後端權威人臉偵測服務。沒有設定 provider 時採 fail-closed，絕不以隨機值或檔案內容冒充判讀。
 * Endpoint 必須是組織核准、禁止訓練且符合照片保存政策的服務。
 */
export async function inspectFaceGeometry(input: {
  bytes: Buffer;
  mimeType: string;
}): Promise<FaceProviderObservation> {
  const endpoint = process.env.FACE_QUALITY_PROVIDER_URL?.trim();
  if (!endpoint) throw new FaceQualityProviderError("QUALITY_PROVIDER_NOT_CONFIGURED", 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": input.mimeType,
        ...(process.env.FACE_QUALITY_PROVIDER_TOKEN
          ? { Authorization: `Bearer ${process.env.FACE_QUALITY_PROVIDER_TOKEN}` }
          : {})
      },
      body: input.bytes.buffer.slice(
        input.bytes.byteOffset,
        input.bytes.byteOffset + input.bytes.byteLength
      ) as ArrayBuffer,
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new FaceQualityProviderError("QUALITY_PROVIDER_FAILED", 502);
    return providerObservationSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof FaceQualityProviderError) throw error;
    throw new FaceQualityProviderError("QUALITY_PROVIDER_FAILED", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export class FaceQualityProviderError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code === "QUALITY_PROVIDER_NOT_CONFIGURED" ? "照片品質服務尚未設定" : "照片品質服務暫時無法使用");
    this.name = "FaceQualityProviderError";
  }
}

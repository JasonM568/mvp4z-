import { z } from "zod";
import {
  hasAcknowledgedZeroRetention,
  isOpenAIFaceProvider,
  parseOpenAIImage
} from "@/lib/face-analysis/openai-image";
import { geminiQualityResponseSchema, parseGeminiImage } from "@/lib/face-analysis/gemini-image";
import { getActiveFaceProviderApproval } from "@/lib/face-analysis/provider-approval";

export const providerObservationSchema = z.object({
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
  const selected = selectedQualityProvider();
  const databaseApproved = selected === "openai" || selected === "gemini"
    ? Boolean(await getActiveFaceProviderApproval(selected))
    : false;
  if (selected === "gemini") {
    if (!databaseApproved) {
      throw new FaceQualityProviderError("QUALITY_RETENTION_POLICY_UNSUPPORTED", 503);
    }
    try {
      return await parseGeminiImage({
        ...input,
        schema: providerObservationSchema,
        responseSchema: geminiQualityResponseSchema,
        task: "只為照片品質檢查回傳人臉數量、最大人臉畫面覆蓋比例、頭部 yaw/pitch/roll，以及眼睛、鼻子、嘴巴是否被遮擋。不得進行面相解讀。",
        databaseApproved
      });
    } catch {
      throw new FaceQualityProviderError("QUALITY_PROVIDER_FAILED", 502);
    }
  }

  if (selected === "openai" || isOpenAIFaceProvider(process.env.FACE_QUALITY_PROVIDER)) {
    if (!databaseApproved && !hasAcknowledgedZeroRetention()) {
      throw new FaceQualityProviderError("QUALITY_RETENTION_POLICY_UNSUPPORTED", 503);
    }
    try {
      return await parseOpenAIImage({
        ...input,
        schema: providerObservationSchema,
        schemaName: "face_quality_geometry",
        task: "只為照片品質檢查回傳人臉數量、最大人臉畫面覆蓋比例、頭部 yaw/pitch/roll，以及眼睛、鼻子、嘴巴是否被遮擋。不得進行面相解讀。",
        databaseApproved
      });
    } catch (error) {
      if (error instanceof FaceQualityProviderError) throw error;
      throw new FaceQualityProviderError("QUALITY_PROVIDER_FAILED", 502);
    }
  }

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

function selectedQualityProvider(): "openai" | "gemini" | "configured" {
  const value = (process.env.FACE_QUALITY_PROVIDER || process.env.FACE_VISION_PROVIDER)?.trim().toLowerCase();
  if (value === "openai" || value === "gemini") return value;
  return "configured";
}

export class FaceQualityProviderError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(
      code === "QUALITY_PROVIDER_NOT_CONFIGURED"
        ? "照片品質服務尚未設定"
        : code === "QUALITY_RETENTION_POLICY_UNSUPPORTED"
          ? "照片品質服務尚未確認零資料保留政策"
          : "照片品質服務暫時無法使用"
    );
    this.name = "FaceQualityProviderError";
  }
}

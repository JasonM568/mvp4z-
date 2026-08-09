import { z } from "zod";
import { FACE_ALLOWED_MIME_TYPES, FACE_IMAGE_MAX_BYTES } from "@/lib/face-analysis/config";

const confidenceSchema = z.number().finite().min(0).max(1);

const visibleRegionSchema = z
  .object({
    visibility: z.enum(["clear", "partial", "obscured"]),
    symmetry: z.enum(["balanced", "slightly_asymmetric", "asymmetric", "not_assessable"]),
    relativeWidth: z.enum(["narrow", "medium", "wide", "not_assessable"]),
    relativeHeight: z.enum(["short", "medium", "long", "not_assessable"]),
    contour: z.enum(["rounded", "straight", "angular", "mixed", "not_assessable"]),
    illumination: z.enum(["even", "shadowed", "overexposed", "mixed", "not_assessable"]),
    confidence: confidenceSchema
  })
  .strict();

/**
 * The only output shape a vision provider may return.
 * Strict schemas intentionally reject identity, age, health, personality and
 * protected-attribute fields instead of silently stripping them.
 */
export const faceVisionResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    faceCount: z.literal(1),
    orientation: z
      .object({
        yaw: z.number().finite().min(-90).max(90),
        pitch: z.number().finite().min(-90).max(90),
        roll: z.number().finite().min(-180).max(180),
        confidence: confidenceSchema
      })
      .strict(),
    landmarks: z
      .object({
        detected: z.boolean(),
        coverage: confidenceSchema,
        confidence: confidenceSchema
      })
      .strict(),
    regions: z
      .object({
        forehead: visibleRegionSchema,
        eyebrows: visibleRegionSchema,
        eyes: visibleRegionSchema,
        nose: visibleRegionSchema,
        cheeks: visibleRegionSchema,
        mouth: visibleRegionSchema,
        jaw: visibleRegionSchema,
        ears: visibleRegionSchema
      })
      .strict(),
    overallConfidence: confidenceSchema,
    limitations: z.array(z.string().trim().min(1).max(160)).max(12)
  })
  .strict();

export type FaceVisionResult = z.infer<typeof faceVisionResultSchema>;

export type FaceVisionInput = Readonly<{
  bytes: Uint8Array;
  mimeType: (typeof FACE_ALLOWED_MIME_TYPES)[number];
}>;

export interface FaceVisionProvider {
  readonly name: string;
  readonly model: string;
  /** Must be true before this provider is enabled in production. */
  readonly supportsZeroRetention: boolean;
  analyze(input: FaceVisionInput): Promise<unknown>;
}

export function validateFaceVisionInput(input: FaceVisionInput): void {
  if (!FACE_ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    throw new Error("FACE_VISION_UNSUPPORTED_MIME");
  }
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > FACE_IMAGE_MAX_BYTES) {
    throw new Error("FACE_VISION_INVALID_IMAGE_SIZE");
  }
}

export async function runFaceVisionProvider(
  provider: FaceVisionProvider,
  input: FaceVisionInput
): Promise<FaceVisionResult> {
  validateFaceVisionInput(input);
  if (!provider.supportsZeroRetention) {
    throw new Error("FACE_VISION_RETENTION_POLICY_UNSUPPORTED");
  }

  const raw = await provider.analyze(input);
  return faceVisionResultSchema.parse(raw);
}


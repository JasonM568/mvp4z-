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
 * 沈師十二宮第一批核可的細部位。這些欄位仍只允許回傳可見幾何，
 * 絕不能藉此推論健康、年齡或任何人格／敏感屬性。
 */
const visibleDetailSchema = visibleRegionSchema;

/**
 * The only output shape a vision provider may return.
 * Strict schemas intentionally reject identity, age, health, personality and
 * protected-attribute fields instead of silently stripping them.
 */
export const faceVisionResultSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
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
    details: z
      .object({
        /** 印堂：命宮，亦為官祿／福德／遷移／夫妻的輔看部位。 */
        glabella: visibleDetailSchema,
        /** 山根：疾厄宮主部位。 */
        nasalRoot: visibleDetailSchema,
        /** 奸門：夫妻宮主部位。 */
        outerEyeCorners: visibleDetailSchema,
        /** 淚堂：子女宮主部位。 */
        tearTroughs: visibleDetailSchema,
        /** 人中：子女宮輔部位。 */
        philtrum: visibleDetailSchema,
        /** 地閣：奴僕宮輔部位及財帛地倉。 */
        chin: visibleDetailSchema
      })
      .strict(),
    surfaceFeatures: z.array(z.object({
      type: z.enum(["spot", "mole", "scar", "mark"]),
      region: z.enum(["forehead", "glabella", "eyebrows", "eyes", "outerEyeCorners", "tearTroughs", "nose", "nasalRoot", "cheeks", "mouth", "philtrum", "jaw", "chin", "ears"]),
      side: z.enum(["left", "right", "center", "bilateral", "not_assessable"]),
      prominence: z.enum(["subtle", "visible", "prominent"]),
      description: z.string().trim().min(1).max(160),
      confidence: confidenceSchema
    }).strict()).max(30),
    complexion: z.object({
      assessable: z.boolean(),
      evenness: z.enum(["even", "slightly_uneven", "uneven", "not_assessable"]),
      brightness: z.enum(["bright", "moderate", "dim", "not_assessable"]),
      colorCast: z.enum(["neutral", "warm", "cool", "mixed", "not_assessable"]),
      possibleBeautyFilter: z.boolean(),
      confidence: confidenceSchema,
      limitation: z.string().trim().max(160)
    }).strict(),
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

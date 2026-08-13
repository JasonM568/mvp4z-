import { z } from "zod";
import {
  FACE_ALLOWED_MIME_TYPES,
  FACE_IMAGE_MAX_BYTES,
  FACE_IMAGE_MAX_DIMENSION
} from "@/lib/face-analysis/config";

export const faceModeSchema = z.enum(["self", "other"]);

export const createFaceRunSchema = z
  .object({
    requestId: z.string().uuid("requestId 格式錯誤"),
    mode: faceModeSchema,
    subjectAge: z.number().int().min(1).max(120).nullable().optional().default(null),
    consentVersion: z.string().trim().min(1).max(40),
    thirdPartyConsent: z.boolean().optional().default(false),
    collaborationAssessment: z.boolean().optional().default(false),
    collaborationProject: z.string().trim().max(1000).nullable().optional().default(null)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "other" && value.thirdPartyConsent !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thirdPartyConsent"],
        message: "分析他人照片前，必須確認已取得本人同意"
      });
    }
    if (value.collaborationAssessment && (!value.collaborationProject || value.collaborationProject.length < 10)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collaborationProject"],
        message: "啟用合作對象評估時，請至少輸入 10 個字的合作項目描述"
      });
    }
  });

export const faceImageMetadataSchema = z.object({
  mimeType: z.enum(FACE_ALLOWED_MIME_TYPES),
  fileSize: z.number().int().min(1).max(FACE_IMAGE_MAX_BYTES),
  width: z.number().int().min(1).max(FACE_IMAGE_MAX_DIMENSION),
  height: z.number().int().min(1).max(FACE_IMAGE_MAX_DIMENSION)
}).strict();

export const faceQualityReasonSchema = z.enum([
  "NO_FACE",
  "MULTIPLE_FACES",
  "FACE_TOO_SMALL",
  "TOO_BLURRY",
  "TOO_DARK",
  "TOO_BRIGHT",
  "POSE_NOT_FRONT",
  "FACE_OCCLUDED",
  "UNSUPPORTED_IMAGE",
  "FILE_TOO_LARGE"
]);

const normalizedScore = z.number().min(0).max(1);

export const faceQualityResultSchema = z.object({
  faceCount: z.number().int().min(0),
  faceCoverage: normalizedScore,
  blurScore: normalizedScore,
  brightnessScore: normalizedScore,
  pose: z.object({
    yaw: z.number().finite(),
    pitch: z.number().finite(),
    roll: z.number().finite()
  }),
  occlusion: z.object({
    eyes: z.boolean(),
    nose: z.boolean(),
    mouth: z.boolean()
  }),
  passed: z.boolean(),
  reasons: z.array(faceQualityReasonSchema)
}).strict();

export type CreateFaceRunInput = z.infer<typeof createFaceRunSchema>;
export type FaceImageMetadata = z.infer<typeof faceImageMetadataSchema>;

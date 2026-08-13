import { z } from "zod";
import { FACE_PALACE_NAMES } from "@/lib/face-analysis/rules";

export const FACE_REPORT_DISCLAIMER =
  "本報告依照照片中清楚可見的面部特徵，以傳統民俗文化角度提供趨勢觀察與自我反思素材，不具科學診斷、醫療、心理、法律或投資建議效力，也不應用於判斷他人的人格、可信度或受保護屬性。重要決定請以實際資料與專業意見為準。" as const;

const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

const palaceSchema = z
  .object({
    name: z.enum(FACE_PALACE_NAMES),
    status: z.enum(["balanced", "watch", "limited"]),
    evidence: boundedText(1, 500),
    interpretation: boundedText(1, 800),
    advice: boundedText(1, 500)
  })
  .strict();

const actionSchema = z
  .object({
    period: z.enum(["30_days", "60_days", "90_days"]),
    action: boundedText(1, 500)
  })
  .strict();

const priorityAdviceSchema = z.object({
  problem: boundedText(1, 180),
  reason: boundedText(1, 500),
  advice: boundedText(1, 500)
}).strict();

const areaReadingSchema = z
  .object({
    conclusion: boundedText(1, 500),
    alignment: z.enum(["high", "medium", "low", "insufficient"]),
    visibleBasis: boundedText(1, 800),
    teacherInterpretation: boundedText(1, 800),
    watchout: boundedText(1, 500),
    action: boundedText(1, 500),
    confidence: z.enum(["high", "medium", "low"]),
    sources: z.array(boundedText(1, 120)).min(1).max(4)
  })
  .strict();

const lifeAreasSchema = z.object({
  relationship: areaReadingSchema,
  career: areaReadingSchema,
  health: areaReadingSchema,
  finance: areaReadingSchema,
  family: areaReadingSchema
}).strict();

const collaborationFrameworkSchema = z
  .object({
    verdict: z.enum(["recommended", "conditional", "not_recommended"]),
    verdictReason: boundedText(1, 800),
    suitableRole: boundedText(1, 500),
    suitability: boundedText(1, 800),
    interactionStyle: boundedText(1, 800),
    riskSignals: z.array(boundedText(1, 300)).min(2).max(6),
    questionsToVerify: z.array(boundedText(1, 300)).min(3).max(8),
    boundaries: boundedText(1, 800)
  })
  .strict();

const baseReportShape = {
  schemaVersion: z.literal("1.0"),
  summary: boundedText(100, 180),
  photoQuality: boundedText(1, 600),
  currentTrend: boundedText(1, 1200),
  coreHighlights: z.array(boundedText(1, 320)).length(3),
  priorityAdvice: z.array(priorityAdviceSchema).length(3),
  palaces: z
    .array(palaceSchema)
    .length(12)
    .superRefine((palaces, context) => {
      const names = new Set(palaces.map((palace) => palace.name));
      if (names.size !== FACE_PALACE_NAMES.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "十二宮不得重複或缺漏" });
      }
    }),
  flowYear: z
    .object({
      age: z.number().int().min(1).max(120),
      stage: boundedText(1, 120),
      reflection: boundedText(1, 800)
    })
    .strict()
    .nullable(),
  actions: z.array(actionSchema).length(3).superRefine((actions, context) => {
    const periods = new Set(actions.map((action) => action.period));
    if (periods.size !== 3) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "30/60/90 天行動不得重複或缺漏" });
    }
  }),
  lifeAreas: lifeAreasSchema,
  collaborationFramework: collaborationFrameworkSchema.nullable(),
  disclaimer: z.literal(FACE_REPORT_DISCLAIMER)
};

export const selfReportResponseSchema = z
  .object({
    ...baseReportShape,
    mode: z.literal("self")
  })
  .strict();

export const otherReportResponseSchema = z
  .object({
    ...baseReportShape,
    mode: z.literal("other")
  })
  .strict();

const unsafeClaims = [
  /患有/,
  /罹患/,
  /犯罪傾向/,
  /值得信任/,
  /不可信/,
  /性傾向(?:是|為)/,
  /宗教信仰(?:是|為)/,
  /種族(?:是|為)/,
  /保證(?:獲利|賺錢|成功)/,
  /健康(?:狀況)?(?:良好|穩定|無.{0,4}異常)/,
  /(?:財務狀況|感情關係|家庭關係|事業環境).{0,8}(?:穩定|良好|和諧)/
] as const;

export const faceReportSchema = z
  .discriminatedUnion("mode", [selfReportResponseSchema, otherReportResponseSchema])
  .superRefine((report, context) => {
    // The fixed disclaimer necessarily names prohibited uses, so only inspect
    // generated content. This is a final deny-list guard, not a substitute for
    // provider moderation or human review.
    const generatedContent = JSON.stringify({ ...report, disclaimer: "" });
    for (const pattern of unsafeClaims) {
      if (pattern.test(generatedContent)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "報告含有禁止的敏感或保證性推論"
        });
        break;
      }
    }
  });
export type FaceReport = z.infer<typeof faceReportSchema>;

/** OpenAI Structured Outputs requires an object at the schema root. */
export function faceReportResponseSchema(mode: "self" | "other") {
  return mode === "self" ? selfReportResponseSchema : otherReportResponseSchema;
}

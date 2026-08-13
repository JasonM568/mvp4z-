import { z } from "zod";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const BASE_INSTRUCTIONS = `你是影像品質與人臉可見特徵觀察器。
只能輸出照片中可直接看見的人臉數量、頭部角度、遮擋、相對比例、輪廓、光線與 landmark 覆蓋程度；細部位只限印堂、山根、奸門、淚堂、人中、地閣的可見幾何。可以中性描述可見斑、痣、疤、痕的位置與明顯度，以及受光線、白平衡和濾鏡影響的畫面明暗、均勻度與色偏。
禁止辨識或猜測身分、真實年齡、健康、疾病、情緒、人格、可信度、犯罪傾向、種族、國籍、宗教、政治立場、性傾向或其他敏感屬性。
看不清楚時必須降低 confidence 或使用 not_assessable，不可補猜。只輸出符合指定 JSON schema 的單一 JSON object。`;

export function isGeminiFaceProvider(provider: string | undefined) {
  return provider?.trim().toLowerCase() === "gemini";
}

export async function parseGeminiImage<T>(input: {
  bytes: Uint8Array;
  mimeType: string;
  schema: z.ZodType<T>;
  responseSchema: Record<string, unknown>;
  task: string;
  databaseApproved: boolean;
  allowSyntheticTest?: boolean;
}): Promise<T> {
  if (!input.databaseApproved && !input.allowSyntheticTest) {
    throw new Error("FACE_VISION_RETENTION_POLICY_UNSUPPORTED");
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("FACE_VISION_PROVIDER_NOT_CONFIGURED");
  const model = process.env.FACE_GEMINI_VISION_MODEL?.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: BASE_INSTRUCTIONS }] },
        contents: [{
          role: "user",
          parts: [
            { text: input.task },
            { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 3000,
          responseMimeType: "application/json",
          responseSchema: input.responseSchema,
          thinkingConfig: { thinkingBudget: 0 }
        }
      }),
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    if (!response.ok) throw new Error("FACE_VISION_PROVIDER_FAILED");
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("FACE_VISION_INVALID_OUTPUT");
    return input.schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof Error && /^FACE_VISION_[A-Z0-9_]+$/.test(error.message)) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new Error("FACE_VISION_PROVIDER_TIMEOUT");
    throw new Error("FACE_VISION_INVALID_OUTPUT");
  } finally {
    clearTimeout(timeout);
  }
}

const number = { type: "NUMBER" };
const boolean = { type: "BOOLEAN" };
const confidence = { type: "NUMBER", minimum: 0, maximum: 1 };
const surfaceFeature = {
  type: "OBJECT",
  properties: {
    type: { type: "STRING", enum: ["spot", "mole", "scar", "mark"] },
    region: { type: "STRING", enum: ["forehead", "glabella", "eyebrows", "eyes", "outerEyeCorners", "tearTroughs", "nose", "nasalRoot", "cheeks", "mouth", "philtrum", "jaw", "chin", "ears"] },
    side: { type: "STRING", enum: ["left", "right", "center", "bilateral", "not_assessable"] },
    prominence: { type: "STRING", enum: ["subtle", "visible", "prominent"] },
    description: { type: "STRING", maxLength: 160 },
    confidence
  },
  required: ["type", "region", "side", "prominence", "description", "confidence"]
} as const;

export const geminiQualityResponseSchema = {
  type: "OBJECT",
  properties: {
    faceCount: { type: "INTEGER", minimum: 0, maximum: 20 },
    faceCoverage: confidence,
    pose: {
      type: "OBJECT",
      properties: { yaw: number, pitch: number, roll: number },
      required: ["yaw", "pitch", "roll"]
    },
    occlusion: {
      type: "OBJECT",
      properties: { eyes: boolean, nose: boolean, mouth: boolean },
      required: ["eyes", "nose", "mouth"]
    }
  },
  required: ["faceCount", "faceCoverage", "pose", "occlusion"]
} as const;

const visibleRegion = {
  type: "OBJECT",
  properties: {
    visibility: { type: "STRING", enum: ["clear", "partial", "obscured"] },
    symmetry: { type: "STRING", enum: ["balanced", "slightly_asymmetric", "asymmetric", "not_assessable"] },
    relativeWidth: { type: "STRING", enum: ["narrow", "medium", "wide", "not_assessable"] },
    relativeHeight: { type: "STRING", enum: ["short", "medium", "long", "not_assessable"] },
    contour: { type: "STRING", enum: ["rounded", "straight", "angular", "mixed", "not_assessable"] },
    illumination: { type: "STRING", enum: ["even", "shadowed", "overexposed", "mixed", "not_assessable"] },
    confidence
  },
  required: ["visibility", "symmetry", "relativeWidth", "relativeHeight", "contour", "illumination", "confidence"]
} as const;

export const geminiVisionResponseSchema = {
  type: "OBJECT",
  properties: {
    schemaVersion: { type: "STRING", enum: ["2.0"] },
    faceCount: { type: "INTEGER", enum: [1] },
    orientation: {
      type: "OBJECT",
      properties: { yaw: number, pitch: number, roll: number, confidence },
      required: ["yaw", "pitch", "roll", "confidence"]
    },
    landmarks: {
      type: "OBJECT",
      properties: { detected: boolean, coverage: confidence, confidence },
      required: ["detected", "coverage", "confidence"]
    },
    regions: {
      type: "OBJECT",
      properties: {
        forehead: visibleRegion,
        eyebrows: visibleRegion,
        eyes: visibleRegion,
        nose: visibleRegion,
        cheeks: visibleRegion,
        mouth: visibleRegion,
        jaw: visibleRegion,
        ears: visibleRegion
      },
      required: ["forehead", "eyebrows", "eyes", "nose", "cheeks", "mouth", "jaw", "ears"]
    },
    details: {
      type: "OBJECT",
      properties: {
        glabella: visibleRegion,
        nasalRoot: visibleRegion,
        outerEyeCorners: visibleRegion,
        tearTroughs: visibleRegion,
        philtrum: visibleRegion,
        chin: visibleRegion
      },
      required: ["glabella", "nasalRoot", "outerEyeCorners", "tearTroughs", "philtrum", "chin"]
    },
    surfaceFeatures: { type: "ARRAY", items: surfaceFeature, maxItems: 30 },
    complexion: {
      type: "OBJECT",
      properties: {
        assessable: boolean,
        evenness: { type: "STRING", enum: ["even", "slightly_uneven", "uneven", "not_assessable"] },
        brightness: { type: "STRING", enum: ["bright", "moderate", "dim", "not_assessable"] },
        colorCast: { type: "STRING", enum: ["neutral", "warm", "cool", "mixed", "not_assessable"] },
        possibleBeautyFilter: boolean,
        confidence,
        limitation: { type: "STRING", maxLength: 160 }
      },
      required: ["assessable", "evenness", "brightness", "colorCast", "possibleBeautyFilter", "confidence", "limitation"]
    },
    overallConfidence: confidence,
    limitations: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 }
  },
  required: ["schemaVersion", "faceCount", "orientation", "landmarks", "regions", "details", "surfaceFeatures", "complexion", "overallConfidence", "limitations"]
} as const;

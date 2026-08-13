/**
 * Opt-in smoke test for an approved image provider.
 * It never runs in the normal unit suite: callers must deliberately provide a
 * locally generated, non-human-source image through FACE_SYNTHETIC_IMAGE_PATH.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectFaceGeometry } from "@/lib/face-analysis/quality-provider";
import { ConfiguredFaceVisionProvider } from "@/lib/face-analysis/vision-http";
import { runFaceVisionProvider } from "@/lib/face-analysis/vision";

const imagePath = process.env.FACE_SYNTHETIC_IMAGE_PATH;
const maybeIt = imagePath ? it : it.skip;

describe("approved provider synthetic-image E2E", () => {
  maybeIt("returns OpenAI quality data and Vision schema v2 without sensitive fields", async () => {
    loadLocalOpenAIEnvironment();
    process.env.FACE_QUALITY_PROVIDER = "openai";
    process.env.FACE_VISION_PROVIDER = "openai";

    const bytes = new Uint8Array(readFileSync(imagePath!));
    const quality = await inspectFaceGeometry({ bytes: Buffer.from(bytes), mimeType: "image/png" });
    expect(quality.faceCount).toBe(1);
    expect(quality.faceCoverage).toBeGreaterThan(0.18);
    expect(quality.occlusion).toEqual({ eyes: false, nose: false, mouth: false });

    const vision = await runFaceVisionProvider(new ConfiguredFaceVisionProvider(true), {
      bytes,
      mimeType: "image/png"
    });
    expect(vision.schemaVersion).toBe("2.0");
    expect(Object.keys(vision.details)).toEqual([
      "glabella",
      "nasalRoot",
      "outerEyeCorners",
      "tearTroughs",
      "philtrum",
      "chin"
    ]);
    expect(vision.faceCount).toBe(1);
  }, 90_000);
});

function loadLocalOpenAIEnvironment() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const matched = line.match(/^\s*(OPENAI_API_KEY|OPENAI_MODEL|FACE_VISION_MODEL|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=(.*)\s*$/);
    if (!matched) continue;
    const [, key, rawValue] = matched;
    const value = rawValue.replace(/^['\"]|['\"]$/g, "");
    if (value) process.env[key] = value;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured locally");
}

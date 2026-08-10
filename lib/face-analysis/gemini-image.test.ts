import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isGeminiFaceProvider, parseGeminiImage } from "@/lib/face-analysis/gemini-image";
import { ConfiguredFaceVisionProvider } from "@/lib/face-analysis/vision-http";

const originalProvider = process.env.FACE_VISION_PROVIDER;
const originalKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  restore("FACE_VISION_PROVIDER", originalProvider);
  restore("GEMINI_API_KEY", originalKey);
  vi.restoreAllMocks();
});

describe("Gemini face provider safety gates", () => {
  it("requires an explicit Gemini provider selection", () => {
    expect(isGeminiFaceProvider(undefined)).toBe(false);
    expect(isGeminiFaceProvider("openai")).toBe(false);
    expect(isGeminiFaceProvider(" Gemini ")).toBe(true);
  });

  it("reports Gemini but remains closed without database approval", () => {
    process.env.FACE_VISION_PROVIDER = "gemini";
    const provider = new ConfiguredFaceVisionProvider(false);
    expect(provider.name).toBe("gemini_face_vision");
    expect(provider.supportsZeroRetention).toBe(false);
  });

  it("fails before sending an image without a named-admin approval", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(parseGeminiImage({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      schema: z.object({ ok: z.boolean() }).strict(),
      responseSchema: { type: "OBJECT" },
      task: "test",
      databaseApproved: false
    })).rejects.toThrow("FACE_VISION_RETENTION_POLICY_UNSUPPORTED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates Gemini JSON with the local strict schema", async () => {
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true, extra: "blocked" }) }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(parseGeminiImage({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      schema: z.object({ ok: z.boolean() }).strict(),
      responseSchema: { type: "OBJECT" },
      task: "synthetic test",
      databaseApproved: false,
      allowSyntheticTest: true
    })).rejects.toThrow("FACE_VISION_INVALID_OUTPUT");
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

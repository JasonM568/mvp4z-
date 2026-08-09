import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import {
  hasAcknowledgedZeroRetention,
  isOpenAIFaceProvider,
  parseOpenAIImage
} from "@/lib/face-analysis/openai-image";
import { ConfiguredFaceVisionProvider } from "@/lib/face-analysis/vision-http";

const originalProvider = process.env.FACE_VISION_PROVIDER;
const originalRetention = process.env.FACE_VISION_ZERO_RETENTION;
const originalRetentionMode = process.env.FACE_VISION_RETENTION_MODE;
const originalApprovedAt = process.env.FACE_VISION_RETENTION_APPROVED_AT;

afterEach(() => {
  restore("FACE_VISION_PROVIDER", originalProvider);
  restore("FACE_VISION_ZERO_RETENTION", originalRetention);
  restore("FACE_VISION_RETENTION_MODE", originalRetentionMode);
  restore("FACE_VISION_RETENTION_APPROVED_AT", originalApprovedAt);
});

describe("OpenAI face provider safety gates", () => {
  it("requires an explicit provider selection", () => {
    expect(isOpenAIFaceProvider(undefined)).toBe(false);
    expect(isOpenAIFaceProvider("configured_url")).toBe(false);
    expect(isOpenAIFaceProvider(" OpenAI ")).toBe(true);
  });

  it("requires an exact zero-retention acknowledgement", () => {
    process.env.FACE_VISION_RETENTION_MODE = "zero_data_retention";
    process.env.FACE_VISION_RETENTION_APPROVED_AT = "2026-08-10";
    process.env.FACE_VISION_ZERO_RETENTION = "false";
    expect(hasAcknowledgedZeroRetention()).toBe(false);
    process.env.FACE_VISION_ZERO_RETENTION = "true";
    expect(hasAcknowledgedZeroRetention()).toBe(true);
  });

  it("rejects a boolean without recorded ZDR mode and approval date", () => {
    process.env.FACE_VISION_ZERO_RETENTION = "true";
    delete process.env.FACE_VISION_RETENTION_MODE;
    delete process.env.FACE_VISION_RETENTION_APPROVED_AT;
    expect(hasAcknowledgedZeroRetention()).toBe(false);
    process.env.FACE_VISION_RETENTION_MODE = "modified_abuse_monitoring";
    process.env.FACE_VISION_RETENTION_APPROVED_AT = "2026-08-10";
    expect(hasAcknowledgedZeroRetention()).toBe(false);
  });

  it("reports the selected provider without weakening retention checks", () => {
    process.env.FACE_VISION_PROVIDER = "openai";
    process.env.FACE_VISION_ZERO_RETENTION = "false";
    const provider = new ConfiguredFaceVisionProvider();
    expect(provider.name).toBe("openai_face_vision");
    expect(provider.supportsZeroRetention).toBe(false);
  });

  it("accepts a named-admin database approval without requiring duplicate env attestation", () => {
    delete process.env.FACE_VISION_PROVIDER;
    process.env.FACE_VISION_ZERO_RETENTION = "false";
    const provider = new ConfiguredFaceVisionProvider(true);
    expect(provider.name).toBe("openai_face_vision");
    expect(provider.supportsZeroRetention).toBe(true);
  });

  it("fails before creating an API request when retention is not acknowledged", async () => {
    process.env.FACE_VISION_ZERO_RETENTION = "false";
    await expect(parseOpenAIImage({
      bytes: new Uint8Array([1]),
      mimeType: "image/jpeg",
      schema: z.object({ ok: z.boolean() }).strict(),
      schemaName: "test_face_gate",
      task: "test"
    })).rejects.toThrow("FACE_VISION_RETENTION_POLICY_UNSUPPORTED");
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { faceReportSchema } from "@/lib/face-analysis/report-schema";

describe("face report structured output", () => {
  it("can be converted into an OpenAI Responses JSON schema", () => {
    expect(() => zodTextFormat(faceReportSchema, "face_analysis_report")).not.toThrow();
  });
});


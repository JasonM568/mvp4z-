import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Candidate route + real storage helper, with isolated DB/Storage/quality boundaries.
// No network, Supabase connection, model, or real image is used.
const fixture = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  run: { status: "created", upload_attempts: 0, upload_claim_token: null as string | null,
    upload_claimed_at: null as string | null, storage_path: null as string | null },
  objects: new Map<string, ArrayBuffer>(),
  events: [] as string[],
  calls: [] as string[],
  failRemove: true
}));

vi.mock("@/lib/auth/member", () => ({
  requireBearerProfile: async () => ({ profile: { id: fixture.userId } }),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status }),
  errorStatus: (error: { status?: number }) => error.status || 500,
  errorMessage: (error: Error) => error.message
}));
vi.mock("@/lib/face-analysis/config", () => ({
  isFaceAnalysisEnabled: () => true, FACE_IMAGE_MAX_BYTES: 10_000_000,
  FACE_ANALYSIS_BUCKET: "face-private-qa", FACE_REPORT_PDF_BUCKET: "face-pdf-qa",
  FACE_SIGNED_URL_TTL_SECONDS: 60
}));
vi.mock("@/lib/face-analysis/image", () => ({
  FaceImageError: class FaceImageError extends Error {},
  normalizeAndInspectFaceImage: async () => ({
    bytes: Buffer.from([137, 80, 78, 71]), mimeType: "image/png", fileSize: 4,
    width: 100, height: 100, blurScore: 0.9, brightnessScore: 0.5
  })
}));
vi.mock("@/lib/face-analysis/quality-provider", () => ({
  FaceQualityProviderError: class FaceQualityProviderError extends Error {},
  inspectFaceGeometry: async () => ({ faceCount: 1 })
}));
vi.mock("@/lib/face-analysis/quality", () => ({
  evaluateFaceQuality: () => ({ passed: true, faceCount: 1, blurScore: 0.9,
    brightnessScore: 0.5, reasons: [] })
}));
vi.mock("@/lib/face-analysis/runs", () => ({
  getOwnedRun: async () => ({ id: fixture.runId, user_id: fixture.userId, ...fixture.run }),
  recordFaceUploadResult: async () => {
    fixture.calls.push("rpc:event-insert-fault");
    throw new Error("injected event INSERT failure; atomic RPC rolled back");
  }
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (name: string) => {
      expect(name).toBe("face_analysis_runs");
      return {
        update: (changes: Record<string, unknown>) => {
          const filters = new Map<string, unknown>();
          const builder = {
            eq(key: string, value: unknown) { filters.set(key, value); return builder; },
            in() { return builder; }, or() { return builder; }, select() { return builder; },
            async maybeSingle() {
              if (filters.get("upload_attempts") !== fixture.run.upload_attempts
                  || fixture.run.upload_claim_token) return { data: null, error: null };
              fixture.run.upload_attempts = changes.upload_attempts as number;
              fixture.run.upload_claim_token = changes.upload_claim_token as string;
              fixture.run.upload_claimed_at = changes.upload_claimed_at as string;
              fixture.calls.push("db:claim");
              return { data: { id: fixture.runId }, error: null };
            },
            then(resolve: (value: { error: null }) => unknown) {
              if (filters.get("upload_claim_token") === fixture.run.upload_claim_token) {
                fixture.run.upload_claim_token = null;
                fixture.run.upload_claimed_at = null;
                fixture.calls.push("db:release");
              }
              return Promise.resolve(resolve({ error: null }));
            }
          };
          return builder;
        }
      };
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("face-private-qa");
        return {
          upload: async (path: string, bytes: ArrayBuffer, options: { upsert: boolean }) => {
            expect(options.upsert).toBe(false);
            fixture.calls.push("storage:upload");
            if (fixture.objects.has(path)) return { error: { message: "object exists", status: 409 } };
            fixture.objects.set(path, bytes);
            return { error: null };
          },
          remove: async (paths: string[]) => {
            fixture.calls.push("storage:remove");
            if (fixture.failRemove) return { error: { message: "injected remove failure", status: 503 } };
            paths.forEach((path) => fixture.objects.delete(path));
            return { error: null };
          }
        };
      }
    }
  })
}));

// @ts-expect-error @candidate is resolved by the isolated Vitest config, not project tsconfig.
import { POST } from "@candidate/app/api/face-analysis/runs/[id]/upload/route";

describe("QA-FS-M23 candidate double fault", () => {
  afterEach(() => {
    fixture.objects.clear();
    fixture.events.length = 0;
    fixture.calls.length = 0;
    fixture.run.status = "created";
    fixture.run.upload_attempts = 0;
    fixture.run.upload_claim_token = null;
    fixture.run.upload_claimed_at = null;
    fixture.run.storage_path = null;
    fixture.failRemove = true;
    expect(fixture.objects.size).toBe(0);
  });

  it("leaves one orphan after failed compensation; same-key retries consume attempts", async () => {
    const request = () => {
      const form = new FormData();
      form.set("image", new File(["synthetic"], "qa.png", { type: "image/png" }));
      return new NextRequest(`http://localhost/api/face-analysis/runs/${fixture.runId}/upload`, {
        method: "POST", body: form
      });
    };
    const context = { params: Promise.resolve({ id: fixture.runId }) };
    try {
      const first = await POST(request(), context);
      expect(first.status).toBe(500);
      expect(fixture.run).toMatchObject({ status: "created", storage_path: null,
        upload_attempts: 1, upload_claim_token: null, upload_claimed_at: null });
      expect(fixture.events).toHaveLength(0);
      expect([...fixture.objects.keys()]).toEqual([
        `${fixture.userId}/${fixture.runId}/source.png`
      ]);
      expect(fixture.calls).toEqual(["db:claim", "storage:upload", "rpc:event-insert-fault",
        "storage:remove", "db:release"]);

      for (let attempt = 2; attempt <= 5; attempt++) {
        const retry = await POST(request(), context);
        expect(retry.status, `retry attempt ${attempt}`).toBe(409);
        expect(fixture.run.upload_attempts).toBe(attempt);
        expect(fixture.run.upload_claim_token).toBeNull();
      }
      const capped = await POST(request(), context);
      expect(capped.status).toBe(429);
      expect(fixture.run.upload_attempts).toBe(5);
      expect(fixture.objects.size).toBe(1);
      expect(fixture.events).toHaveLength(0);
    } finally {
      fixture.failRemove = false;
      fixture.objects.clear();
    }
  });
});

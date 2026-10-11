import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Independent, in-memory boundaries around the unchanged spike route and Storage helper.
// No DB, Storage service, model, or shared stack is called.
const state = vi.hoisted(() => ({
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  runId: "11111111-1111-4111-8111-111111111111",
  run: { status: "created", upload_attempts: 0, upload_claim_token: null as string | null,
    upload_claimed_at: null as string | null, storage_path: null as string | null },
  intents: new Map<string, { path: string; state: string; error: string | null }>(),
  objects: new Set<string>(),
  removed: [] as string[],
  calls: [] as string[],
  mode: "double_fault" as "double_fault" | "ambiguous_commit",
  removeFails: true
}));

vi.mock("@/lib/auth/member", () => ({
  requireBearerProfile: async () => ({ profile: { id: state.userId } }),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status }),
  errorStatus: (error: { status?: number }) => error.status || 500,
  errorMessage: (error: Error) => error.message
}));
vi.mock("@/lib/face-analysis/config", () => ({
  isFaceAnalysisEnabled: () => true, FACE_IMAGE_MAX_BYTES: 10_000_000,
  FACE_ANALYSIS_BUCKET: "isolated-face-images", FACE_REPORT_PDF_BUCKET: "isolated-pdf",
  FACE_SIGNED_URL_TTL_SECONDS: 60
}));
vi.mock("@/lib/face-analysis/image", () => ({
  FaceImageError: class FaceImageError extends Error {},
  normalizeAndInspectFaceImage: async () => ({ bytes: Buffer.from([137, 80, 78, 71]),
    mimeType: "image/png", fileSize: 4, width: 100, height: 100,
    blurScore: 0.9, brightnessScore: 0.5 })
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
  getOwnedRun: async () => ({ id: state.runId, user_id: state.userId, ...state.run }),
  createFaceUploadIntent: async ({ claimToken, storagePath }: { claimToken: string; storagePath: string }) => {
    state.calls.push("intent:create");
    state.intents.set(claimToken, { path: storagePath, state: "pending", error: null });
  },
  recordFaceUploadResult: async ({ claimToken, storagePath }: { claimToken: string; storagePath: string }) => {
    state.calls.push("result:rpc");
    if (state.mode === "ambiguous_commit") {
      state.run.status = "uploaded";
      state.run.storage_path = storagePath;
      state.intents.get(claimToken)!.state = "attached";
    }
    throw new Error(state.mode === "double_fault" ? "injected event INSERT fault"
      : "injected lost RPC response after committed result");
  },
  claimFaceUploadIntentCleanup: async (claimToken: string) => {
    state.calls.push("intent:claim_cleanup");
    const intent = state.intents.get(claimToken)!;
    if (intent.state === "attached") return { state: "attached", may_delete: false, storage_path: intent.path };
    intent.state = "cleanup_pending";
    return { state: "cleanup_pending", may_delete: true, storage_path: intent.path };
  },
  markFaceUploadIntentCleaned: async (claimToken: string) => {
    state.intents.get(claimToken)!.state = "cleaned";
  },
  noteFaceUploadCleanupFailure: async (claimToken: string, error: string) => {
    state.calls.push("intent:note_failure");
    state.intents.get(claimToken)!.error = error;
  }
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe("face_analysis_runs");
      return {
        update: (changes: Record<string, unknown>) => {
          const filters = new Map<string, unknown>();
          const query = {
            eq(key: string, value: unknown) { filters.set(key, value); return query; },
            in() { return query; }, or() { return query; }, select() { return query; },
            async maybeSingle() {
              if (filters.get("upload_attempts") !== state.run.upload_attempts) return { data: null, error: null };
              state.run.upload_attempts = changes.upload_attempts as number;
              state.run.upload_claim_token = changes.upload_claim_token as string;
              state.run.upload_claimed_at = changes.upload_claimed_at as string;
              state.calls.push("run:claim");
              return { data: { id: state.runId }, error: null };
            },
            then(resolve: (value: { error: null }) => unknown) {
              if (filters.get("upload_claim_token") === state.run.upload_claim_token) {
                state.run.upload_claim_token = null;
                state.run.upload_claimed_at = null;
                state.calls.push("run:release");
              }
              return Promise.resolve(resolve({ error: null }));
            }
          };
          return query;
        }
      };
    },
    storage: { from: (bucket: string) => {
      expect(bucket).toBe("isolated-face-images");
      return {
        upload: async (path: string, _bytes: ArrayBuffer, opts: { upsert: boolean }) => {
          expect(opts.upsert).toBe(false);
          state.calls.push("storage:upload");
          if (state.objects.has(path)) return { error: { status: 409, message: "duplicate key" } };
          state.objects.add(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          state.calls.push("storage:remove");
          state.removed.push(...paths);
          if (state.removeFails) return { error: { status: 503, message: "injected remove failure" } };
          paths.forEach((path) => state.objects.delete(path));
          return { error: null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `isolated:${path}` }, error: null })
      };
    } }
  })
}));

// @ts-expect-error @spike is configured only for this isolated Vitest run.
import { POST } from "@spike/app/api/face-analysis/runs/[id]/upload/route";
// @ts-expect-error @spike is configured only for this isolated Vitest run.
import { buildFaceImagePath, createPrivateImagePreview, deleteRunImage, storePrivateImage } from "@spike/lib/face-analysis/storage";

const context = { params: Promise.resolve({ id: state.runId }) };
function request() {
  const form = new FormData();
  form.set("image", new File(["synthetic"], "qa.png", { type: "image/png" }));
  return new NextRequest(`http://localhost/api/face-analysis/runs/${state.runId}/upload`, {
    method: "POST", body: form
  });
}

describe("QA-FS-M23 Option A spike independent boundary tests", () => {
  beforeEach(() => {
    state.run.status = "created";
    state.run.upload_attempts = 0;
    state.run.upload_claim_token = null;
    state.run.upload_claimed_at = null;
    state.run.storage_path = null;
    state.intents.clear();
    state.objects.clear();
    state.removed.length = 0;
    state.calls.length = 0;
    state.mode = "double_fault";
    state.removeFails = true;
  });

  it("retains cleanup_pending and a distinct orphan after event and remove failures", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    expect(state.run).toMatchObject({ status: "created", storage_path: null,
      upload_attempts: 1, upload_claim_token: null });
    const [intent] = [...state.intents.values()];
    expect(intent).toMatchObject({ state: "cleanup_pending", error: "STORAGE_REMOVE_FAILED" });
    expect(state.objects.has(intent.path)).toBe(true);
    expect(state.calls).toEqual(["run:claim", "intent:create", "storage:upload",
      "result:rpc", "intent:claim_cleanup", "storage:remove", "intent:note_failure", "run:release"]);
  });

  it("preserves an attached image when an RPC response is lost after commit", async () => {
    state.mode = "ambiguous_commit";
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    const [intent] = [...state.intents.values()];
    expect(intent.state).toBe("attached");
    expect(state.run.storage_path).toBe(intent.path);
    expect(state.objects.has(intent.path)).toBe(true);
    expect(state.removed).toEqual([]);
  });

  it("keeps B when stale A removes its own key; accepts legacy paths", async () => {
    state.removeFails = false;
    const a = "22222222-2222-4222-8222-222222222222";
    const b = "33333333-3333-4333-8333-333333333333";
    const base = { profileId: state.userId, runId: state.runId, mimeType: "image/png" };
    const pathA = buildFaceImagePath({ ...base, attemptId: a });
    const pathB = buildFaceImagePath({ ...base, attemptId: b });
    await storePrivateImage({ ...base, attemptId: a, bytes: new ArrayBuffer(1) });
    await storePrivateImage({ ...base, attemptId: b, bytes: new ArrayBuffer(1) });
    await deleteRunImage(pathA);
    expect(pathA).not.toBe(pathB);
    expect(state.removed).toEqual([pathA]);
    expect(state.objects.has(pathB)).toBe(true);
    const legacy = `${state.userId}/${state.runId}/source.png`;
    await expect(createPrivateImagePreview(legacy)).resolves.toBe(`isolated:${legacy}`);
    await expect(deleteRunImage(`${state.userId}/${state.runId}/../source.png`))
      .rejects.toThrow("FACE_STORAGE_PATH_INVALID");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({
  runs: new Map<string, {
    id: string; user_id: string; status: string; storage_path: string | null;
    image_deleted_at: string | null; deletion_pending: boolean;
  }>(),
  objects: new Set<string>(),
  events: [] as Array<{ runId: string; userId: string; eventType: string }>,
  authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  authStatus: 200,
  claimConflict: false,
  storageFails: false,
  finalizeFails: false,
  eventFails: false,
  storageCalls: 0
}));

vi.mock("@/lib/auth/member", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/member")>("@/lib/auth/member");
  return {
    ...actual,
    requireBearerProfile: async () => {
      if (fixture.authStatus !== 200) throw actual.statusError("Unauthorized", fixture.authStatus);
      return { profile: { id: fixture.authUserId } };
    }
  };
});

vi.mock("@/lib/face-analysis/runs", () => ({
  getOwnedRun: async (userId: string, runId: string) => {
    const run = fixture.runs.get(runId);
    return run?.user_id === userId ? { ...run } : null;
  },
  appendFaceRunEvent: async (input: { runId: string; userId: string; eventType: string }) => {
    if (fixture.eventFails) throw new Error("injected event insert failure");
    fixture.events.push(input);
  }
}));

vi.mock("@/lib/face-analysis/storage", () => ({
  deleteRunImage: async (path: string) => {
    fixture.storageCalls++;
    if (fixture.storageFails) throw Object.assign(new Error("injected Storage remove failure"), { status: 503 });
    fixture.objects.delete(path);
  }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "face_analysis_events") return {
        insert: async () => ({ error: null })
      };
      expect(table).toBe("face_analysis_runs");
      return {
        update: (changes: Record<string, unknown>) => {
          const filters = new Map<string, unknown>();
          const query = {
            eq(key: string, value: unknown) { filters.set(key, value); return query; },
            neq(key: string, value: unknown) { filters.set(`not:${key}`, value); return query; },
            select() { return query; },
            async maybeSingle() {
              const run = fixture.runs.get(filters.get("id") as string);
              if (!run || run.user_id !== filters.get("user_id")) return { data: null, error: null };
              if (changes.deletion_pending === true) {
                if (fixture.claimConflict || run.deletion_pending || run.status === "analyzing") {
                  return { data: null, error: null };
                }
              } else if (changes.storage_path === null) {
                if (fixture.finalizeFails) return { data: null, error: { message: "injected DB finalize failure" } };
                if (run.deletion_pending !== filters.get("deletion_pending")) return { data: null, error: null };
              }
              Object.assign(run, changes);
              return { data: { id: run.id, image_deleted_at: run.image_deleted_at }, error: null };
            },
            then(resolve: (value: { error: null }) => unknown) {
              const run = fixture.runs.get(filters.get("id") as string);
              if (run && run.user_id === filters.get("user_id")) Object.assign(run, changes);
              return Promise.resolve(resolve({ error: null }));
            }
          };
          return query;
        }
      };
    }
  })
}));

import { DELETE } from "../app/api/face-analysis/runs/[id]/image/route";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const runId = "11111111-1111-4111-8111-111111111111";
const path = `${ownerId}/${runId}/source.png`;

function request() {
  return new NextRequest(`http://localhost/api/face-analysis/runs/${runId}/image`, { method: "DELETE" });
}

async function deleteImage(id = runId) {
  return DELETE(request(), { params: Promise.resolve({ id }) });
}

function addRun(overrides: Partial<{ user_id: string; status: string; storage_path: string | null;
  image_deleted_at: string | null; deletion_pending: boolean }> = {}) {
  fixture.runs.set(runId, { id: runId, user_id: ownerId, status: "completed",
    storage_path: path, image_deleted_at: null, deletion_pending: false, ...overrides });
  if (overrides.storage_path === undefined) fixture.objects.add(path);
}

describe("member face image DELETE QA in isolated in-memory services", () => {
  beforeEach(() => {
    fixture.runs.clear();
    fixture.objects.clear();
    fixture.events.length = 0;
    fixture.authUserId = ownerId;
    fixture.authStatus = 200;
    fixture.claimConflict = false;
    fixture.storageFails = false;
    fixture.finalizeFails = false;
    fixture.eventFails = false;
    fixture.storageCalls = 0;
  });
  afterEach(() => {
    fixture.runs.clear();
    fixture.objects.clear();
    fixture.events.length = 0;
  });

  it("deletes the owner's object, clears the row and records one event", async () => {
    addRun();
    const response = await deleteImage();
    expect(response.status).toBe(200);
    expect(fixture.objects.has(path)).toBe(false);
    expect(fixture.runs.get(runId)).toMatchObject({ storage_path: null,
      image_deleted_at: expect.any(String), deletion_pending: false });
    expect(fixture.events).toEqual([{ runId, userId: ownerId, eventType: "image_deleted_by_member" }]);
  });

  it("rejects unauthorized callers before reading or mutating the run", async () => {
    fixture.authStatus = 401;
    addRun();
    expect((await deleteImage()).status).toBe(401);
    expect(fixture.storageCalls).toBe(0);
    expect(fixture.events).toHaveLength(0);
    expect(fixture.runs.get(runId)?.storage_path).toBe(path);
  });

  it("returns 404 for malformed IDs and another member's run", async () => {
    addRun();
    expect((await deleteImage("not-a-uuid")).status).toBe(404);
    fixture.authUserId = otherId;
    expect((await deleteImage()).status).toBe(404);
    expect(fixture.storageCalls).toBe(0);
    expect(fixture.objects.has(path)).toBe(true);
  });

  it("rejects an analyzing run and a lost deletion claim", async () => {
    addRun({ status: "analyzing" });
    expect((await deleteImage()).status).toBe(409);
    addRun();
    fixture.claimConflict = true;
    expect((await deleteImage()).status).toBe(409);
    expect(fixture.storageCalls).toBe(0);
  });

  it("treats an already deleted image as idempotent success", async () => {
    addRun({ storage_path: null, image_deleted_at: "2026-01-01T00:00:00.000Z" });
    const response = await deleteImage();
    expect(response.status).toBe(200);
    expect(fixture.storageCalls).toBe(0);
    expect(fixture.events).toHaveLength(0);
  });

  it("releases the claim and keeps the object when Storage removal fails", async () => {
    addRun();
    fixture.storageFails = true;
    expect((await deleteImage()).status).toBe(503);
    expect(fixture.objects.has(path)).toBe(true);
    expect(fixture.runs.get(runId)).toMatchObject({ storage_path: path, deletion_pending: false });
    expect(fixture.events).toHaveLength(0);
  });

  it("leaves an unretryable pending claim if DB finalize fails after Storage removal", async () => {
    addRun();
    fixture.finalizeFails = true;
    const first = await deleteImage();
    expect(first.status).toBe(500);
    expect(fixture.objects.has(path)).toBe(false);
    expect(fixture.runs.get(runId)).toMatchObject({ storage_path: path,
      image_deleted_at: null, deletion_pending: true });
    fixture.finalizeFails = false;
    const retry = await deleteImage();
    expect(retry.status).toBe(409);
    expect(fixture.storageCalls).toBe(1);
    expect(fixture.events).toHaveLength(0);
  });

  it("returns 500 after cleanup if the audit event insert fails", async () => {
    addRun();
    fixture.eventFails = true;
    expect((await deleteImage()).status).toBe(500);
    expect(fixture.objects.has(path)).toBe(false);
    expect(fixture.runs.get(runId)).toMatchObject({ storage_path: null,
      image_deleted_at: expect.any(String), deletion_pending: false });
    fixture.eventFails = false;
    expect((await deleteImage()).status).toBe(200);
    expect(fixture.events).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({
  run: null as null | {
    id: string; user_id: string; status: string; storage_path: string | null;
    image_deleted_at: string | null; deletion_pending: boolean; operation_id: string | null;
  },
  objects: new Set<string>(),
  events: [] as Array<{ runId: string; userId: string; type: string; operationId: string }>,
  authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  authStatus: 200,
  storageFails: false,
  finalizeFails: false,
  storageCalls: 0,
  rpcCalls: [] as string[]
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
  getOwnedRun: async (userId: string, runId: string) =>
    fixture.run?.id === runId && fixture.run.user_id === userId ? { ...fixture.run } : null
}));
vi.mock("@/lib/face-analysis/storage", () => ({
  deleteRunImage: async (path: string) => {
    fixture.storageCalls++;
    if (fixture.storageFails) throw Object.assign(new Error("injected Storage failure"), { status: 503 });
    fixture.objects.delete(path);
  }
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: Record<string, string>) => {
      fixture.rpcCalls.push(name);
      const run = fixture.run;
      if (!run || run.id !== args.p_run_id || run.user_id !== args.p_user_id) {
        return { data: [{ result: "not_found" }], error: null };
      }
      if (name === "claim_face_analysis_image_deletion") {
        if (run.status === "analyzing") return { data: [{ result: "analyzing" }], error: null };
        if (run.image_deleted_at || !run.storage_path) {
          return { data: [{ result: "already_deleted", image_deleted_at: run.image_deleted_at }], error: null };
        }
        run.deletion_pending = true;
        run.operation_id ||= "qa-delete-operation-1";
        return { data: [{ result: "claimed", storage_path: run.storage_path, operation_id: run.operation_id }], error: null };
      }
      if (name === "release_face_analysis_image_deletion") {
        if (run.operation_id === args.p_operation_id) {
          run.deletion_pending = false;
          run.operation_id = null;
        }
        return { data: true, error: null };
      }
      expect(name).toBe("finalize_face_analysis_image_deletion");
      if (run.image_deleted_at && !run.storage_path) {
        return { data: [{ result: "already_deleted", image_deleted_at: run.image_deleted_at }], error: null };
      }
      if (!run.deletion_pending || run.operation_id !== args.p_operation_id || !run.storage_path) {
        return { data: [{ result: "conflict" }], error: null };
      }
      if (fixture.finalizeFails) return { data: null, error: { message: "injected DB/audit finalization failure" } };

      // Model the SQL RPC transaction: row, event and claim state commit together.
      const timestamp = "2026-10-11T00:00:00.000Z";
      run.storage_path = null;
      run.image_deleted_at = timestamp;
      run.deletion_pending = false;
      run.operation_id = null;
      if (!fixture.events.some((event) => event.operationId === args.p_operation_id)) {
        fixture.events.push({ runId: run.id, userId: run.user_id,
          type: "image_deleted_by_member", operationId: args.p_operation_id });
      }
      return { data: [{ result: "deleted", image_deleted_at: timestamp }], error: null };
    }
  })
}));

// Config aliases @ and @m24 to an immutable candidate worktree, selected via QA_M24_ROOT.
// @ts-expect-error This path exists only in the isolated M24 test config.
import { DELETE } from "@m24/app/api/face-analysis/runs/[id]/image/route";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const runId = "11111111-1111-4111-8111-111111111111";
const path = `${ownerId}/${runId}/source.png`;

function deleteImage(id = runId) {
  return DELETE(new NextRequest(`http://localhost/api/face-analysis/runs/${id}/image`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) });
}

describe("QA-owned M24 RPC route fault harness (stub only)", () => {
  beforeEach(() => {
    fixture.run = { id: runId, user_id: ownerId, status: "completed", storage_path: path,
      image_deleted_at: null, deletion_pending: false, operation_id: null };
    fixture.objects = new Set([path]);
    fixture.events = [];
    fixture.authUserId = ownerId;
    fixture.authStatus = 200;
    fixture.storageFails = false;
    fixture.finalizeFails = false;
    fixture.storageCalls = 0;
    fixture.rpcCalls = [];
  });

  it("recovers after Storage removed the photo but DB finalization failed", async () => {
    fixture.finalizeFails = true;
    expect((await deleteImage()).status).toBe(500);
    expect(fixture.objects.has(path)).toBe(false);
    expect(fixture.run).toMatchObject({ storage_path: path, image_deleted_at: null, deletion_pending: true });
    expect(fixture.events).toHaveLength(0);

    fixture.finalizeFails = false;
    expect((await deleteImage()).status).toBe(200);
    expect(fixture.run).toMatchObject({ storage_path: null, image_deleted_at: expect.any(String), deletion_pending: false });
    expect(fixture.events).toHaveLength(1);
    expect(fixture.storageCalls).toBe(2); // removal of a missing key must be idempotent
  });

  it("rolls back row/event together on injected finalization failure and emits once after retry", async () => {
    fixture.finalizeFails = true;
    expect((await deleteImage()).status).toBe(500);
    expect(fixture.run).toMatchObject({ storage_path: path, image_deleted_at: null, deletion_pending: true });
    expect(fixture.events).toHaveLength(0);
    fixture.finalizeFails = false;
    expect((await deleteImage()).status).toBe(200);
    expect(fixture.run).toMatchObject({ storage_path: null, image_deleted_at: expect.any(String), deletion_pending: false });
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]).toMatchObject({ type: "image_deleted_by_member", operationId: "qa-delete-operation-1" });
  });

  it("converges concurrent requests and repeated delete to one event", async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => deleteImage()));
    expect(responses.every((response: Response) => response.status === 200)).toBe(true);
    expect(fixture.run).toMatchObject({ storage_path: null, image_deleted_at: expect.any(String), deletion_pending: false });
    expect(fixture.events).toHaveLength(1);
    expect((await deleteImage()).status).toBe(200);
    expect(fixture.events).toHaveLength(1);
  });

  it("releases a failed Storage claim and keeps the object and path intact", async () => {
    fixture.storageFails = true;
    expect((await deleteImage()).status).toBe(503);
    expect(fixture.run).toMatchObject({ storage_path: path, deletion_pending: false, operation_id: null });
    expect(fixture.objects.has(path)).toBe(true);
    expect(fixture.events).toHaveLength(0);
    expect(fixture.rpcCalls).toEqual(["claim_face_analysis_image_deletion", "release_face_analysis_image_deletion"]);
  });

  it("preserves auth, ownership, analyzing, and already-deleted boundaries", async () => {
    fixture.authStatus = 401;
    expect((await deleteImage()).status).toBe(401);
    fixture.authStatus = 200;
    fixture.authUserId = otherId;
    expect((await deleteImage()).status).toBe(404);
    fixture.authUserId = ownerId;
    fixture.run!.status = "analyzing";
    expect((await deleteImage()).status).toBe(409);
    fixture.run!.status = "completed";
    fixture.run!.storage_path = null;
    fixture.run!.image_deleted_at = "2026-10-10T00:00:00.000Z";
    expect((await deleteImage()).status).toBe(200);
    expect(fixture.storageCalls).toBe(0);
    expect(fixture.events).toHaveLength(0);
  });
});

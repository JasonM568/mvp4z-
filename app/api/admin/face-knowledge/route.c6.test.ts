import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireNamedAdmin: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ profile: { id: "qa-admin" } })),
  requireNamedAdmin: (...args: unknown[]) => mocks.requireNamedAdmin(...args)
}));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: (...args: unknown[]) => mocks.rpc(...args) })
}));

import { POST as createCard } from "./route";
import { DELETE as archiveCard, PATCH as updateCard } from "./[id]/route";
import { POST as bulkCards } from "./bulk/route";
import { POST as importCards } from "./import/route";

function request(url: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("face knowledge atomic write routes", () => {
  beforeEach(() => mocks.requireNamedAdmin.mockResolvedValue({ profile: { id: "qa-admin" } }));
  afterEach(() => vi.resetAllMocks());

  it("creates a card through the atomic RPC", async () => {
    const item = { id: "card-1", version: 1 };
    mocks.rpc.mockResolvedValue({ data: { items: [item] }, error: null });

    const response = await createCard(request("/api/admin/face-knowledge", "POST", {
      cardId: "C6-1", title: "Title", category: "test", observation: "Observed"
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).item).toEqual(item);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_face_knowledge", expect.objectContaining({ p_action: "create" }));
  });

  it("returns 409 for stale version and keeps conflict details", async () => {
    mocks.rpc.mockResolvedValue({ data: { conflict: true, current_version: 4 }, error: null });

    const response = await updateCard(request("/api/admin/face-knowledge/card-1", "PATCH", {
      expectedVersion: 3, title: "unsaved edit"
    }), { params: Promise.resolve({ id: "card-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("FACE_KNOWLEDGE_VERSION_CONFLICT");
    expect(body.currentVersion).toBe(4);
    expect(body.error).toContain("重新載入");
    expect(mocks.rpc).toHaveBeenCalledWith("manage_face_knowledge", expect.objectContaining({
      p_action: "patch",
      p_payload: expect.objectContaining({ id: "card-1", expected_version: 3, title: "unsaved edit" })
    }));
  });

  it("archives a card through the atomic RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [{ id: "card-1" }] }, error: null });
    const response = await archiveCard(request("/api/admin/face-knowledge/card-1", "DELETE", {}), { params: Promise.resolve({ id: "card-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_face_knowledge", expect.objectContaining({
      p_action: "archive", p_payload: { id: "card-1" }
    }));
  });

  it("runs bulk writes through the atomic RPC", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mocks.rpc.mockResolvedValue({ data: { items: [{ id, card_id: "C6-1", status: "published", safety_level: "standard", auto_report: true }] }, error: null });
    const response = await bulkCards(request("/api/admin/face-knowledge/bulk", "POST", { ids: [id], action: "publish" }));

    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_face_knowledge", expect.objectContaining({ p_action: "bulk" }));
  });

  it("imports/upserts through the atomic RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [{ id: "card-1", card_id: "C6-1", status: "draft", version: 2 }] }, error: null });
    const response = await importCards(request("/api/admin/face-knowledge/import", "POST", {
      items: [{ card_id: "C6-1", title: "Imported", category: "test", observation: "Source" }]
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).imported).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_face_knowledge", expect.objectContaining({ p_action: "import" }));
    const rpcArgs = mocks.rpc.mock.calls[0][1] as { p_admin_user_id: string; p_payload: { items: Record<string, unknown>[] } };
    expect(rpcArgs.p_admin_user_id).toBe("qa-admin");
    expect(rpcArgs.p_payload.items[0]).not.toHaveProperty("created_by");
  });

  it("rejects shared-key anonymous identity on all five write entry points", async () => {
    mocks.requireNamedAdmin.mockRejectedValue({ message: "named admin required", status: 403 });
    const calls = [
      createCard(request("/api/admin/face-knowledge", "POST", { cardId: "C6-2", title: "Title", category: "test" })),
      updateCard(request("/api/admin/face-knowledge/card-1", "PATCH", { expectedVersion: 1, title: "Title" }), { params: Promise.resolve({ id: "card-1" }) }),
      archiveCard(request("/api/admin/face-knowledge/card-1", "DELETE", {}), { params: Promise.resolve({ id: "card-1" }) }),
      bulkCards(request("/api/admin/face-knowledge/bulk", "POST", { ids: ["11111111-1111-4111-8111-111111111111"], action: "archive" })),
      importCards(request("/api/admin/face-knowledge/import", "POST", { items: [{ card_id: "C6-3", title: "Title", category: "test" }] }))
    ];

    const responses = await Promise.all(calls);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

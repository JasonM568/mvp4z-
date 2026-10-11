import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ from: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ profile: { id: "qa-admin" } })),
  writeAdminAudit: (...args: unknown[]) => mocks.audit(...args)
}));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (...args: unknown[]) => mocks.from(...args) })
}));

import { PATCH, POST } from "./route";

function request(method: "POST" | "PATCH", body: unknown) {
  return new NextRequest("http://localhost/api/admin/site-content", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function builder(data: unknown) {
  const value: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "insert", "update", "eq", "upsert"]) {
    value[method] = vi.fn(() => value);
  }
  value.maybeSingle = vi.fn(async () => ({ data, error: null }));
  value.single = vi.fn(async () => ({ data, error: null }));
  return value;
}

describe("site-content publish booleans and empty published lists", () => {
  afterEach(() => vi.resetAllMocks());

  it.each(["false", "true", 0, 1, null, {}])("rejects non-boolean is_published=%j before DB writes", async (flag) => {
    const response = await POST(request("POST", { type: "services", title: "Draft", is_published: flag }));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["false", "true", 0, 1, null])("rejects non-boolean PATCH is_published=%j before DB writes", async (flag) => {
    const response = await PATCH(request("PATCH", { type: "services", id: "item-1", is_published: flag }));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["false", "true", 0, 1, null])("rejects non-boolean promo.active=%j before DB writes", async (flag) => {
    const response = await PATCH(request("PATCH", { type: "promo", active: flag }));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([false, true])("stores a genuine boolean is_published=%s on create", async (flag) => {
    const last = builder({ sort_order: 0 });
    const insert = builder({ id: "item-1", title: "Item", is_published: flag });
    mocks.from.mockReturnValueOnce(last).mockReturnValueOnce(insert);

    const response = await POST(request("POST", { type: "services", title: "Item", is_published: flag }));

    expect(response.status).toBe(201);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ is_published: flag }));
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("stores a genuine boolean promo.active=%s", async (flag) => {
    const upsert = builder({ id: "default", active: flag, title: "Promo" });
    mocks.from.mockReturnValueOnce(upsert);

    const response = await PATCH(request("PATCH", { type: "promo", active: flag }));

    expect(response.status).toBe(200);
    expect(upsert.upsert).toHaveBeenCalledWith({ id: "default", active: flag }, { onConflict: "id" });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
});

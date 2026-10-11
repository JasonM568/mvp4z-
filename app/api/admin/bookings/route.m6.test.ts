import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ profile: { id: "qa-admin" } }))
}));

vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (...args: unknown[]) => mocks.from(...args) })
}));

import { GET } from "./route";

function request(limit?: string) {
  const url = new URL("http://localhost/api/admin/bookings");
  if (limit !== undefined) url.searchParams.set("limit", limit);
  return new NextRequest(url);
}

function query(result: { data: unknown[]; error: null }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (value: typeof result) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder as {
    select: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    then: (resolve: (value: typeof result) => unknown, reject?: (error: unknown) => unknown) => unknown;
  };
}

describe("GET /api/admin/bookings limit", () => {
  afterEach(() => vi.resetAllMocks());

  it.each(["-1", "abc", "0", "501"])('returns 400 for limit="%s" before reading bookings', async (limit) => {
    const response = await GET(request(limit));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "limit 必須是 1 到 500 的整數" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["1", "500"])('reads list and summary for valid limit="%s" without writes', async (rawLimit) => {
    const listQuery = query({ data: [{ id: "booking-1", status: "pending" }], error: null });
    const summaryQuery = query({ data: [{ status: "pending" }, { status: "confirmed" }, { status: "pending" }], error: null });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("consultation_bookings");
      return mocks.from.mock.calls.length === 1 ? listQuery : summaryQuery;
    });

    const response = await GET(request(rawLimit));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listQuery.limit).toHaveBeenCalledWith(Number(rawLimit));
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(body.bookings).toEqual([{ id: "booking-1", status: "pending" }]);
    expect(body.summary).toEqual({ pending: 2, confirmed: 1 });
    expect(mocks.from.mock.calls.every(([table]) => table === "consultation_bookings")).toBe(true);
  });

  it("keeps the default limit when the parameter is absent", async () => {
    const listQuery = query({ data: [], error: null });
    const summaryQuery = query({ data: [], error: null });
    mocks.from.mockImplementation(() => mocks.from.mock.calls.length === 1 ? listQuery : summaryQuery);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(listQuery.limit).toHaveBeenCalledWith(100);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});

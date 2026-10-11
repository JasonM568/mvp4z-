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

function request(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/course-registrations");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function query(result: { data: unknown[]; error: null }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.range = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.then = (resolve: (value: typeof result) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder as {
    select: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    then: (resolve: (value: typeof result) => unknown, reject?: (error: unknown) => unknown) => unknown;
  };
}

describe("GET /api/admin/course-registrations M7/M11", () => {
  afterEach(() => vi.resetAllMocks());

  it.each(["-1", "0", "abc", "501", "", "1.5", "1e2"])(
    'returns 400 for invalid limit="%s" before querying registrations',
    async (limit) => {
      const response = await GET(request({ limit }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "limit 必須是 1 到 500 的整數" });
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );

  it.each(["1", "500"])("keeps list limit=%s while summarizing the full matching set", async (limit) => {
    const listQuery = query({ data: [{ id: "registration-1", contact_status: "new" }], error: null });
    const summaryQuery = query({
      data: [
        { id: "registration-1", contact_status: "new", paid_at: null, orders: null },
        { id: "registration-2", contact_status: "new", paid_at: null, orders: null }
      ],
      error: null
    });
    mocks.from.mockReturnValueOnce(listQuery).mockReturnValueOnce(summaryQuery);

    const response = await GET(request({ limit }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listQuery.limit).toHaveBeenCalledWith(Number(limit));
    expect(summaryQuery.range).toHaveBeenCalledWith(0, 999);
    expect(body.registrations).toHaveLength(1);
    expect(body.summary).toEqual({ total: 2, paid: 0, pendingContact: 2, byContact: { new: 2 } });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("applies a valid contact_status filter to both list and full-set summary", async () => {
    const listQuery = query({ data: [{ id: "contacted-1", contact_status: "contacted" }], error: null });
    const summaryQuery = query({
      data: [
        { id: "contacted-1", contact_status: "contacted", paid_at: null, orders: null },
        { id: "contacted-2", contact_status: "contacted", paid_at: null, orders: null }
      ],
      error: null
    });
    mocks.from.mockReturnValueOnce(listQuery).mockReturnValueOnce(summaryQuery);

    const response = await GET(request({ limit: "1", contact_status: "contacted" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listQuery.eq).toHaveBeenCalledWith("contact_status", "contacted");
    expect(summaryQuery.eq).toHaveBeenCalledWith("contact_status", "contacted");
    expect(body.registrations).toHaveLength(1);
    expect(body.summary).toEqual({ total: 2, paid: 0, pendingContact: 0, byContact: { contacted: 2 } });
  });

  it("continues summary pagination beyond Supabase's 1000-row page size", async () => {
    const listQuery = query({ data: [{ id: "registration-1" }], error: null });
    const firstSummaryPage = query({
      data: Array.from({ length: 1000 }, (_, index) => ({
        id: `registration-${index + 1}`,
        contact_status: "new",
        paid_at: null,
        orders: null
      })),
      error: null
    });
    const secondSummaryPage = query({
      data: [{ id: "registration-1001", contact_status: "new", paid_at: "2026-10-11", orders: null }],
      error: null
    });
    mocks.from.mockReturnValueOnce(listQuery).mockReturnValueOnce(firstSummaryPage).mockReturnValueOnce(secondSummaryPage);

    const response = await GET(request({ limit: "1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(firstSummaryPage.range).toHaveBeenCalledWith(0, 999);
    expect(secondSummaryPage.range).toHaveBeenCalledWith(1000, 1999);
    expect(body.registrations).toHaveLength(1);
    expect(body.summary).toEqual({ total: 1001, paid: 1, pendingContact: 1001, byContact: { new: 1001 } });
  });

  it("keeps the default limit when the parameter is absent", async () => {
    const listQuery = query({ data: [], error: null });
    const summaryQuery = query({ data: [], error: null });
    mocks.from.mockReturnValueOnce(listQuery).mockReturnValueOnce(summaryQuery);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(listQuery.limit).toHaveBeenCalledWith(200);
  });
});

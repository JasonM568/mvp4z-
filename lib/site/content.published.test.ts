import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (...args: unknown[]) => mocks.from(...args) })
}));

import { readPublishedContent } from "./content";

type QueryResult = { data: unknown[] | null; error: unknown | null };

function query(result: QueryResult) {
  const value: Record<string, unknown> = {};
  value.select = vi.fn(() => value);
  value.eq = vi.fn(() => value);
  value.order = vi.fn(() => value);
  value.then = (resolve: (result: QueryResult) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return value;
}

describe("readPublishedContent M12", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns an empty list when DB query succeeds with no published rows", async () => {
    mocks.from.mockReturnValue(query({ data: [], error: null }));

    await expect(readPublishedContent("services")).resolves.toEqual([]);
  });

  it("returns published rows from DB", async () => {
    const rows = [{ id: "published-1", title: "Published" }];
    mocks.from.mockReturnValue(query({ data: rows, error: null }));

    await expect(readPublishedContent("services")).resolves.toEqual(rows);
  });

  it("keeps static content fallback for an actual missing-table/database failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.from.mockReturnValue(query({ data: null, error: { code: "42P01", message: "missing table" } }));

    const items = await readPublishedContent("services");
    expect(items.length).toBeGreaterThan(0);
    warn.mockRestore();
  });
});

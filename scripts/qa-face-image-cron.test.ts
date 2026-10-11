import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A route-level isolation fixture: no Supabase, Storage, cron scheduler, or real photo.
const fixture = vi.hoisted(() => ({
  runs: new Map<string, {
    id: string; user_id: string; status: string; storage_path: string | null;
    image_expires_at: string; image_deleted_at: string | null;
    created_at: string; updated_at: string; error_code: string | null;
  }>(),
  objects: new Set<string>(),
  events: [] as Array<{ run_id: string; event_type: string }>,
  removeFails: false,
  updateFails: false,
  adminCalls: 0
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    fixture.adminCalls++;
    return {
      from: (table: string) => {
        if (table === "face_analysis_events") return {
          insert: async (event: { run_id: string; event_type: string }) => {
            fixture.events.push(event);
            return { error: null };
          }
        };
        expect(table).toBe("face_analysis_runs");
        return {
          select: () => {
            const query = {
              not() { return query; }, is() { return query; }, lte() { return query; },
              order() { return query; },
              async limit(max: number) {
                const now = Date.now();
                return { data: [...fixture.runs.values()].filter((run) =>
                  run.storage_path && !run.image_deleted_at
                  && new Date(run.image_expires_at).getTime() <= now
                ).slice(0, max), error: null };
              }
            };
            return query;
          },
          update: (changes: Record<string, unknown>) => {
            const filters = new Map<string, unknown>();
            const query = {
              eq(key: string, value: unknown) { filters.set(key, value); return query; },
              is() { return query; },
              lt(_key: string, value: string) { filters.set("cutoff", value); return query; },
              select() { return query; },
              async maybeSingle() {
                if (fixture.updateFails) return { data: null, error: { message: "injected DB update failure" } };
                const run = fixture.runs.get(filters.get("id") as string);
                if (!run || run.storage_path !== filters.get("storage_path") || run.image_deleted_at) {
                  return { data: null, error: null };
                }
                Object.assign(run, changes);
                return { data: { id: run.id }, error: null };
              },
              then(resolve: (result: { data: Array<{ id: string }>; error: null }) => unknown) {
                const changed: Array<{ id: string }> = [];
                for (const run of fixture.runs.values()) {
                  const status = filters.get("status");
                  const dateField = status === "created" ? "created_at" : "updated_at";
                  if (run.status === status && run[dateField] < (filters.get("cutoff") as string)) {
                    Object.assign(run, changes);
                    changed.push({ id: run.id });
                  }
                }
                return Promise.resolve(resolve({ data: changed, error: null }));
              }
            };
            return query;
          }
        };
      },
      storage: { from: (bucket: string) => {
        expect(bucket).toBe("face-analysis-uploads");
        return { remove: async (paths: string[]) => {
          if (fixture.removeFails) return { error: { message: "injected Storage failure" } };
          paths.forEach((path) => fixture.objects.delete(path));
          return { error: null };
        } };
      } }
    };
  }
}));

import { GET, POST } from "../app/api/cron/cleanup-face-images/route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function addRun(id: string, expiresMs: number, status = "uploaded") {
  const path = `${userId}/${id}/source.png`;
  fixture.runs.set(id, { id, user_id: userId, status, storage_path: path,
    image_expires_at: new Date(Date.now() + expiresMs).toISOString(), image_deleted_at: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(), error_code: null });
  fixture.objects.add(path);
  return path;
}
function request(secret?: string, method = "GET") {
  return new NextRequest("http://localhost/api/cron/cleanup-face-images", {
    method, headers: secret ? { Authorization: `Bearer ${secret}` } : {}
  });
}

describe("face image retention cron isolated route QA", () => {
  const priorSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "qa-isolated-cron-secret";
    fixture.runs.clear();
    fixture.objects.clear();
    fixture.events.length = 0;
    fixture.removeFails = false;
    fixture.updateFails = false;
    fixture.adminCalls = 0;
  });
  afterEach(() => {
    if (priorSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = priorSecret;
    fixture.runs.clear();
    fixture.objects.clear();
    fixture.events.length = 0;
  });

  it("rejects missing and wrong cron secrets before opening DB", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await POST(request("wrong", "POST"))).status).toBe(401);
    expect(fixture.adminCalls).toBe(0);
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request())).status).toBe(500);
    expect(fixture.adminCalls).toBe(0);
  });

  it("reports an empty batch without deleting or writing events", async () => {
    const response = await GET(request("qa-isolated-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ candidate_count: 0,
      deleted_count: 0, failed_count: 0, results: [] });
    expect(fixture.events).toEqual([]);
  });

  it("deletes only expired image, clears its DB path, and is idempotent", async () => {
    const oldId = "11111111-1111-4111-8111-111111111111";
    const newId = "22222222-2222-4222-8222-222222222222";
    const oldPath = addRun(oldId, -60_000);
    const newPath = addRun(newId, 60_000);
    const first = await GET(request("qa-isolated-cron-secret"));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ candidate_count: 1,
      deleted_count: 1, failed_count: 0 });
    expect(fixture.objects.has(oldPath)).toBe(false);
    expect(fixture.runs.get(oldId)).toMatchObject({ storage_path: null,
      image_deleted_at: expect.any(String) });
    expect(fixture.objects.has(newPath)).toBe(true);
    expect(fixture.runs.get(newId)?.storage_path).toBe(newPath);
    expect(fixture.events.map((event) => event.event_type)).toEqual(["image_cleanup_completed"]);
    const again = await GET(request("qa-isolated-cron-secret"));
    expect(await again.json()).toMatchObject({ candidate_count: 0, deleted_count: 0 });
    expect(fixture.events).toHaveLength(1);
  });

  it("keeps the DB reference and records failure when Storage removal fails", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const path = addRun(id, -60_000);
    fixture.removeFails = true;
    const response = await POST(request("qa-isolated-cron-secret", "POST"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ candidate_count: 1,
      deleted_count: 0, failed_count: 1 });
    expect(fixture.objects.has(path)).toBe(true);
    expect(fixture.runs.get(id)?.storage_path).toBe(path);
    expect(fixture.events.map((event) => event.event_type)).toEqual(["image_cleanup_failed"]);
  });

  it("reports a DB update failure after Storage removal and retries the stale path", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    const path = addRun(id, -60_000);
    fixture.updateFails = true;

    const first = await GET(request("qa-isolated-cron-secret"));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ candidate_count: 1,
      deleted_count: 0, failed_count: 1 });
    expect(fixture.objects.has(path)).toBe(false);
    expect(fixture.runs.get(id)?.storage_path).toBe(path);
    expect(fixture.events.map((event) => event.event_type)).toEqual(["image_cleanup_failed"]);

    fixture.updateFails = false;
    const retry = await GET(request("qa-isolated-cron-secret"));
    expect(await retry.json()).toMatchObject({ candidate_count: 1,
      deleted_count: 1, failed_count: 0 });
    expect(fixture.runs.get(id)).toMatchObject({ storage_path: null,
      image_deleted_at: expect.any(String) });
    expect(fixture.events.map((event) => event.event_type)).toEqual([
      "image_cleanup_failed", "image_cleanup_completed"
    ]);
  });

  it("processes at most 100 images per call, then drains the next batch", async () => {
    for (let number = 1; number <= 101; number++) {
      const suffix = number.toString(16).padStart(12, "0");
      addRun(`44444444-4444-4444-8444-${suffix}`, -60_000);
    }
    const first = await GET(request("qa-isolated-cron-secret"));
    expect(await first.json()).toMatchObject({ candidate_count: 100, deleted_count: 100 });
    expect(fixture.objects.size).toBe(1);
    const second = await GET(request("qa-isolated-cron-secret"));
    expect(await second.json()).toMatchObject({ candidate_count: 1, deleted_count: 1 });
    expect(fixture.objects.size).toBe(0);
    expect(fixture.events).toHaveLength(101);
  });
});

import { describe, expect, it, vi } from "vitest";
import { acquireCouncilSlot, releaseCouncilSlot } from "./inflight";

const client = (result: { data?: unknown; error?: any }) => ({
  rpc: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
});

describe("acquireCouncilSlot", () => {
  it("搶到 → acquired", async () =>
    expect(await acquireCouncilSlot(client({ data: true }), "u1")).toEqual({ acquired: true, degraded: false }));
  it("別份進行中 → 不放行", async () =>
    expect(await acquireCouncilSlot(client({ data: false }), "u1")).toEqual({ acquired: false, degraded: false }));
  it("migration 未套用 → 降級放行並標記", async () =>
    expect(await acquireCouncilSlot(client({ error: { code: "PGRST202", message: "x" } }), "u1"))
      .toEqual({ acquired: true, degraded: true }));
  it("其他資料庫錯誤 → 往外丟，不放行", async () =>
    await expect(acquireCouncilSlot(client({ error: { code: "XX000", message: "boom" } }), "u1")).rejects.toBeTruthy());
  it("回傳非 true（null/undefined）一律視為沒搶到", async () =>
    expect((await acquireCouncilSlot(client({ data: null }), "u1")).acquired).toBe(false));
  it("並行：模擬 DB 的原子行為，N 個只有 1 個搶到", async () => {
    let held = false;
    const db = { rpc: async () => { const got = !held; held = true; return { data: got, error: null }; } };
    const r = await Promise.all(Array.from({ length: 10 }, () => acquireCouncilSlot(db, "u1")));
    expect(r.filter((x) => x.acquired)).toHaveLength(1);
  });
});

describe("releaseCouncilSlot", () => {
  it("失敗不丟錯", async () => {
    await expect(releaseCouncilSlot(client({ error: { code: "XX000", message: "boom" } }), "u1")).resolves.toBeUndefined();
    await expect(releaseCouncilSlot({ rpc: () => { throw new Error("net"); } }, "u1")).resolves.toBeUndefined();
  });
});

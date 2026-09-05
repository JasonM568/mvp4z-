import { describe, expect, it, vi, beforeEach } from "vitest";

// createSupabaseAdminClient 用 hoisted mock 換掉，測試裡不碰真的 Supabase。
const { adminClientFactory } = vi.hoisted(() => ({ adminClientFactory: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => adminClientFactory()
}));

import {
  grantTrialIfEligible,
  normalizeTaiwanMobile,
  TRIAL_CREDITS,
  TRIAL_DURATION_DAYS
} from "@/lib/auth/member";

type RpcCall = { fn: string; args: Record<string, unknown> };

/**
 * grantTrialIfEligible 現在只是 grant_signup_trial 這個 DB function 的薄包裝
 * （原子性與併發鎖都在 DB 裡），所以這裡驗的是「有沒有把正規化後的手機正確送進去」
 * 以及「回傳值有沒有正確翻譯」。認領表本身的行為由 migration 的 primary key 保證。
 */
function wireRpc(reply: { granted: boolean; reason: string | null; entitlement_id: string | null }) {
  const calls: RpcCall[] = [];
  adminClientFactory.mockReturnValue({
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: [reply], error: null });
    }
  });
  return calls;
}

beforeEach(() => {
  adminClientFactory.mockReset();
});

describe("normalizeTaiwanMobile", () => {
  it("把常見的等價寫法收斂成同一個字串", () => {
    const expected = "0912345678";
    for (const input of [
      "0912345678",
      "0912-345-678",
      "0912 345 678",
      "(0912)345678",
      "+886912345678",
      "+886-912-345-678",
      "886912345678",
      "  0912345678  "
    ]) {
      expect(normalizeTaiwanMobile(input), input).toBe(expected);
    }
  });

  it("格式不對就回空字串，不硬湊", () => {
    for (const input of [
      "",
      "0212345678",
      "091234567",
      "09123456789",
      "abc",
      "+8869123456789",
      "００９１２３４５６７８",
      "0912\u200B345678",
      "+886(0)912345678",
      "00886912345678"
    ]) {
      expect(normalizeTaiwanMobile(input), JSON.stringify(input)).toBe("");
    }
  });
});

describe("grantTrialIfEligible", () => {
  it("發放成功：回 entitlementId", async () => {
    const calls = wireRpc({ granted: true, reason: null, entitlement_id: "ent-new" });
    expect(await grantTrialIfEligible("p1", "0912345678")).toEqual({
      granted: true,
      entitlementId: "ent-new"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: "grant_signup_trial",
      args: {
        p_profile_id: "p1",
        p_phone: "0912345678",
        p_credits: TRIAL_CREDITS,
        p_duration_days: TRIAL_DURATION_DAYS
      }
    });
  });

  it("送進 DB 的一定是正規化後的手機（否則同一支號碼會存成兩個 key）", async () => {
    const calls = wireRpc({ granted: true, reason: null, entitlement_id: "ent-new" });
    await grantTrialIfEligible("p1", "+886-912-345-678");
    expect(calls[0].args.p_phone).toBe("0912345678");
  });

  it("手機正規化不過就送空字串，交給 DB 回 invalid_phone —— 不會因為沒號碼就照發", async () => {
    const calls = wireRpc({ granted: false, reason: "invalid_phone", entitlement_id: null });
    expect(await grantTrialIfEligible("p1", "0912·345·678")).toEqual({
      granted: false,
      reason: "invalid_phone"
    });
    expect(calls[0].args.p_phone).toBe("");
  });

  it("同手機已被別的帳號認領：回 phone_already_claimed", async () => {
    wireRpc({ granted: false, reason: "phone_already_claimed", entitlement_id: null });
    expect(await grantTrialIfEligible("p2", "0912345678")).toEqual({
      granted: false,
      reason: "phone_already_claimed"
    });
  });

  it("自己已有 entitlement：回 already_granted", async () => {
    wireRpc({ granted: false, reason: "already_granted", entitlement_id: null });
    expect(await grantTrialIfEligible("p1", "0912345678")).toEqual({
      granted: false,
      reason: "already_granted"
    });
  });

  it("DB 出錯就 throw，讓呼叫端決定 —— 絕不默默當成發放成功", async () => {
    adminClientFactory.mockReturnValue({
      rpc: () => Promise.resolve({ data: null, error: { message: "connection reset" } })
    });
    await expect(grantTrialIfEligible("p1", "0912345678")).rejects.toMatchObject({
      message: "connection reset"
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  escapeLikePattern,
  readReferralCode,
  referralFieldsForOrder,
  resolveReferral
} from "./attribution";

type Row = Record<string, unknown> | null;

function adminMock(profileRow: Row, partnerRows: Record<string, Row>) {
  const from = vi.fn((table: string) => {
    let selectedCode = "";
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((_column: string, value: string) => {
        if (table === "profiles") selectedCode = value;
        return chain;
      }),
      ilike: vi.fn((_column: string, value: string) => {
        selectedCode = value.replace(/\\([\\%_])/g, "$1");
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({
        data: table === "profiles" ? profileRow : partnerRows[selectedCode] ?? null,
        error: null
      }))
    };
    return chain;
  });
  return { from };
}

function request(cookie?: string) {
  return new NextRequest("https://www.xunfeng.tw/", {
    headers: cookie ? { cookie: `xf_ref=${encodeURIComponent(cookie)}` } : undefined
  });
}

describe("referral attribution", () => {
  it("escapes SQL LIKE wildcard characters", () => {
    expect(escapeLikePattern("AL_%\\X")).toBe("AL\\_\\%\\\\X");
  });

  it("accepts only referral-code-shaped cookies", () => {
    expect(readReferralCode(request("ran81127"))).toBe("ran81127");
    expect(readReferralCode(request("%_"))).toBeNull();
    expect(readReferralCode(request("a"))).toBeNull();
  });

  it("returns an active partner and rejects an inactive one", async () => {
    const active = { id: "p1", code: "A_B", commission_rate: "0.2", is_active: true };
    expect(await resolveReferral(adminMock(null, { A_B: active }) as never, "A_B")).toEqual({
      referral_partner_id: "p1",
      referral_code: "A_B",
      referral_rate: 0.2
    });
    expect(await resolveReferral(adminMock(null, { OFF: { ...active, code: "OFF", is_active: false } }) as never, "OFF")).toBeNull();
  });

  it("keeps the registration-bound partner ahead of a later cookie", async () => {
    const admin = adminMock(
      { referral_code: "BOUND" },
      {
        BOUND: { id: "p1", code: "BOUND", commission_rate: 0.2, is_active: true },
        LATER: { id: "p2", code: "LATER", commission_rate: 0.3, is_active: true }
      }
    );
    await expect(referralFieldsForOrder(admin as never, request("LATER"), "member-1")).resolves.toMatchObject({
      referral_partner_id: "p1",
      referral_code: "BOUND"
    });
  });

  it("falls back to the cookie when the profile has no valid partner", async () => {
    const admin = adminMock(
      { referral_code: "MISSING" },
      { COOKIE: { id: "p2", code: "COOKIE", commission_rate: 0.15, is_active: true } }
    );
    await expect(referralFieldsForOrder(admin as never, request("COOKIE"), "member-1")).resolves.toMatchObject({
      referral_partner_id: "p2",
      referral_code: "COOKIE"
    });
  });
});

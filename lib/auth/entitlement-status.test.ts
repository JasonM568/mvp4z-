// 「點數卡住」的判定與到期掃描的語意。
//
// 兩件事都源自 2026-09-22 查正式庫的發現：
// 1. 13 位有效 trial 會員裡有 6 位停在 10 點——用完免費點數後產不出報告，
//    0 人付費、0 人開過結帳頁，而後台完全看不出這群人存在。
// 2. 7 筆 entitlement 標著 active 但早就過期，最久從 6/01 放到現在。
//    功能上安全（扣點路由都有比對 expires_at），但只看 status 的統計會說謊。

import { describe, expect, it } from "vitest";
import { DEFAULT_COUNCIL_COST } from "./tier";

/** 與 app/admin/members/page.tsx 的 isStuck 同一套規則。 */
function isStuck(m: { status: string; credits_remaining: number }, reportCost: number) {
  return m.status === "active" && m.credits_remaining < reportCost;
}

/** 與 cron 的判定同一套：status 說 active、但時間已經過了。 */
function needsExpiry(e: { status: string; expires_at: string }, now: Date) {
  return e.status === "active" && new Date(e.expires_at) < now;
}

describe("點數卡住的判定", () => {
  it("報告成本是 20，且後台與扣點共用同一個常數", () => {
    expect(DEFAULT_COUNCIL_COST).toBe(20);
  });

  it("正式庫那批：active 且剩 10 點 → 卡住", () => {
    expect(isStuck({ status: "active", credits_remaining: 10 }, DEFAULT_COUNCIL_COST)).toBe(true);
  });

  it("剛好等於成本不算卡住——他還產得出一份", () => {
    expect(isStuck({ status: "active", credits_remaining: 20 }, DEFAULT_COUNCIL_COST)).toBe(false);
  });

  it("已到期的人不算卡住", () => {
    // 他們要的是續訂提醒，不是加購提醒。兩種名單混在一起，兩邊的文案都會寫不對。
    expect(isStuck({ status: "expired", credits_remaining: 10 }, DEFAULT_COUNCIL_COST)).toBe(false);
    expect(isStuck({ status: "pending", credits_remaining: 0 }, DEFAULT_COUNCIL_COST)).toBe(false);
  });

  it("0 點也算卡住", () => {
    expect(isStuck({ status: "active", credits_remaining: 0 }, DEFAULT_COUNCIL_COST)).toBe(true);
  });
});

describe("到期掃描的判定", () => {
  const now = new Date("2026-09-22T00:00:00.000Z");

  it("active 但時間已過 → 要掃", () => {
    expect(needsExpiry({ status: "active", expires_at: "2026-06-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("active 且還沒到期 → 不動", () => {
    expect(needsExpiry({ status: "active", expires_at: "2026-10-16T00:00:00.000Z" }, now)).toBe(false);
  });

  it("已經標成 expired 的不重複處理", () => {
    expect(needsExpiry({ status: "expired", expires_at: "2026-06-01T00:00:00.000Z" }, now)).toBe(false);
  });
});

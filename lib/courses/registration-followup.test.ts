// 課程報名的跟進狀態。
//
// 這組規則的重點是「跟進」與「付款」必須分開：2026-09-11 查證時，5 筆報名
// 全部沒有完成付款，若用付款狀態當唯一過濾條件，最該打電話的那幾個人
// 會剛好被濾掉——那正是老師「看不到報名狀況」的成因之一。

import { describe, expect, it } from "vitest";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  adminRegistrationUpdateSchema
} from "./registration-followup";

describe("跟進狀態", () => {
  it("四種狀態，且預設值 new 在清單裡", () => {
    expect(CONTACT_STATUSES).toEqual(["new", "contacted", "converted", "closed"]);
    expect(CONTACT_STATUSES).toContain("new");
  });

  it("每個狀態都有中文標籤（後台不可出現英文代碼）", () => {
    for (const s of CONTACT_STATUSES) {
      expect(CONTACT_STATUS_LABELS[s], s).toBeTruthy();
      expect(CONTACT_STATUS_LABELS[s]).not.toMatch(/[a-z]/);
    }
  });

  it("不含任何付款語意的狀態", () => {
    // 付款由 orders 表達。這裡混進 paid／unpaid 會讓兩套狀態互相打架。
    for (const s of CONTACT_STATUSES) {
      expect(s).not.toMatch(/paid|refund|pending/);
    }
  });
});

describe("更新 schema", () => {
  it("接受只改狀態", () => {
    expect(adminRegistrationUpdateSchema.safeParse({ contact_status: "contacted" }).success).toBe(true);
  });

  it("接受只改備註，空字串視為清空", () => {
    expect(adminRegistrationUpdateSchema.safeParse({ contact_note: "" }).success).toBe(true);
    expect(adminRegistrationUpdateSchema.safeParse({ contact_note: "9/11 已電聯" }).success).toBe(true);
  });

  it("兩個欄位都沒帶時要擋下來，不送出空的 update", () => {
    expect(adminRegistrationUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("不認得的狀態要擋", () => {
    expect(adminRegistrationUpdateSchema.safeParse({ contact_status: "paid" }).success).toBe(false);
  });

  it("不接受前端傳 contacted_at——那是稽核時間，必須由後端寫", () => {
    const parsed = adminRegistrationUpdateSchema.safeParse({
      contact_status: "contacted",
      contacted_at: "1999-01-01T00:00:00.000Z"
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "contacted_at" in parsed.data).toBe(false);
  });

  it("備註長度有上限，避免整篇文章塞進資料庫", () => {
    expect(adminRegistrationUpdateSchema.safeParse({ contact_note: "字".repeat(2001) }).success).toBe(false);
  });
});

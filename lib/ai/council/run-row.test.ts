import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMinimalRunRow } from "./run-row";

const row = buildMinimalRunRow({
  userId: "u", entitlementId: "e", usageLogId: null, finalLabel: "L", finalText: "T", finalOk: true,
  fallbackUsed: false, creditsCharged: 20, freeQuotaUsed: false, promptProfileId: null, question: "問題", topic: null
});

describe("精簡備援寫入列", () => {
  it("包含資料表所有 NOT NULL 且無預設值的欄位（讀 0004 migration 比對，不靠記憶）", () => {
    const sql = readFileSync(join(import.meta.dirname, "../../../supabase/migrations/0004_council_runs.sql"), "utf8");
    const body = sql.slice(sql.indexOf("create table public.council_runs"), sql.indexOf(");"));
    const required = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /not null/i.test(l) && !/default/i.test(l) && !/primary key/i.test(l))
      .map((l) => l.split(/\s+/)[0]);
    expect(required.length).toBeGreaterThan(0);
    for (const col of required) expect(row, col).toHaveProperty(col);
  });
  it("request 帶問題，主題缺值時補「未指定」", () => expect(row.request).toEqual({ question: "問題", topic: "未指定" }));
});

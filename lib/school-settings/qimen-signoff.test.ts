import { describe, expect, it } from "vitest";
import { evaluateSignoff, qimenSignatureText } from "./qimen-signoff";

const row = (o: Partial<{ approved: boolean; rule_version: string; signed_by: string; created_at: string }> = {}) => ({
  approved: true, rule_version: "r1", signed_by: "風羿老師", created_at: "2026-10-08T03:00:00Z", ...o
});

describe("evaluateSignoff", () => {
  it("沒有任何紀錄 → 未簽核", () => expect(evaluateSignoff(null, "r1").signed).toBe(false));
  it("最新一列通過且規則版本相同 → 已簽核", () => {
    const s = evaluateSignoff(row(), "r1");
    expect(s).toMatchObject({ signed: true, signedBy: "風羿老師", signedAt: "2026-10-08", latestRejected: false });
    expect(qimenSignatureText(s)).toBe("風羿老師　2026-10-08");
  });
  it("通過但規則版本已變 → 簽核失效，必須重新校對", () => {
    const s = evaluateSignoff(row({ rule_version: "r0" }), "r1");
    expect(s.signed).toBe(false);
    expect(qimenSignatureText(s)).toBe("");
  });
  it("最新一列是不通過 → 未簽核，且標記有待處理差異", () => {
    const s = evaluateSignoff(row({ approved: false }), "r1");
    expect(s).toMatchObject({ signed: false, latestRejected: true, signedBy: "" });
  });
});

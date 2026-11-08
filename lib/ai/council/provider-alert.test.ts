import { describe, expect, it, vi } from "vitest";
import type { ModelResult } from "./providers";

vi.mock("@/lib/notifications/admin-alerts", () => ({
  sendAdminAlert: vi.fn(async () => ({ ok: true, skipped: false }))
}));

import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { buildFailureAlert, detectProviderAlerts, notifyProviderFailures } from "./provider-alert";

function r(role: ModelResult["role"], ok: boolean, status: number | null = null, suffix = ""): ModelResult {
  return {
    role,
    label: (role === "geminiFengYi" ? "巽風策略推演分身" : role === "deepseekAttack" ? "巽風攻防反證分身" : "巽風主判讀分身") + suffix,
    ok,
    text: ok ? "x" : "",
    error: ok ? undefined : "Authentication Fails, Your api key: ****14c6 is invalid",
    status,
    tokensIn: 0,
    tokensOut: 0
  };
}

describe("detectProviderAlerts", () => {
  it("全部成功 → 不告警", () => {
    expect(detectProviderAlerts([r("openaiFengYi", true), r("geminiFengYi", true), r("deepseekAttack", true)])).toEqual([]);
  });

  it("單次 401 → 金鑰被拒告警（不必等第二輪）", () => {
    const t = detectProviderAlerts([r("openaiFengYi", true), r("geminiFengYi", true), r("deepseekAttack", false, 401)]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ role: "deepseekAttack", kind: "key_rejected", key: "deepseekAttack:key_rejected" });
  });

  it("400 也算金鑰／請求被拒", () => {
    expect(detectProviderAlerts([r("geminiFengYi", false, 400)])[0].kind).toBe("key_rejected");
  });

  it("同一家兩輪都逾時（無 status）→ 連續失敗告警", () => {
    const t = detectProviderAlerts([r("deepseekAttack", false, null), r("deepseekAttack", false, null, "｜修正")]);
    expect(t[0]).toMatchObject({ kind: "consecutive_failures" });
  });

  it("只有一輪逾時 → 不告警，避免偶發抖動狂叫", () => {
    expect(detectProviderAlerts([r("deepseekAttack", false, null), r("deepseekAttack", true, null, "｜修正")])).toEqual([]);
  });

  it("信件內容不含金鑰以外的敏感資訊，且帶報告連結", () => {
    const t = detectProviderAlerts([r("deepseekAttack", false, 401)]);
    const mail = buildFailureAlert(t, "run-1", new Date("2026-11-08T00:00:00Z"));
    expect(mail.subject).toContain("巽風攻防反證分身");
    expect(mail.text).toContain("/admin/council-runs/run-1");
    expect(mail.text).toContain("Redeploy");
  });
});

function fakeAdmin(recentKeys: string[]) {
  const inserted: unknown[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ gte: async () => ({ data: recentKeys.length ? [{ metadata: { keys: recentKeys } }] : [] }) }) }),
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      }
    })
  };
  return { admin: admin as never, inserted };
}

describe("notifyProviderFailures 冷卻", () => {
  it("第一次寄出並寫冷卻紀錄", async () => {
    vi.mocked(sendAdminAlert).mockClear();
    const { admin, inserted } = fakeAdmin([]);
    const out = await notifyProviderFailures(admin, [r("deepseekAttack", false, 401)], "run-1");
    expect(out.sent).toBe(true);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
  });

  it("冷卻內同一個 key 不重複寄", async () => {
    vi.mocked(sendAdminAlert).mockClear();
    const { admin } = fakeAdmin(["deepseekAttack:key_rejected"]);
    const out = await notifyProviderFailures(admin, [r("deepseekAttack", false, 401)], "run-2");
    expect(out).toMatchObject({ sent: false, reason: "cooldown" });
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });

  it("寄信失敗不進冷卻，下一份報告還會再試", async () => {
    vi.mocked(sendAdminAlert).mockResolvedValueOnce({ ok: false, skipped: true, reason: "missing_resend_config" } as never);
    const { admin, inserted } = fakeAdmin([]);
    const out = await notifyProviderFailures(admin, [r("geminiFengYi", false, 400)], "run-3");
    expect(out.sent).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

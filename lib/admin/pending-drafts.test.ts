import { describe, expect, it } from "vitest";
import { buildPendingDraftAlert, daysSince, selectStaleDrafts, type PendingDraft } from "./pending-drafts";

const NOW = new Date("2026-09-06T00:00:00Z").getTime();

function draft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    area: "排盤流派設定",
    page: "/admin/school-settings",
    versionLabel: "v1",
    updatedAt: "2026-08-10T01:29:29Z",
    usingDefaults: true,
    changes: ["晚子時日柱：進位到隔日 → 不進位，仍算當日"],
    ...overrides
  };
}

describe("daysSince", () => {
  it("算得出實際那份草稿放了幾天", () => {
    expect(daysSince("2026-08-10T01:29:29Z", NOW)).toBe(26);
  });

  it("時間壞掉回 0，不得產生 NaN 進到信件標題", () => {
    expect(daysSince("不是時間", NOW)).toBe(0);
  });
});

describe("selectStaleDrafts", () => {
  it("剛存的草稿不催——那還在編輯中", () => {
    expect(selectStaleDrafts([draft({ updatedAt: "2026-09-05T12:00:00Z" })], NOW, 3)).toEqual([]);
  });

  it("超過門檻就催", () => {
    expect(selectStaleDrafts([draft()], NOW, 3)).toHaveLength(1);
  });

  it("流派草稿與生效值相同、且已有發布版本時不催（無作用草稿）", () => {
    const noop = draft({ changes: [], usingDefaults: false });
    expect(selectStaleDrafts([noop], NOW, 3)).toEqual([]);
  });

  it("流派草稿沒有差異，但根本沒發布過版本時仍要催", () => {
    const noop = draft({ changes: [], usingDefaults: true });
    expect(selectStaleDrafts([noop], NOW, 3)).toHaveLength(1);
  });

  it("報告內容設定的草稿沒有逐項 diff，只要夠久就催", () => {
    const prompt = draft({ area: "報告內容設定", page: "/admin/prompt-settings", changes: [], usingDefaults: false });
    expect(selectStaleDrafts([prompt], NOW, 3)).toHaveLength(1);
  });
});

describe("buildPendingDraftAlert", () => {
  it("沒有該催的草稿時回 null，不寄空信", () => {
    expect(buildPendingDraftAlert([], NOW, 3, "https://www.xunfeng.tw")).toBeNull();
    expect(
      buildPendingDraftAlert([draft({ updatedAt: "2026-09-05T12:00:00Z" })], NOW, 3, "https://www.xunfeng.tw")
    ).toBeNull();
  });

  it("重現實際事故：信裡要寫出天數與那一行差異", () => {
    const alert = buildPendingDraftAlert([draft()], NOW, 3, "https://www.xunfeng.tw");
    expect(alert).not.toBeNull();
    expect(alert!.subject).toBe("【巽風】排盤流派設定有一份草稿已放 26 天未發布");
    expect(alert!.text).toContain("晚子時日柱：進位到隔日 → 不進位，仍算當日");
    expect(alert!.text).toContain("還沒有發布過任何版本，報告正在使用程式內建的預設值");
    expect(alert!.text).toContain("https://www.xunfeng.tw/admin/school-settings");
  });

  it("多份草稿時標題用份數與最久天數", () => {
    const alert = buildPendingDraftAlert(
      [
        draft(),
        draft({ area: "報告內容設定", page: "/admin/prompt-settings", updatedAt: "2026-09-01T00:00:00Z", changes: [] })
      ],
      NOW,
      3,
      "https://www.xunfeng.tw"
    );
    expect(alert!.subject).toBe("【巽風】有 2 份設定草稿未發布，最久已放 26 天");
    expect(alert!.drafts).toHaveLength(2);
  });

  it("信裡一定要說清楚草稿不影響報告——這正是當初沒有人察覺的原因", () => {
    const alert = buildPendingDraftAlert([draft()], NOW, 3, "https://www.xunfeng.tw");
    expect(alert!.text).toContain("草稿不影響任何報告");
  });
});

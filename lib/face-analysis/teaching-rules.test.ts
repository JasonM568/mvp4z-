import { afterEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from }) }));

const { loadPublishedTeachingRules, invalidateTeachingRuleCache, BUILT_IN_RULE_SET } = await import("@/lib/face-analysis/teaching-rules");
const { BUILT_IN_TEACHINGS } = await import("@/lib/face-analysis/teachings");

/** 模擬 supabase 的鏈式查詢，最後 await 時回傳 result。 */
function mockRows(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  from.mockReturnValue(chain);
}

const morphologyRow = {
  rule_id: "T_DB_TEST",
  kind: "morphology",
  target: "forehead",
  payload: { condition: { relativeWidth: ["wide"] } },
  member_text: "資料庫版的教材說法。",
  teacher_text: "資料庫版的教材原文。",
  themes: ["事業"],
  palaces: ["官祿宮"],
  flow_year_ages: [],
  safety_level: "standard",
  health_sensitive: false,
  source_pages: "測試出處",
  updated_at: "2026-08-19T10:00:00Z"
};

describe("判讀規則載入", () => {
  afterEach(() => {
    from.mockReset();
    invalidateTeachingRuleCache();
  });

  it("資料表不存在時回退程式碼內建規則，不讓報告失去教材依據", async () => {
    mockRows({ error: { code: "42P01" } });
    const result = await loadPublishedTeachingRules();
    expect(result).toBe(BUILT_IN_RULE_SET);
    expect(result.version).toBe("code-default");
  });

  it("沒有任何已發布規則時回退內建", async () => {
    mockRows({ data: [] });
    expect((await loadPublishedTeachingRules()).version).toBe("code-default");
  });

  it("有已發布規則時改用資料庫版本，並帶出可追溯的版本字串", async () => {
    mockRows({ data: [morphologyRow] });
    const result = await loadPublishedTeachingRules();
    expect(result.version).toContain("db:");
    expect(result.version).toContain("2026-08-19T10:00:00Z");
    expect(result.teachings).toHaveLength(1);
    expect(result.teachings[0]).toMatchObject({ id: "T_DB_TEST", feature: "forehead", memberText: "資料庫版的教材說法。" });
  });

  it("critical 分級的規則不進會員側規則集", async () => {
    mockRows({ data: [{ ...morphologyRow, rule_id: "T_CRITICAL", safety_level: "critical" }] });
    const result = await loadPublishedTeachingRules();
    // 形態條文全被濾掉時回退內建，而不是讓報告完全沒有教材依據。
    expect(result.teachings).toBe(BUILT_IN_TEACHINGS);
    expect(result.teachings.some((item) => item.id === "T_CRITICAL")).toBe(false);
  });

  it("high 分級仍可進會員報告", async () => {
    mockRows({ data: [{ ...morphologyRow, rule_id: "T_HIGH", safety_level: "high", health_sensitive: true }] });
    const result = await loadPublishedTeachingRules();
    expect(result.teachings.some((item) => item.id === "T_HIGH")).toBe(true);
  });

  it("條件格式不合法的規則被跳過，不會讓整批規則失效", async () => {
    mockRows({ data: [{ ...morphologyRow, rule_id: "T_BAD", payload: { condition: { contour: ["不存在的值"] } } }, morphologyRow] });
    const result = await loadPublishedTeachingRules();
    expect(result.teachings.map((item) => item.id)).toEqual(["T_DB_TEST"]);
  });

  it("指紋與斑痣以內建表為底，資料庫只覆寫有提供的項目", async () => {
    mockRows({
      data: [{
        rule_id: "FP_noseTip",
        kind: "fingerprint",
        target: "noseTip",
        payload: { partName: "準頭（老師改寫）", looksAt: "財帛", favorable: "豐隆為佳", unfavorable: "尖削不佳" },
        member_text: "",
        teacher_text: "",
        themes: [],
        palaces: ["財帛宮"],
        flow_year_ages: [48],
        safety_level: "standard",
        health_sensitive: false,
        source_pages: "老師改寫出處",
        updated_at: "2026-08-19T11:00:00Z"
      }]
    });
    const result = await loadPublishedTeachingRules();
    expect(result.fingerprints.noseTip.partName).toBe("準頭（老師改寫）");
    // 沒被覆寫的部位仍然查得到，避免 Vision 回傳時查不到表。
    expect(result.fingerprints.eyebrowShape.partName).toContain("眉");
    expect(Object.keys(result.fingerprints)).toHaveLength(16);
    expect(Object.keys(result.surfaces)).toHaveLength(14);
  });

  it("同一分鐘內重複載入會走快取，不重打資料庫", async () => {
    mockRows({ data: [morphologyRow] });
    await loadPublishedTeachingRules();
    const callsAfterFirst = from.mock.calls.length;
    await loadPublishedTeachingRules();
    expect(from.mock.calls.length).toBe(callsAfterFirst);
  });
});

// 回歸測試：老師的參考文件不可以被「有沒有發布設定版本」綁架。
//
// 曾經 buildDocumentBlock 只寫在「成功解析 published 設定」之後，
// 導致線上 ai_prompt_profiles 一筆 published 都沒有時，老師勾了 include_in_prompt
// 的文件一次都沒進過 prompt，而後台還顯示「已納入 N 字」。40 份報告都是這樣產的。

import { afterEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from }) }));

const { loadPromptSettings, invalidatePromptSettingsCache } = await import("./load");
const { DEFAULT_PROMPT_SETTINGS } = await import("./defaults");

type Result = { data?: unknown; error?: unknown };

/** 依 table 名分流：ai_prompt_profiles 走 maybeSingle，ai_documents 走 await 鏈。 */
function mockTables(tables: Record<string, Result | (() => never)>) {
  from.mockImplementation((table: string) => {
    const entry = tables[table];
    if (typeof entry === "function") entry();
    const result = (entry || { data: null }) as Result;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  });
}

const doc = { title: "綜合判讀規則", extracted_text: "老師的判讀原則。", char_count: 8 };

describe("報告設定載入", () => {
  afterEach(() => {
    from.mockReset();
    invalidatePromptSettingsCache();
  });

  it("沒有已發布設定版本時，仍要把老師勾選的文件帶進 prompt", async () => {
    mockTables({ ai_prompt_profiles: { data: null }, ai_documents: { data: [doc] } });
    const result = await loadPromptSettings(Date.now());

    expect(result.fallbackReason).toBe("no_published_profile");
    expect(result.settings).toBe(DEFAULT_PROMPT_SETTINGS);
    expect(result.documentBlock).toContain("綜合判讀規則");
    expect(result.documentBlock).toContain("老師的判讀原則。");
  });

  it("設定版本驗證失敗時也要保住文件", async () => {
    mockTables({
      ai_prompt_profiles: { data: { id: "p1", version_label: "v1", settings: { 壞掉: true } } },
      ai_documents: { data: [doc] }
    });
    const result = await loadPromptSettings(Date.now());

    expect(result.fallbackReason).toBe("invalid_settings");
    expect(result.documentBlock).toContain("綜合判讀規則");
  });

  it("文件查詢失敗只讓 documentBlock 變空字串，不讓報告產不出來", async () => {
    mockTables({
      ai_prompt_profiles: { data: null },
      ai_documents: () => {
        throw new Error("network down");
      }
    });
    const result = await loadPromptSettings(Date.now());

    expect(result.documentBlock).toBe("");
    expect(result.settings).toBe(DEFAULT_PROMPT_SETTINGS);
  });

  it("沒有任何勾選文件時為空字串", async () => {
    mockTables({ ai_prompt_profiles: { data: null }, ai_documents: { data: [] } });
    expect((await loadPromptSettings(Date.now())).documentBlock).toBe("");
  });
});

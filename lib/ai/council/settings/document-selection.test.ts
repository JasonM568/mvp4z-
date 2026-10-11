import { describe, expect, it } from "vitest";
import { selectTeacherDocuments, type TeacherDocument } from "./document-selection";

function doc(id: string, text: string, term: string | null = null): TeacherDocument {
  return { id, title: id, term, extracted_text: text, char_count: text.length };
}

describe("老師文件按需取用", () => {
  it("文件量未超過單份預算時全部保留", () => {
    const selected = selectTeacherDocuments(
      [doc("規則 A", "第一條。"), doc("規則 B", "第二條。")],
      { question: "怎麼判斷？" }
    );
    expect(selected.references).toHaveLength(2);
    expect(selected.block).toContain("第一條。");
    expect(selected.block).toContain("第二條。");
  });

  it("大檔案尾端的相關段落也能被選到，不只讀檔案開頭", () => {
    const text = Array.from({ length: 30 }, (_, i) =>
      i === 29 ? "奇門資金風險：先查現金流。" : `一般規則第 ${i} 段。` + "無關內容".repeat(150)
    ).join("\n\n");
    const selected = selectTeacherDocuments(
      [doc("長篇規則", text)],
      { question: "奇門資金風險如何判斷？" },
      2000
    );
    expect(selected.block).toContain("奇門資金風險");
    expect(selected.block.replace(/\s+/g, "").length).toBeLessThanOrEqual(2000);
    expect(selected.references.some((reference) => reference.chunk > 1)).toBe(true);
  });

  it("超額時優先選啟用術數的段落並記來源", () => {
    const selected = selectTeacherDocuments(
      [doc("八字", "八字".repeat(900), "bazi"), doc("奇門", "奇門".repeat(900), "qimen")],
      { question: "如何判讀？", yixue: { modules: { qimen: true } } },
      2100
    );
    expect(selected.references[0].id).toBe("奇門");
    expect(selected.block.replace(/\s+/g, "").length).toBeLessThanOrEqual(2100);
  });

  it("Markdown 空白不佔後台字數預算，原始長度仍有防護", () => {
    const text = Array.from({ length: 15 }, () => "判讀規則 ".repeat(350)).join("\n\n");
    const selected = selectTeacherDocuments([doc("長講義", text)], { question: "判讀規則？" });
    expect(selected.references.length).toBe(selected.availableChunks);
    expect(selected.block.replace(/\s+/g, "").length).toBeLessThanOrEqual(24000);
    expect(selected.block.length).toBeLessThanOrEqual(32000);
  });
});

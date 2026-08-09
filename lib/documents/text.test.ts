import { describe, expect, it } from "vitest";
import { countChars, decodeTextFile, hasAllowedExtension, normalizeText } from "./text";

describe("document text helpers", () => {
  it("只接受 txt 與 md，且副檔名不分大小寫", () => {
    expect(hasAllowedExtension("老師筆記.TXT")).toBe(true);
    expect(hasAllowedExtension("規則.md")).toBe(true);
    expect(hasAllowedExtension("教材.pdf")).toBe(false);
  });

  it("移除 UTF-8 BOM、零寬字元並整理空行", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("甲\u200b乙")]);
    const decoded = decodeTextFile(bytes);
    expect(decoded).toEqual({ text: "甲\u200b乙", encoding: "utf-8" });
    expect(normalizeText(`${decoded.text}\r\n\r\n\r\n丙`)).toBe("甲乙\n\n丙");
  });

  it("能辨識常見 Big5 中文位元組", () => {
    const decoded = decodeTextFile(new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5]));
    expect(decoded.encoding).toBe("big5");
    expect(decoded.text).toBe("中文");
  });

  it("中文以字、空白不計入字數", () => {
    expect(countChars("甲 乙\nABC")).toBe(5);
  });
});

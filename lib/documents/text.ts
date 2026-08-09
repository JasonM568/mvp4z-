// 巽風｜文字檔讀取與編碼處理
//
// 為什麼需要編碼偵測：台灣的純文字檔很常是 Big5（舊系統匯出、記事本另存），
// 直接當 UTF-8 解會整份變亂碼，而且不會報錯——老師會上傳完看到一堆問號，
// 卻不知道問題出在哪。

/** 允許的副檔名。先只做純文字，PDF／Word 之後再加。 */
export const ALLOWED_EXTENSIONS = [".txt", ".md"];

/** 單檔大小上限。純文字 2MB 約等於 100 萬字，遠超實際需求，只是防呆。 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * 把上傳的位元組解成文字，自動判斷 UTF-8 或 Big5。
 *
 * 判斷方式：先用嚴格模式試 UTF-8，失敗代表不是合法 UTF-8，改用 Big5。
 * 這比看替換字元可靠——合法 UTF-8 一定解得開，Big5 中文位元組序列
 * 幾乎不可能剛好是合法 UTF-8。
 */
export function decodeTextFile(bytes: Uint8Array): { text: string; encoding: "utf-8" | "big5" | "unknown" } {
  // BOM 開頭一定是 UTF-8，直接處理掉並去除 BOM 字元
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    // 不是合法 UTF-8
  }

  try {
    const text = new TextDecoder("big5").decode(bytes);
    return { text, encoding: "big5" };
  } catch {
    // Node 若未內建 big5（非 full-icu 版本）會走到這裡
  }

  // 兩種都不行就寬容解 UTF-8，讓使用者至少看得到部分內容並自行判斷
  return { text: new TextDecoder("utf-8").decode(bytes), encoding: "unknown" };
}

/** 計算字數。中文以字為單位，英數以詞為單位比較貼近實際 token 消耗。 */
export function countChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * 清掉零寬字元與過多空行。
 *
 * 這些字元從 Word 或網頁複製貼上時很常見，看不見卻會佔 token，
 * 也會讓字數統計失準。用 \u escape 寫是為了讓人讀得出來刪掉的是什麼。
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

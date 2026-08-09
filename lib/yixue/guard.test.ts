// 巽風易學排盤引擎｜架構護欄
//
// 這些不是功能測試，是防止日後有人不小心破壞引擎的前提條件。
// 每一條都對應一個真實會出事的情境。

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * 移除註解後再掃描。否則「無 Date.now()」這種說明文字會被誤判成違規，
 * 讓護欄自己抓自己——第一版就踩到了。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("架構護欄", () => {
  it("只有 calendar/tyme.ts 可以 import tyme4ts", () => {
    // 換掉曆法套件的成本必須鎖在單一檔案。散出去就再也換不掉了。
    const offenders = walk(join(ROOT, "lib"))
      .concat(walk(join(ROOT, "app")), walk(join(ROOT, "components")))
      .filter((f) => /from\s+["']tyme4ts["']/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== join("lib", "yixue", "calendar", "tyme.ts"));

    expect(offenders).toEqual([]);
  });

  it("前端不得 value-import 會牽連 tyme4ts 的 lib/yixue 模組", () => {
    // tyme4ts 約 296KB。真正要防的是它被拖進瀏覽器 bundle。
    //
    // 這些葉子模組沒有任何 tyme4ts 相依（純常數／純型別），前端拿來用是安全的，
    // 例如表單的出生地下拉就直接用 geo/places 的縣市表，避免兩邊各維護一份會漂移。
    const SAFE_LEAF_MODULES = ["@/lib/yixue/geo", "@/lib/yixue/types"];

    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "app")).concat(walk(join(ROOT, "components")))) {
      // API route 是 server-only，不會進瀏覽器 bundle，排盤引擎本來就該在那裡用。
      if (file.includes(`${sep}api${sep}`)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/import\s+(type\s+)?([^;]*?)from\s+["'](@\/lib\/yixue[^"']*)["']/g)) {
        const isTypeOnly = Boolean(m[1]) || /^\s*\{\s*type\s/.test(m[2]);
        const isSafeLeaf = SAFE_LEAF_MODULES.some((p) => m[3].startsWith(p));
        if (!isTypeOnly && !isSafeLeaf) offenders.push(`${relative(ROOT, file)}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("被列為安全的葉子模組確實不牽連 tyme4ts", () => {
    // 上一條的白名單只有在這些檔真的沒有 tyme4ts 相依時才成立。
    // 這條防止日後有人在 geo/ 裡加了 import 卻忘了白名單的前提已經不成立。
    for (const dir of ["geo"]) {
      for (const file of walk(join(ROOT, "lib", "yixue", dir))) {
        const src = stripComments(readFileSync(file, "utf8"));
        expect(src, relative(ROOT, file)).not.toMatch(/from\s+["'][^"']*tyme[^"']*["']/);
      }
    }
  });

  it("lib/yixue 不得使用 Date.now() / new Date() / process.env", () => {
    // 引擎必須是純函式，否則 golden test 無法逐欄位比對，
    // 且同一份生辰在不同時間排出不同的盤——那就沒有可驗收性可言。
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "lib", "yixue"))) {
      if (file.endsWith(".test.ts")) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const pattern of [/Date\.now\(\)/, /new Date\(/, /process\.env/, /Math\.random\(\)/]) {
        if (pattern.test(src)) offenders.push(`${relative(ROOT, file)}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("禁止寫入 tyme4ts 的 mutable static provider", () => {
    // LunarHour.provider / ChildLimit.provider 是全域可變狀態（spike 實測 writable=true）。
    // 在 Next.js server 並發下寫入它們會讓另一支請求拿到錯的盤。
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "lib")).concat(walk(join(ROOT, "app")))) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (/(LunarHour|ChildLimit)\s*\.\s*provider\s*=/.test(src)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

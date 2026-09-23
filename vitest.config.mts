import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = import.meta.dirname;

// 跑 lib/ 與 app/ 底下的單元測試。
// app/ 一度不在範圍內，結果前端那些「錯誤要怎麼分類」的規則無處可鎖——
// 例如「連線斷了不可以清掉進行中紀錄」，講得再清楚也沒有東西擋得住下次改壞。
// scripts/*.mjs 那些是會打網路、會真的扣點的 E2E，性質不同，不納入。
export default defineConfig({
  resolve: {
    alias: { "@": resolve(rootDir, ".") }
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node"
  }
});

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = import.meta.dirname;

// 只跑 lib/yixue 的排盤單元測試。
// scripts/*.mjs 那些是會打網路、會真的扣點的 E2E，性質不同，不納入。
export default defineConfig({
  resolve: {
    alias: { "@": resolve(rootDir, ".") }
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node"
  }
});

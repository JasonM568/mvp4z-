import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

export default defineConfig({
  resolve: { alias: { "@": rootDir } },
  test: { include: ["scripts/qa-c2-admin-credits-boundaries.test.ts"], environment: "node" }
});

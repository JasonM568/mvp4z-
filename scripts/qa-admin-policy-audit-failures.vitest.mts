import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

export default defineConfig({
  resolve: { alias: { "@": rootDir } },
  test: {
    include: ["scripts/qa-admin-policy-audit-failures.test.ts"],
    environment: "node"
  }
});

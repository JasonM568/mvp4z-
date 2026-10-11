import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const testRoot = resolve(process.env.QA_FORGOT_PASSWORD_ROOT || rootDir);

export default defineConfig({
  resolve: { alias: { "@": testRoot } },
  test: { include: ["scripts/qa-forgot-password-boundaries.test.ts"], environment: "node" }
});

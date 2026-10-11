import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const candidate = process.env.QA_C23_CANDIDATE_ROOT || "/private/tmp/xunfeng-m24-c20-c23";

export default defineConfig({
  resolve: { alias: { "@c23": resolve(candidate), "@": resolve(candidate) } },
  test: { include: ["scripts/qa-c23-provider-row-failure-retry.test.ts"], environment: "node" }
});

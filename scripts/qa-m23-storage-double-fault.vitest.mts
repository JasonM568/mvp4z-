import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const candidate = process.env.QA_M23_CANDIDATE_ROOT || "/private/tmp/xunfeng-face-release-m22";

export default defineConfig({
  resolve: { alias: { "@candidate": resolve(candidate), "@": resolve(candidate) } },
  test: { include: ["scripts/qa-m23-storage-double-fault.test.ts"], environment: "node" }
});

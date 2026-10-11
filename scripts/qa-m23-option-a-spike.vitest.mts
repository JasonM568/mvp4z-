import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const spike = process.env.QA_M23_SPIKE_ROOT || "/private/tmp/xunfeng-m23-spike";

export default defineConfig({
  resolve: { alias: { "@spike": resolve(spike), "@": resolve(spike) } },
  test: { include: ["scripts/qa-m23-option-a-spike.test.ts"], environment: "node" }
});

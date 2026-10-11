import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const candidateRoot = process.env.QA_M24_ROOT || "/private/tmp/xunfeng-m24-face-image-delete-recovery";

export default defineConfig({
  resolve: { alias: { "@": candidateRoot, "@m24": candidateRoot } },
  test: {
    include: ["scripts/qa-m24-image-delete-recovery.test.ts"],
    environment: "node",
    root: rootDir
  }
});

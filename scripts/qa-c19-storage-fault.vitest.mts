import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "..") } },
  test: {
    include: ["scripts/qa-c19-storage-fault.test.ts"],
    environment: "node"
  }
});

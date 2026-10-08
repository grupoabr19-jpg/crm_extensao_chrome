import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: {
    "@abr/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
    "@abr/domain": path.resolve(__dirname, "packages/domain/src/index.ts"),
  } },
  test: { include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "tools/*/test/**/*.test.ts"] },
});

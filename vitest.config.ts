import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Component tests can opt into a DOM per file with `// @vitest-environment jsdom`.
    environment: "node",
    setupFiles: ["tests/unit/setup.ts"],
    restoreMocks: true,
  },
});

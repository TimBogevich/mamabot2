import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Allow CommonJS modules to be tested
    globals: false,
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Enable globals for jest-like API (describe, it, expect, vi, etc.)
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
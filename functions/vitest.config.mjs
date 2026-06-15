import { defineConfig } from "vitest/config";

// Ensure FIRESTORE_EMULATOR_HOST is available to all test workers.
// When set externally (CI, npm script), preserve the external value.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
}

export default defineConfig({
  test: {
    // Enable globals for jest-like API (describe, it, expect, vi, etc.)
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js", "test/rules/**/*.test.js", "scripts/**/*.test.js"],
    // Run test files sequentially to avoid Firestore emulator cross-contamination
    // between test files that write to the same collections.
    fileParallelism: false,
  },
});
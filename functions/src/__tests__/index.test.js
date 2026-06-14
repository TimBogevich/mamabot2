/**
 * Tests for Telegram token resolution and webhook behavior.
 *
 * The Telegram token is resolved at module load time inside telegram.js.
 * These tests verify the resolution priority:
 *   1. functions.config().telegram?.token (primary)
 *   2. process.env.TELEGRAM_TOKEN (development fallback)
 *   3. Throws if neither is set
 *
 * Because the module is CommonJS and its exports are populated at load time,
 * we use dynamic import() with vi.resetModules() between test cases to
 * re-evaluate the module with fresh env/config state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

const TEST_TOKEN = "test:resolved-token-12345";
const TELEGRAM_API_URL = "https://api.telegram.org";

// Create a require function scoped to the test file context
const req = createRequire(import.meta.url);

/**
 * Mock firebase-functions directly in the require cache before
 * the telegram module is loaded. This works with CJS modules
 * where vi.mock factory hoisting can cause issues with per-test
 * return values.
 */
function injectFirebaseMock(configValue) {
  const fbPath = req.resolve("firebase-functions");
  req.cache[fbPath] = {
    id: fbPath,
    filename: fbPath,
    loaded: true,
    exports: {
      config: () => configValue,
    },
  };
}

/** Clear the entire require cache and remove any vi module registry. */
function cleanSlate() {
  delete process.env.TELEGRAM_TOKEN;

  // Clear the telegram module from cache so it re-evaluates
  try {
    const tgPath = req.resolve("../utils/telegram.js");
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }
  try {
    const tgPath = req.resolve("../../src/utils/telegram.js");
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }

  // Clear firebase-functions from cache so injectFirebaseMock can replace it
  try {
    const fbPath = req.resolve("firebase-functions");
    delete req.cache[fbPath];
  } catch { /* not cached yet */ }

  // Also let vitest clear its module registry
  vi.resetModules();
}

function unmockFirebase() {
  try {
    const fbPath = req.resolve("firebase-functions");
    delete req.cache[fbPath];
  } catch { /* not cached yet */ }
}

describe("TELEGRAM_API constant", () => {
  beforeEach(() => {
    cleanSlate();
    injectFirebaseMock({});
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_TOKEN;
    unmockFirebase();
  });

  it("remains the standard Telegram API URL (https://api.telegram.org)", async () => {
    const mod = await import("../utils/telegram.js");
    expect(mod.TELEGRAM_API).toBe(TELEGRAM_API_URL);
  });
});

describe("TELEGRAM_TOKEN resolution", () => {
  beforeEach(() => {
    cleanSlate();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_TOKEN;
    unmockFirebase();
  });

  it("uses env var when functions.config() has no telegram config", async () => {
    injectFirebaseMock({});
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;

    const mod = await import("../utils/telegram.js");
    expect(mod.TELEGRAM_TOKEN).toBe(TEST_TOKEN);
  });

  it("uses Firebase config when env var is not set", async () => {
    injectFirebaseMock({ telegram: { token: TEST_TOKEN } });
    delete process.env.TELEGRAM_TOKEN;

    const mod = await import("../utils/telegram.js");
    expect(mod.TELEGRAM_TOKEN).toBe(TEST_TOKEN);
  });

  it("gives priority to Firebase config over env var when both are set", async () => {
    injectFirebaseMock({ telegram: { token: "firebase-config-token" } });
    process.env.TELEGRAM_TOKEN = "env-var-token";

    const mod = await import("../utils/telegram.js");
    expect(mod.TELEGRAM_TOKEN).toBe("firebase-config-token");
  });

  it("throws a clear error when neither source provides a token", async () => {
    injectFirebaseMock({});
    delete process.env.TELEGRAM_TOKEN;

    await expect(import("../utils/telegram.js")).rejects.toThrow(
      "TELEGRAM_TOKEN not configured"
    );
  });
});
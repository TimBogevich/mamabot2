/**
 * Tests for Telegram token resolution and webhook behavior.
 *
 * The Telegram token is resolved lazily via getTelegramToken() from process.env.TELEGRAM_TOKEN.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

const TEST_TOKEN = "test:resolved-token-12345";
const TELEGRAM_API_URL = "https://api.telegram.org";

const req = createRequire(import.meta.url);

function cleanSlate() {
  delete process.env.TELEGRAM_TOKEN;

  try {
    const tgPath = req.resolve("../utils/telegram.js");
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }
  try {
    const tgPath = req.resolve("../../src/utils/telegram.js");
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }

  vi.resetModules();
}

describe("TELEGRAM_API constant", () => {
  beforeEach(() => {
    cleanSlate();
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_TOKEN;
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
  });

  it("uses TELEGRAM_TOKEN env var when set", async () => {
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;

    const mod = await import("../utils/telegram.js");
    expect(mod.getTelegramToken()).toBe(TEST_TOKEN);
  });

  it("throws a clear error when TELEGRAM_TOKEN is not set", async () => {
    delete process.env.TELEGRAM_TOKEN;

    const mod = await import("../utils/telegram.js");
    expect(() => mod.getTelegramToken()).toThrow(
      "TELEGRAM_TOKEN not configured"
    );
  });
});
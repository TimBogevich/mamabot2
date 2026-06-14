/**
 * Tests for shared Telegram utility module.
 *
 * Uses require.cache injection to mock firebase-functions because
 * vi.mock does not reliably intercept CJS require() calls within
 * the telegram module in this vitest environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

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

function clearTelegramCache() {
  // Clear the telegram module from require cache so it re-evaluates
  for (const key of Object.keys(req.cache)) {
    if (key.includes("telegram.js")) {
      delete req.cache[key];
    }
  }
}

function clearFirebaseCache() {
  try {
    const fbPath = req.resolve("firebase-functions");
    delete req.cache[fbPath];
  } catch { /* not cached yet */ }
}

// Inject mock before any module load
injectFirebaseMock({ telegram: { token: "test:mock-telegram-token" } });

const { TELEGRAM_API, TELEGRAM_TOKEN, sendMessage } = req("../../utils/telegram");

const originalFetch = globalThis.fetch;

describe("sendMessage", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls the correct Telegram API URL with chat_id and text", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await sendMessage(12345, "Hello");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${TELEGRAM_API}/bot${TELEGRAM_TOKEN}/sendMessage`);
    expect(JSON.parse(opts.body)).toEqual({
      chat_id: 12345,
      text: "Hello",
    });
  });

  it("includes reply_markup when provided in options", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const keyboard = { inline_keyboard: [[{ text: "Button", callback_data: "data" }]] };
    await sendMessage(12345, "Pick one", { reply_markup: keyboard });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      chat_id: 12345,
      text: "Pick one",
      reply_markup: keyboard,
    });
  });

  it("includes parse_mode when provided in options", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await sendMessage(12345, "Hello", { parse_mode: "MarkdownV2" });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      chat_id: 12345,
      text: "Hello",
      parse_mode: "MarkdownV2",
    });
  });

  it("throws on non-OK Telegram API response", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"description":"Bad Request"}',
    });

    await expect(sendMessage(12345, "Hello")).rejects.toThrow(
      'Telegram API error: 400 {"description":"Bad Request"}',
    );
  });
});
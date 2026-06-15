/**
 * Tests for shared Telegram utility module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

function clearTelegramCache() {
  for (const key of Object.keys(req.cache)) {
    if (key.includes("telegram.js")) {
      delete req.cache[key];
    }
  }
}

process.env.TELEGRAM_TOKEN = "test:mock-telegram-token";

const { TELEGRAM_API, getTelegramToken, sendMessage, answerCallbackQuery } = req("../../utils/telegram");

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
    expect(url).toBe(`${TELEGRAM_API}/bot${getTelegramToken()}/sendMessage`);
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

describe("answerCallbackQuery", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("makes POST request to correct URL with callback_query_id", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await answerCallbackQuery("cb_123");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${TELEGRAM_API}/bot${getTelegramToken()}/answerCallbackQuery`);
    expect(JSON.parse(opts.body)).toEqual({
      callback_query_id: "cb_123",
    });
  });

  it("includes text and show_alert when provided in options", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await answerCallbackQuery("cb_456", { text: "Done!", show_alert: true });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      callback_query_id: "cb_456",
      text: "Done!",
      show_alert: true,
    });
  });

  it("does NOT throw on non-OK response, returns parsed JSON", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
      json: async () => ({ ok: false, error_code: 400, description: "Bad Request" }),
    });

    const result = await answerCallbackQuery("cb_789");

    expect(result).toEqual({ ok: false, error_code: 400, description: "Bad Request" });
  });

  it("returns graceful error object on network failure (fetch rejected)", async () => {
    globalThis.fetch.mockRejectedValue(new Error("Network failure"));

    const result = await answerCallbackQuery("cb_000");

    expect(result).toEqual({ ok: false, error: "Network failure" });
  });
});
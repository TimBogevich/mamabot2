/**
 * Tests for shared Telegram utility module.
 */

const { TELEGRAM_API, TELEGRAM_TOKEN, sendMessage } = require("../../utils/telegram");

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
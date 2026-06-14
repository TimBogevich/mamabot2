/**
 * Shared Telegram API utility module.
 *
 * Provides a reusable sendMessage function for all command and callback handlers.
 * Exports the Telegram API base URL and bot token for use across the application.
 *
 * @module telegram
 */

const functions = require("firebase-functions");

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_TOKEN = functions.config().telegram?.token || process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  throw new Error(
    "TELEGRAM_TOKEN not configured. Set via firebase functions:config:set telegram.token or TELEGRAM_TOKEN env var."
  );
}

/**
 * Send a message to a Telegram chat.
 *
 * @param {number|string} chatId - Telegram chat ID to send the message to.
 * @param {string} text - The message text to send.
 * @param {Object} [options] - Optional parameters.
 * @param {Object} [options.reply_markup] - Inline keyboard or other reply markup.
 * @param {string} [options.parse_mode] - Parse mode for message formatting (e.g. "HTML", "MarkdownV2").
 * @returns {Promise<Object>} The Telegram API response JSON.
 * @throws {Error} If the Telegram API returns a non-OK status.
 */
async function sendMessage(chatId, text, options = {}) {
  const url = `${TELEGRAM_API}/bot${TELEGRAM_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
  };

  if (options.reply_markup) {
    body.reply_markup = options.reply_markup;
  }
  if (options.parse_mode) {
    body.parse_mode = options.parse_mode;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${err}`);
  }

  return response.json();
}

module.exports = { TELEGRAM_API, TELEGRAM_TOKEN, sendMessage };
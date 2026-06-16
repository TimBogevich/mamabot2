/**
 * Shared Telegram API utility module.
 *
 * Provides a reusable sendMessage function for all command and callback handlers.
 * Exports the Telegram API base URL and bot token for use across the application.
 *
 * @module telegram
 */

const TELEGRAM_API = "https://api.telegram.org";

let _telegramToken = null;

function getTelegramToken() {
  if (_telegramToken) return _telegramToken;
  _telegramToken = process.env.TELEGRAM_TOKEN;
  if (!_telegramToken) {
    throw new Error(
      "TELEGRAM_TOKEN not configured. Set via firebase functions:secrets:set TELEGRAM_TOKEN or TELEGRAM_TOKEN env var."
    );
  }
  return _telegramToken;
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
  const url = `${TELEGRAM_API}/bot${getTelegramToken()}/sendMessage`;
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

/**
 * Answer a Telegram callback query to stop the spinning clock indicator.
 *
 * Every callback_query MUST be answered within 30 seconds. Call this
 * immediately upon receiving a callback_query, before processing.
 *
 * Unlike sendMessage, this function does NOT throw on non-OK responses —
 * it logs a warning and returns the response body. This prevents callback
 * routing from being disrupted by a failed answerCallbackQuery.
 *
 * @param {string} callbackQueryId - The callback_query.id from the update
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.text] - Notification text shown to the user (max 200 chars)
 * @param {boolean} [options.show_alert] - Show as alert (true) or toast (false, default)
 * @returns {Promise<Object>} The Telegram API response JSON
 * @see https://core.telegram.org/bots/api#answercallbackquery
 */
async function answerCallbackQuery(callbackQueryId, options = {}) {
  const url = `${TELEGRAM_API}/bot${getTelegramToken()}/answerCallbackQuery`;
  const body = {
    callback_query_id: callbackQueryId,
    ...options,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn('[telegram] answerCallbackQuery non-OK:', response.status, err);
      return response.json();
    }

    return response.json();
  } catch (err) {
    // Graceful degradation — don't throw, log and return error payload
    console.warn('[telegram] answerCallbackQuery network error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Register bot commands for the slash menu.
 *
 * Call this after setWebhook to populate the command list shown when users type `/`.
 *
 * @param {Array<{command: string, description: string}>} commands - Array of command objects
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.scope] - BotCommandScope for filtering
 * @param {string} [options.language_code] - ISO 639-1 language code for localized commands
 * @returns {Promise<Object>} The Telegram API response JSON
 * @see https://core.telegram.org/bots/api#setmycommands
 */
async function setMyCommands(commands, options = {}) {
  const url = `${TELEGRAM_API}/bot${getTelegramToken()}/setMyCommands`;
  const body = { commands, ...options };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API setMyCommands error: ${response.status} ${err}`);
  }

  return response.json();
}

/**
 * Delete all registered bot commands.
 *
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.scope] - BotCommandScope for filtering
 * @param {string} [options.language_code] - ISO 639-1 language code
 * @returns {Promise<Object>} The Telegram API response JSON
 * @see https://core.telegram.org/bots/api#deletemycommands
 */
async function deleteMyCommands(options = {}) {
  const url = `${TELEGRAM_API}/bot${getTelegramToken()}/deleteMyCommands`;
  const body = { ...options };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API deleteMyCommands error: ${response.status} ${err}`);
  }

  return response.json();
}

module.exports = { TELEGRAM_API, getTelegramToken, sendMessage, answerCallbackQuery, setMyCommands, deleteMyCommands };
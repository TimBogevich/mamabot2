/**
 * @fileoverview Заглушка раздела «Моя неделя» MamaBot.
 *
 * Показывает сообщение о том, что раздел в разработке, и возвращает
 * пользователя в главное меню.
 *
 * @module weekMenu
 */

const { t } = require('../../i18n');
const { sendMessage } = require('../../utils/telegram');

// ---------------------------------------------------------------------------
// Безопасная загрузка showMainMenu из FN-027
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showMainMenu = null;
try {
  _showMainMenu = require('../menu/mainMenu').showMainMenu;
} catch (_err) {
  // FN-027 ещё не смержен
}

// ---------------------------------------------------------------------------
// Внутренние ссылки на зависимости (мутабельные для __inject)
// ---------------------------------------------------------------------------

/** @type {typeof t} */
let _t = t;

/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

// ---------------------------------------------------------------------------
// Публичное API
// ---------------------------------------------------------------------------

/**
 * Показывает заглушку раздела «Моя неделя» и возвращает в главное меню.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Результат
 */
async function showWeekPlaceholder(chatId) {
  const msg = await _t(chatId, 'week.coming_soon');
  await _sendMessage(chatId, msg);

  if (_showMainMenu) {
    await _showMainMenu(chatId);
  }

  return { status: 'week_placeholder' };
}

// ---------------------------------------------------------------------------
// Хук тестируемости
// ---------------------------------------------------------------------------

/**
 * @param {Object} deps
 * @param {Function} [deps.t]
 * @param {Function} [deps.sendMessage]
 * @param {Function|null} [deps.showMainMenu]
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.showMainMenu !== undefined) _showMainMenu = deps.showMainMenu;
}

module.exports = { showWeekPlaceholder, __inject };

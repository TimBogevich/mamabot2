/**
 * @fileoverview Модуль рендеринга главного меню MamaBot.
 *
 * Экспортирует функцию showMainMenu(chatId), которая отправляет в Telegram-чат
 * сообщение с главным меню: 4 кнопки в 2 ряда с локализованными подписями.
 *
 * Кнопки и соответствующие callback_data:
 *   - «Моя неделя»  → menu_my_week
 *   - «Дневник настроения» → menu_mood_diary
 *   - «Питание»     → menu_nutrition
 *   - «Настройки»   → menu_settings
 *
 * Используется на финальном шаге онбординга и при повторном /start после FN-024.
 *
 * @module mainMenu
 */

const { t } = require('../../i18n');
const { sendMessage } = require('../../utils/telegram');

// ---------------------------------------------------------------------------
// Internal dependency references (mutable for testability via __inject)
// ---------------------------------------------------------------------------

/** @type {typeof t} */
let _t = t;

/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Вспомогательная async-функция для выполнения тела showMainMenu после
 * синхронной валидации chatId.
 *
 * @param {number|string} chatId - Telegram chat ID (гарантированно не null/undefined)
 * @returns {Promise<Object>} Результат вызова _sendMessage
 */
async function _showMainMenuImpl(chatId) {
  // Заголовок сообщения
  const headerText = await _t(chatId, 'menu.my_week');

  // Подписи кнопок
  const myWeekLabel = await _t(chatId, 'menu.my_week');
  const moodDiaryLabel = await _t(chatId, 'menu.mood_diary');
  const nutritionLabel = await _t(chatId, 'menu.nutrition');
  const settingsLabel = await _t(chatId, 'menu.settings');

  // Inline-клавиатура: 2 ряда по 2 кнопки
  const keyboard = {
    inline_keyboard: [
      [
        { text: myWeekLabel, callback_data: 'menu_my_week' },
        { text: moodDiaryLabel, callback_data: 'menu_mood_diary' },
      ],
      [
        { text: nutritionLabel, callback_data: 'menu_nutrition' },
        { text: settingsLabel, callback_data: 'menu_settings' },
      ],
    ],
  };

  return await _sendMessage(chatId, headerText, { reply_markup: keyboard });
}

/**
 * Отправляет в Telegram-чат сообщение с главным меню MamaBot.
 *
 * Формирует inline-клавиатуру из 2 рядов по 2 кнопки с локализованными
 * подписями, полученными через t(). Все строки (заголовок и подписи кнопок)
 * берутся из i18n-ключей menu.*.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Результат вызова sendMessage (ответ Telegram API)
 * @throws {Error} Синхронно, если chatId не передан (null или undefined)
 *
 * @example
 *   const { showMainMenu } = require('./handlers/menu/mainMenu');
 *   await showMainMenu(12345);
 */
function showMainMenu(chatId) {
  // Синхронная валидация — выбрасывается ДО возврата Promise,
  // что позволяет catch снаружи без await
  if (chatId === null || chatId === undefined) {
    throw new Error('chatId is required');
  }

  return _showMainMenuImpl(chatId);
}

// ---------------------------------------------------------------------------
// Testability hook
// ---------------------------------------------------------------------------

/**
 * Injects mock dependencies for testing.
 *
 * Позволяет подменить t() и sendMessage() мок-функциями без необходимости
 * мокирования на уровне модуля (аналогично паттерну __inject в i18n.js).
 *
 * @param {{ t?: Function, sendMessage?: Function }} deps - Mock dependencies
 * @returns {void}
 *
 * @example
 *   const { showMainMenu, __inject } = require('./mainMenu');
 *   __inject({ t: mockT, sendMessage: mockSendMessage });
 *
 * @private
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
}

module.exports = { showMainMenu, __inject };
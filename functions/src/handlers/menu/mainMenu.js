/**
 * @fileoverview Модуль рендеринга главного меню MamaBot.
 *
 * Экспортирует функцию showMainMenu(chatId), которая отправляет в Telegram-чат
 * два сообщения:
 *   1. inline-кнопка «📋 Главное меню» (callback_data="menu_show")
 *   2. reply-клавиатура 3×2 с разделами бота под полем ввода
 *
 * reply_markup с inline_keyboard и keyboard mutually exclusive в Telegram API,
 * поэтому используются два отдельных вызова sendMessage.
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
 * @returns {Promise<Object>} Результат вызова _sendMessage для inline-сообщения
 */
async function _showMainMenuImpl(chatId) {
  // Заголовок сообщения
  const headerText = await _t(chatId, 'menu.my_week');

  // Подписи для inline-кнопки
  const showButtonLabel = await _t(chatId, 'menu.show_button');

  // Подписи для reply-кнопок
  const myWeekLabel = await _t(chatId, 'menu.my_week');
  const moodDiaryLabel = await _t(chatId, 'menu.mood_diary');
  const nutritionLabel = await _t(chatId, 'menu.nutrition');
  const invitePartnerLabel = await _t(chatId, 'menu.invite_partner');
  const settingsLabel = await _t(chatId, 'menu.settings');
  const helpLabel = await _t(chatId, 'menu.help');

  // Placeholder для reply-клавиатуры
  const placeholder = await _t(chatId, 'menu.placeholder');

  // 1. Сообщение с inline-кнопкой «📋 Главное меню»
  const inlineResult = await _sendMessage(chatId, headerText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: showButtonLabel, callback_data: 'menu_show' },
        ],
      ],
    },
  });

  // 2. Сообщение с reply-клавиатурой 3×2 под полем ввода
  await _sendMessage(chatId, headerText, {
    reply_markup: {
      keyboard: [
        [
          { text: myWeekLabel },
          { text: moodDiaryLabel },
        ],
        [
          { text: nutritionLabel },
          { text: invitePartnerLabel },
        ],
        [
          { text: settingsLabel },
          { text: helpLabel },
        ],
      ],
      resize_keyboard: true,
      input_field_placeholder: placeholder,
    },
  });

  // Возвращаем результат inline-сообщения для обратной совместимости
  return inlineResult;
}

/**
 * Отправляет в Telegram-чат главное меню MamaBot.
 *
 * Формирует:
 *   - inline-сообщение с одной кнопкой «📋 Главное меню» (callback_data = menu_show)
 *   - reply-клавиатуру 3×2 для постоянного доступа к разделам под полем ввода
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Результат вызова sendMessage для inline-сообщения
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
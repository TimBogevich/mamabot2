/**
 * @fileoverview Подменю настроек MamaBot.
 *
 * Экспортирует две функции:
 *   - showSettingsMenu(chatId) — показывает подменю настроек с inline-клавиатурой
 *   - handleSettingsCallback(chatId, callbackData) — диспетчер callback-запросов домена settings
 *
 * Подменю содержит три действия:
 *   1. Смена языка (ru ↔ en) с немедленным обновлением Firestore и перерисовкой меню
 *   2. Просмотр даты LMP (читается из Firestore)
 *   3. Сброс всех данных (двухэтапное подтверждение)
 *
 * Кнопка «Назад» возвращает в главное меню через showMainMenu (FN-027).
 *
 * @module settingsMenu
 */

const { t, setLanguage } = require('../../i18n');
const { getUser } = require('../../collections/users');
const { sendMessage } = require('../../utils/telegram');
const { db } = require('../../firestore');
const { FieldValue } = require('firebase-admin/firestore');

// ---------------------------------------------------------------------------
// Безопасная загрузка showMainMenu из FN-027
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showMainMenu = null;
try {
  _showMainMenu = require('../menu/mainMenu').showMainMenu;
} catch (_err) {
  // FN-027 ещё не смержен — кнопка «Назад» не будет показывать главное меню
}

// ---------------------------------------------------------------------------
// Внутренние ссылки на зависимости (мутабельные для __inject)
// ---------------------------------------------------------------------------

/** @type {typeof t} */
let _t = t;

/** @type {typeof setLanguage} */
let _setLanguage = setLanguage;

/** @type {typeof getUser} */
let _getUser = getUser;

/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

/** @type {typeof db} */
let _db = db;

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/**
 * Форматирует ISO-дату (YYYY-MM-DD) в формат DD.MM.YYYY.
 *
 * @param {string} isoDate - ISO-дата в формате YYYY-MM-DD
 * @returns {string} Дата в формате DD.MM.YYYY
 *
 * @example
 *   formatLmpDate('2026-03-15') // '15.03.2026'
 */
function formatLmpDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

// ---------------------------------------------------------------------------
// Внутренние async-функции (для тестирования через __inject)
// ---------------------------------------------------------------------------

/**
 * @param {number|string} chatId - Telegram chat ID (гарантированно валидный)
 * @returns {Promise<Object>}
 */
async function _showSettingsMenuImpl(chatId) {
  const titleText = await _t(chatId, 'settings.title');
  const changeLanguageLabel = await _t(chatId, 'settings.change_language');
  const viewLmpLabel = await _t(chatId, 'settings.view_lmp');
  const resetDataLabel = await _t(chatId, 'settings.reset_data');
  const backLabel = await _t(chatId, 'menu.back');

  const keyboard = {
    inline_keyboard: [
      [
        { text: changeLanguageLabel, callback_data: 'settings_change_language' },
        { text: viewLmpLabel, callback_data: 'settings_view_lmp' },
      ],
      [
        { text: resetDataLabel, callback_data: 'settings_reset_data' },
      ],
      [
        { text: backLabel, callback_data: 'settings_back' },
      ],
    ],
  };

  return await _sendMessage(chatId, titleText, { reply_markup: keyboard });
}

/**
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string, from?: string, to?: string}>}
 */
async function _handleLanguageChangeImpl(chatId) {
  const user = await _getUser(chatId);
  const currentLang = user?.language === 'en' ? 'en' : 'ru';
  const newLang = currentLang === 'ru' ? 'en' : 'ru';

  await _setLanguage(chatId, newLang);

  await _sendMessage(chatId, await _t(chatId, 'settings.language_changed'));
  await _showSettingsMenuImpl(chatId);

  return { status: 'language_changed', from: currentLang, to: newLang };
}

/**
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string, lmpDate?: string}>}
 */
async function _handleViewLmpImpl(chatId) {
  const user = await _getUser(chatId);

  if (!user?.lmpDate) {
    await _sendMessage(chatId, await _t(chatId, 'settings.lmp_not_set'));
    await _showSettingsMenuImpl(chatId);
    return { status: 'lmp_not_set' };
  }

  const formattedDate = formatLmpDate(user.lmpDate);
  await _sendMessage(chatId, await _t(chatId, 'settings.lmp_date_display', { date: formattedDate }));
  await _showSettingsMenuImpl(chatId);

  return { status: 'lmp_shown', lmpDate: user.lmpDate };
}

/**
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string}>}
 */
async function _handleResetDataImpl(chatId) {
  const resetConfirmText = await _t(chatId, 'settings.reset_confirm');
  const resetYesLabel = await _t(chatId, 'settings.reset_yes');
  const resetNoLabel = await _t(chatId, 'settings.reset_no');

  const keyboard = {
    inline_keyboard: [
      [
        { text: resetYesLabel, callback_data: 'settings_confirm_reset' },
        { text: resetNoLabel, callback_data: 'settings_cancel_reset' },
      ],
    ],
  };

  await _sendMessage(chatId, resetConfirmText, { reply_markup: keyboard });
  return { status: 'reset_confirmation_shown' };
}

/**
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string, error?: string}>}
 */
async function _handleConfirmResetImpl(chatId) {
  try {
    const batch = _db.batch();
    const userDocRef = _db.collection('users').doc(String(chatId));

    // Сброс полей пользователя (не удаляем language, firstName, role и т.д.)
    batch.update(userDocRef, {
      lmpDate: null,
      currentWeek: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Удаление всех mood_logs пользователя
    const moodSnapshot = await _db.collection('mood_logs')
      .where('userId', '==', String(chatId))
      .get();
    moodSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Удаление всех nutrition_logs пользователя
    const nutritionSnapshot = await _db.collection('nutrition_logs')
      .where('userId', '==', String(chatId))
      .get();
    nutritionSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    await _sendMessage(chatId, await _t(chatId, 'settings.data_reset_done'));

    if (_showMainMenu) {
      await _showMainMenu(chatId);
    }

    return { status: 'data_reset_done' };
  } catch (err) {
    await _sendMessage(chatId, await _t(chatId, 'error.generic'));
    return { status: 'reset_failed', error: err.message };
  }
}

/**
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string}>}
 */
async function _handleBackToMenuImpl(chatId) {
  if (_showMainMenu) {
    await _showMainMenu(chatId);
    return { status: 'back_to_menu' };
  }

  await _sendMessage(chatId, await _t(chatId, 'menu.back'));
  return { status: 'back_unavailable' };
}

// ---------------------------------------------------------------------------
// Публичное API
// ---------------------------------------------------------------------------

/**
 * Отправляет в Telegram-чат сообщение с подменю настроек.
 *
 * Формирует inline-клавиатуру из 3 рядов:
 *   Ряд 1: [🌍 Сменить язык] [📅 Моя дата ПМ]
 *   Ряд 2: [🗑️ Сбросить все данные]
 *   Ряд 3: [🔙 Назад]
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Результат вызова sendMessage
 * @throws {Error} Синхронно, если chatId не передан (null или undefined)
 *
 * @example
 *   const { showSettingsMenu } = require('./settings/settingsMenu');
 *   await showSettingsMenu(12345);
 */
function showSettingsMenu(chatId) {
  if (chatId === null || chatId === undefined) {
    throw new Error('chatId is required');
  }

  return _showSettingsMenuImpl(chatId);
}

/**
 * Главный диспетчер callback-запросов домена settings.
 *
 * Определяет действие по callback_data и делегирует соответствующему
 * внутреннему обработчику:
 *   - settings_change_language → смена языка
 *   - settings_view_lmp → просмотр даты LMP
 *   - settings_reset_data → запрос подтверждения сброса
 *   - settings_confirm_reset → выполнение сброса
 *   - settings_cancel_reset → отмена сброса (возврат в меню)
 *   - settings_back → возврат в главное меню
 *   - неизвестный → возврат в меню настроек
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} callbackData - Полный callback_data от кнопки
 * @returns {Promise<Object>} Объект результата { status: string, ... }
 * @throws {Error} Синхронно, если chatId не передан (null или undefined)
 *
 * @example
 *   const { handleSettingsCallback } = require('./settings/settingsMenu');
 *   await handleSettingsCallback(12345, 'settings_change_language');
 */
async function handleSettingsCallback(chatId, callbackData) {
  if (chatId === null || chatId === undefined) {
    throw new Error('chatId is required');
  }

  switch (callbackData) {
    case 'settings_change_language':
      return _handleLanguageChangeImpl(chatId);
    case 'settings_view_lmp':
      return _handleViewLmpImpl(chatId);
    case 'settings_reset_data':
      return _handleResetDataImpl(chatId);
    case 'settings_confirm_reset':
      return _handleConfirmResetImpl(chatId);
    case 'settings_cancel_reset':
      return showSettingsMenu(chatId);
    case 'settings_back':
      return _handleBackToMenuImpl(chatId);
    default:
      return showSettingsMenu(chatId);
  }
}

// ---------------------------------------------------------------------------
// Хук тестируемости
// ---------------------------------------------------------------------------

/**
 * Внедряет mock-зависимости для тестирования.
 *
 * Позволяет подменить t(), setLanguage(), getUser(), updateUser(),
 * sendMessage(), db() и showMainMenu() мок-функциями.
 *
 * @param {Object} deps - Mock-зависимости
 * @param {Function} [deps.t] - Mock t()
 * @param {Function} [deps.setLanguage] - Mock setLanguage()
 * @param {Function} [deps.getUser] - Mock getUser()
 * @param {Function} [deps.sendMessage] - Mock sendMessage()
 * @param {Object} [deps.db] - Mock Firestore db
 * @param {Function|null} [deps.showMainMenu] - Mock showMainMenu (null для симуляции отсутствия FN-027)
 * @returns {void}
 *
 * @example
 *   const { showSettingsMenu, handleSettingsCallback, __inject } = require('./settings/settingsMenu');
 *   __inject({ t: mockT, sendMessage: mockSendMessage, getUser: mockGetUser });
 *
 * @private
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.setLanguage) _setLanguage = deps.setLanguage;
  if (deps.getUser) _getUser = deps.getUser;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.db) _db = deps.db;
  if (deps.showMainMenu !== undefined) _showMainMenu = deps.showMainMenu;
}

module.exports = { showSettingsMenu, handleSettingsCallback, __inject };

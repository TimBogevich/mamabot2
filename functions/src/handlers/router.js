/**
 * @fileoverview Центральный callback-роутер MamaBot.
 *
 * Единственная точка входа для всех callback_query от inline-кнопок Telegram.
 * Определяет домен-обработчик по callback_data: точное совпадение (lang_ru, lang_en)
 * или префикс (menu_*, onboarding_*, settings_*, week_*, mood_*, nutrition_*).
 *
 * @module router
 */

const { t } = require('../i18n');
const { sendMessage, answerCallbackQuery } = require('../utils/telegram');

// ---------------------------------------------------------------------------
// Безопасная загрузка зависимых обработчиков (graceful degradation)
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showMainMenu = null;
try {
  _showMainMenu = require('./menu/mainMenu').showMainMenu;
} catch (_err) {
  // FN-027 ещё не смержен — роутер будет работать без возврата в меню
}

/** @type {((chatId: number|string, callbackData: string, userInfo: Object) => Promise<Object>)|null} */
let _handleLanguageChoice = null;
try {
  _handleLanguageChoice = require('./onboarding/languageDialog').handleLanguageChoice;
} catch (_err) {
  // FN-024 ещё не смержен — lang_ru/lang_en будут обработаны как unknown
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _handleConfirmEdd = null;
try {
  _handleConfirmEdd = require('./onboarding/confirmEdd').handleConfirmEdd;
} catch (_err) {
  // FN-006 ещё не смержен — onboarding_confirm_edd будет обработан как not-implemented
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _handleEditEdd = null;
try {
  _handleEditEdd = require('./onboarding/editEdd').handleEditEdd;
} catch (_err) {
  // FN-007 ещё не смержен — onboarding_edit_edd будет обработан как not-implemented
}

// ---------------------------------------------------------------------------
// Внутренние ссылки на зависимости (мутабельные для тестирования)
// ---------------------------------------------------------------------------

/** @type {typeof t} */
let _t = t;

/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

/** @type {typeof answerCallbackQuery} */
let _answerCallbackQuery = answerCallbackQuery;

// ---------------------------------------------------------------------------
// Таблица маршрутизации
// ---------------------------------------------------------------------------

/**
 * Route table — maps prefix or exact callback_data → domain handler name.
 *
 * Priority: exact match first, then prefix match (only for keys ending with '_').
 *
 * @type {Record<string, string>}
 */
const ROUTES = {
  // Exact matches — legacy callbacks без префиксной конвенции (FN-024)
  'lang_ru': 'onboarding',
  'lang_en': 'onboarding',

  // Prefix matches — callback_data вида "prefix_suffix"
  'onboarding_': 'onboarding',
  'menu_': 'menu',
  'settings_': 'settings',
  'week_': 'week',
  'mood_': 'mood',
  'nutrition_': 'nutrition',
};

// ---------------------------------------------------------------------------
// Определение домена
// ---------------------------------------------------------------------------

/**
 * Resolves a domain name from callback_data.
 *
 * @param {string} callbackData - The callback_data string from the inline button
 * @returns {string|null} Domain name (e.g. 'menu', 'onboarding') or null if unmatched
 */
function resolveDomain(callbackData) {
  // 1. Exact match
  if (ROUTES[callbackData]) {
    return ROUTES[callbackData];
  }

  // 2. Prefix match — iterate ROUTES, check keys ending with '_'
  for (const [key, domain] of Object.entries(ROUTES)) {
    if (key.endsWith('_') && callbackData.startsWith(key)) {
      return domain;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Обработчики доменов
// ---------------------------------------------------------------------------

/**
 * Обработчик домена 'onboarding'.
 * Делегирует callback'и lang_ru/lang_en в handleLanguageChoice (FN-024).
 * Делегирует onboarding_confirm_edd в handleConfirmEdd (FN-006).
 * Будущие onboarding_* callback'и также попадают сюда.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} callbackData - The callback_data string
 * @param {Object} context - Callback context
 * @returns {Promise<Object>} Result object
 */
async function handleOnboarding(chatId, callbackData, context) {
  if (_handleLanguageChoice && (callbackData === 'lang_ru' || callbackData === 'lang_en')) {
    const from = (context && context.from) ? context.from : {};
    const userInfo = {
      userId: String(from.id || chatId),
      firstName: from.first_name || '',
      lastName: from.last_name || '',
      username: from.username || '',
    };
    return _handleLanguageChoice(chatId, callbackData, userInfo);
  }

  if (callbackData === 'onboarding_confirm_edd') {
    if (_handleConfirmEdd) {
      return _handleConfirmEdd(chatId);
    }
    return handleNotImplemented(chatId, callbackData);
  }

  if (callbackData === 'onboarding_edit_edd') {
    if (_handleEditEdd) {
      return _handleEditEdd(chatId);
    }
    return handleNotImplemented(chatId, callbackData);
  }

  // Для будущих onboarding_* callback'ов или при отсутствии FN-024
  return handleNotImplemented(chatId, callbackData);
}

/**
 * Обработчик домена 'menu'.
 * Пока все menu_* callback'и — placeholder (подменю ещё не реализованы).
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} callbackData - The callback_data string
 * @returns {Promise<Object>} Result object
 */
async function handleMenu(chatId, callbackData) {
  // В будущем: диспатч по полному callback_data (menu_my_week, menu_mood_diary, ...)
  // Пока — возвращаем not-implemented
  return handleNotImplemented(chatId, callbackData);
}

/**
 * Placeholder для ещё не реализованных доменов.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} callbackData - The callback_data string
 * @returns {Promise<Object>} Result with status 'not_implemented'
 */
async function handleNotImplemented(chatId, callbackData) {
  const errorMsg = await _t(chatId, 'error.unknown_callback');
  await _sendMessage(chatId, errorMsg);

  if (_showMainMenu) {
    await _showMainMenu(chatId);
  }

  return { status: 'not_implemented', domain: resolveDomain(callbackData), callbackData };
}

// ---------------------------------------------------------------------------
// Главная экспортируемая функция
// ---------------------------------------------------------------------------

/**
 * Routes a Telegram callback query to the appropriate handler.
 *
 * Call this from the webhook handler (index.js) for every callback_query update.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} callbackData - The callback_data string from the inline button
 * @param {Object} context - Callback context
 * @param {string} context.callbackQueryId - ID из callback_query (для answerCallbackQuery)
 * @param {Object} context.from - Объект user из callback_query.from
 * @returns {Promise<Object>} Result object with at least { status: string }
 *
 * @example
 *   const result = await routeCallback(chatId, callbackData, {
 *     callbackQueryId: update.callback_query.id,
 *     from: update.callback_query.from,
 *   });
 */
async function routeCallback(chatId, callbackData, context) {
  // 1. Ответить на callback_query — обязательно, иначе Telegram показывает часики
  if (context && context.callbackQueryId) {
    try {
      await _answerCallbackQuery(context.callbackQueryId);
    } catch (_err) {
      // Не роняем роутинг при ошибке answerCallbackQuery
      console.warn('[router] answerCallbackQuery failed:', _err.message);
    }
  }

  // 2. Валидация callbackData
  if (!callbackData || typeof callbackData !== 'string') {
    return handleUnknownCallback(chatId);
  }

  // 3. Определить домен
  const domain = resolveDomain(callbackData);

  // 4. Нормализация context — защита от undefined/null
  const safeContext = context || {};

  // 5. Диспатч
  switch (domain) {
    case 'onboarding':
      return handleOnboarding(chatId, callbackData, safeContext);
    case 'menu':
      return handleMenu(chatId, callbackData);
    case 'settings':
    case 'week':
    case 'mood':
    case 'nutrition':
      return handleNotImplemented(chatId, callbackData);
    default:
      return handleUnknownCallback(chatId);
  }
}

/**
 * Обработчик неизвестного callback_data.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Result with status 'unknown_callback'
 */
async function handleUnknownCallback(chatId) {
  const errorMsg = await _t(chatId, 'error.unknown_callback');
  await _sendMessage(chatId, errorMsg);

  if (_showMainMenu) {
    await _showMainMenu(chatId);
  }

  return { status: 'unknown_callback' };
}

// ---------------------------------------------------------------------------
// Testability hook
// ---------------------------------------------------------------------------

/**
 * Injects mock dependencies for testing.
 *
 * Позволяет подменить t(), sendMessage(), answerCallbackQuery(),
 * showMainMenu() и handleLanguageChoice() мок-функциями.
 *
 * @param {Object} deps - Mock dependencies
 * @param {Function} [deps.t] - Mock t() function
 * @param {Function} [deps.sendMessage] - Mock sendMessage
 * @param {Function} [deps.answerCallbackQuery] - Mock answerCallbackQuery
 * @param {Function|null} [deps.showMainMenu] - Mock showMainMenu (or null to simulate FN-027 missing)
 * @param {Function|null} [deps.handleLanguageChoice] - Mock handleLanguageChoice (or null to simulate FN-024 missing)
 * @param {Function|null} [deps.handleConfirmEdd] - Mock handleConfirmEdd (or null to simulate FN-006 missing)
 * @returns {void}
 *
 * @example
 *   const { routeCallback, __inject } = require('./router');
 *   __inject({ t: mockT, sendMessage: mockSendMessage, answerCallbackQuery: mockAnswerCallbackQuery });
 *
 * @private
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.answerCallbackQuery) _answerCallbackQuery = deps.answerCallbackQuery;
  if (deps.showMainMenu !== undefined) _showMainMenu = deps.showMainMenu;
  if (deps.handleLanguageChoice !== undefined) _handleLanguageChoice = deps.handleLanguageChoice;
  if (deps.handleConfirmEdd !== undefined) _handleConfirmEdd = deps.handleConfirmEdd;
  if (deps.handleEditEdd !== undefined) _handleEditEdd = deps.handleEditEdd;
}

module.exports = { routeCallback, __inject };

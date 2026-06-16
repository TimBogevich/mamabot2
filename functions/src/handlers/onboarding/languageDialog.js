/**
 * @fileoverview Language selection dialog handler for MamaBot onboarding.
 *
 * Provides two dialog handler functions:
 *   - askLanguage(chatId) — Called when a user sends /start. Checks if the
 *     user has a language preference in Firestore. If not, sends a localized
 *     prompt with an inline keyboard offering language selection. If yes,
 *     sends the "already registered" message.
 *   - handleLanguageChoice(chatId, callbackData, userInfo) — Called when the
 *     user clicks a language button. Persists the language choice to Firestore
 *     (creating the user document if needed) and sends a confirmation message.
 *
 * Usage:
 *   const { askLanguage, handleLanguageChoice } = require('./languageDialog');
 *   await askLanguage(chatId);
 *   await handleLanguageChoice(chatId, 'lang_ru', { userId, firstName });
 *
 * @module languageDialog
 */

const { t, setLanguage } = require('../../i18n');
const { getUser, createUser } = require('../../collections/users');
const { sendMessage } = require('../../utils/telegram');

// Lazy-load askForLmpDate to avoid circular references
/** @type {((chatId: number|string) => Promise<void>)|null} */
let _askForLmpDate = null;
try {
  _askForLmpDate = require('./lmpDialog').askForLmpDate;
} catch (_err) {
  // FN-??? lmpDialog not merged yet — onboarding will not prompt for LMP
}

// ---------------------------------------------------------------------------
// Internal dependency references (mutable for testability)
// ---------------------------------------------------------------------------

/** @type {typeof getUser} */
let _getUser = getUser;
/** @type {typeof createUser} */
let _createUser = createUser;
/** @type {typeof t} */
let _t = t;
/** @type {typeof setLanguage} */
let _setLanguage = setLanguage;
/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

// ---------------------------------------------------------------------------
// Dialog handlers
// ---------------------------------------------------------------------------

/**
 * Initiates the language selection dialog for a chat.
 *
 * Checks whether the user has a language preference in Firestore:
 *   - If user exists and has a truthy `language` field → sends the
 *     "already registered" skip message and returns `{ status: 'already_registered' }`
 *   - If user does not exist or has no `language` field → sends a localized
 *     prompt with inline keyboard (Русский / English buttons) and returns
 *     `{ status: 'language_prompted' }`
 *
 * @param {number} chatId - Telegram chat ID
 * @returns {Promise<{status: string, message?: string}>} Result object
 *
 * @example
 *   const result = await askLanguage(12345);
 *   // result → { status: 'language_prompted' }
 */
async function askLanguage(chatId) {
  try {
    // Check if user exists and has a language
    const user = await _getUser(chatId);

    if (user && user.language) {
      // Returning user — skip language selection
      const text = await _t(chatId, 'onboarding.already_registered');
      await _sendMessage(chatId, text);
      return { status: 'already_registered' };
    }

    // New or incomplete user — prompt for language
    const promptText = await _t(chatId, 'onboarding.choose_language');
    const ruLabel = await _t(chatId, 'onboarding.language_ru');
    const enLabel = await _t(chatId, 'onboarding.language_en');

    /** @type {{ inline_keyboard: Array<Array<{text: string, callback_data: string}>> }} */
    const keyboard = {
      inline_keyboard: [
        [{ text: ruLabel, callback_data: 'lang_ru' }],
        [{ text: enLabel, callback_data: 'lang_en' }],
      ],
    };

    await _sendMessage(chatId, promptText, { reply_markup: keyboard });
    return { status: 'language_prompted' };
  } catch (err) {
    console.error('[languageDialog] Error in askLanguage:', err.message);
    return { status: 'error', message: err.message };
  }
}

/**
 * Handles a user's language choice from an inline keyboard callback.
 *
 * Determines the language from the callback data, persists it to Firestore
 * (creating the user document on first interaction or updating the language
 * for returning users), and sends a localized confirmation message.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {string} callbackData - Callback data string ('lang_ru' or 'lang_en')
 * @param {{ userId: string, firstName: string, lastName?: string, username?: string }} userInfo - User info from Telegram callback query
 * @returns {Promise<{status: string, language?: string, message?: string}>} Result object
 *
 * @example
 *   const result = await handleLanguageChoice(12345, 'lang_ru', {
 *     userId: '456',
 *     firstName: 'Анна',
 *   });
 *   // result → { status: 'language_set', language: 'ru' }
 */
async function handleLanguageChoice(chatId, callbackData, userInfo) {
  // Validate callback data
  if (callbackData !== 'lang_ru' && callbackData !== 'lang_en') {
    return { status: 'error', message: 'Unknown language callback' };
  }

  const lang = callbackData === 'lang_ru' ? 'ru' : 'en';

  try {
    // Check if user document exists
    const user = await _getUser(chatId);
    let isNewUser = false;

    if (user) {
      // Returning user — update language via setLanguage
      await _setLanguage(chatId, lang);
    } else {
      // First interaction — create user document
      await _createUser(chatId, {
        userId: userInfo.userId,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName || '',
        username: userInfo.username || '',
        language: lang,
        role: 'mom',
      });
      isNewUser = true;
    }

    // Send confirmation
    const langName = lang === 'ru' ? 'Русский' : 'English';
    const confirmText = await _t(chatId, 'onboarding.language_saved', { lang: langName });
    await _sendMessage(chatId, confirmText);

    // For new users, continue onboarding: ask for LMP date
    if (isNewUser && _askForLmpDate) {
      await _askForLmpDate(chatId);
    }

    return { status: 'language_set', language: lang };
  } catch (err) {
    console.error('[languageDialog] Error in handleLanguageChoice:', err.message);
    return { status: 'error', message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Testability hook
// ---------------------------------------------------------------------------

/**
 * Injects mock dependencies for testing.
 *
 * Pass an object with optional function overrides to replace the default
 * Firestore-backed implementations with mocks.
 *
 * @param {{ getUser?: Function, createUser?: Function, updateUser?: Function, t?: Function, setLanguage?: Function, sendMessage?: Function }} deps - Mock dependencies
 * @returns {void}
 *
 * @example
 *   const { handleLanguageChoice, __inject } = require('./languageDialog');
 *   __inject({ getUser: mockGetUser, createUser: mockCreateUser, t: mockT });
 *
 * @private
 */
function __inject(deps) {
  if (deps.getUser) _getUser = deps.getUser;
  if (deps.createUser) _createUser = deps.createUser;

  if (deps.t) _t = deps.t;
  if (deps.setLanguage) _setLanguage = deps.setLanguage;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.askForLmpDate !== undefined) _askForLmpDate = deps.askForLmpDate;
}

module.exports = { askLanguage, handleLanguageChoice, __inject };
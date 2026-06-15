/**
 * @fileoverview EDD edit dialog handler for MamaBot onboarding.
 *
 * Handles the "onboarding_edit_edd" callback — when the user clicks
 * "✏️ Исправить" / "✏️ Edit" after seeing the auto-calculated EDD.
 *
 * The handler sets onboardingState to 'awaiting_edd', prompting the user
 * to enter an EDD date in DD.MM.YYYY format. The input is validated against
 * the user's stored lmpDate: the EDD must be on or after the LMP date and
 * no more than 300 days after it.
 *
 * On success, eddDate is persisted to Firestore, onboardingState is cleared,
 * and the main menu is shown (completing the onboarding flow).
 *
 * Exported functions:
 *   - handleEditEdd(chatId)         — Entry point from callback router (async)
 *   - handleEditEddInput(chatId, text) — Text input handler (async)
 *   - validateEddDate(text, lmpDateString) — EDD validation (pure, sync)
 *   - formatEdd(isoDate)            — ISO → DD.MM.YYYY formatter (pure, sync)
 *   - __inject(deps)                — Testability hook (private)
 *
 * @module editEdd
 */

// ---------------------------------------------------------------------------
// Lazy module references
// ---------------------------------------------------------------------------

/** @type {Function|null} */
let _getUser = null;

/** @type {Function|null} */
let _updateUser = null;

/** @type {Function|null} */
let _t = null;

/** @type {Function|null} */
let _sendMessage = null;

/**
 * Lazy reference to showMainMenu, resolved via try/catch to support graceful
 * degradation when FN-027 (main menu module) is not yet merged.
 *
 * @type {Function|null}
 */
let _showMainMenu = null;
try {
  _showMainMenu = require('../menu/mainMenu').showMainMenu;
} catch (_err) {
  // FN-027 ещё не смержен — меню не будет показано, но обработчик не упадёт
}

// ---------------------------------------------------------------------------
// Lazy getters
// ---------------------------------------------------------------------------

function getT() {
  if (!_t) _t = require('../../i18n').t;
  return _t;
}

function getSendMessage() {
  if (!_sendMessage) _sendMessage = require('../../utils/telegram').sendMessage;
  return _sendMessage;
}

function getGetUser() {
  if (!_getUser) _getUser = require('../../collections/users').getUser;
  return _getUser;
}

function getUpdateUser() {
  if (!_updateUser) _updateUser = require('../../collections/users').updateUser;
  return _updateUser;
}

// ---------------------------------------------------------------------------
// Helpers & constants
// ---------------------------------------------------------------------------

/**
 * Strict DD.MM.YYYY format regex.
 * Requires exactly two digits for day and month, four digits for year.
 */
const DD_MM_YYYY_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/**
 * Number of milliseconds in a day.
 * @type {number}
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Maximum number of days from LMP to EDD.
 * @type {number}
 */
const MAX_EDD_DAYS = 300;

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) to DD.MM.YYYY display format.
 *
 * Pure function with no external dependencies.
 *
 * @param {string} isoDate - ISO date string, e.g. "2026-12-25"
 * @returns {string} Formatted date string, e.g. "25.12.2026"
 *
 * @example
 *   formatEdd('2026-12-25') // returns '25.12.2026'
 *   formatEdd('2026-01-01') // returns '01.01.2026'
 */
function formatEdd(isoDate) {
  const parts = isoDate.split('-');
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  return `${day}.${month}.${year}`;
}

/**
 * Validates a DD.MM.YYYY EDD date string against the user's LMP date.
 *
 * Validation rules (in order):
 * 1. Must match strict DD.MM.YYYY format
 * 2. Day 1–31, month 1–12, year ≥ 2020 and ≤ current year + 3
 * 3. Must be a real calendar date (UTC constructor guard)
 * 4. Must NOT be before LMP (eddDate >= lmpDate at midnight UTC)
 * 5. Must NOT be after LMP + 300 days (eddDate <= lmpDate + 300 days)
 *
 * Pure function with no external dependencies.
 *
 * @param {string} text - The user's input string (DD.MM.YYYY)
 * @param {string} lmpDateString - ISO date string of the user's LMP
 * @returns {{ valid: boolean, error?: string, isoDate?: string }}
 *
 * @example
 *   validateEddDate('25.12.2026', '2026-03-15')
 *   // { valid: true, isoDate: '2026-12-25' }
 *
 *   validateEddDate('01.01.2020', '2026-03-15')
 *   // { valid: false, error: 'onboarding.edd_before_lmp' }
 *
 *   validateEddDate('hello', '2026-03-15')
 *   // { valid: false, error: 'onboarding.edd_invalid_format' }
 */
function validateEddDate(text, lmpDateString) {
  // Step 1: Check strict DD.MM.YYYY format
  if (typeof text !== 'string') {
    return { valid: false, error: 'onboarding.edd_invalid_format' };
  }

  const match = text.match(DD_MM_YYYY_RE);
  if (!match) {
    return { valid: false, error: 'onboarding.edd_invalid_format' };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Step 2: Validate ranges
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { valid: false, error: 'onboarding.edd_invalid_format' };
  }

  // Year must be >= 2020 and <= current year + 3
  const currentYear = new Date().getUTCFullYear();
  if (year < 2020 || year > currentYear + 3) {
    return { valid: false, error: 'onboarding.edd_invalid_format' };
  }

  // Step 3: Validate it's a real calendar date
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return { valid: false, error: 'onboarding.edd_invalid_format' };
  }

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Parse LMP date
  const lmpDate = new Date(lmpDateString + 'T00:00:00Z');
  const lmpTime = lmpDate.getTime();

  // Step 4: Must NOT be before LMP
  if (date.getTime() < lmpTime) {
    return { valid: false, error: 'onboarding.edd_before_lmp' };
  }

  // Step 5: Must NOT be after LMP + 300 days
  const maxEddTime = lmpTime + MAX_EDD_DAYS * MS_PER_DAY;
  if (date.getTime() > maxEddTime) {
    return { valid: false, error: 'onboarding.edd_too_late' };
  }

  return { valid: true, isoDate };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handles the "onboarding_edit_edd" callback.
 *
 * Reads the user from Firestore, validates lmpDate exists, sets
 * onboardingState to 'awaiting_edd', and sends the EDD prompt.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string, message?: string}>}
 *
 * @example
 *   const result = await handleEditEdd(12345);
 *   // { status: 'edd_prompted' }
 */
async function handleEditEdd(chatId) {
  try {
    // Step 1: Read user from Firestore
    const getUser = getGetUser();
    const user = await getUser(chatId);

    // Step 2: Validate user has lmpDate
    if (!user || !user.lmpDate) {
      const t = getT();
      const sendMessage = getSendMessage();
      const errorText = await t(chatId, 'error.session_expired');
      await sendMessage(chatId, errorText);

      if (_showMainMenu) {
        await _showMainMenu(chatId);
      }

      return { status: 'error', message: 'no_lmp_date' };
    }

    // Step 3: Set onboarding state to await EDD input
    const updateUser = getUpdateUser();
    await updateUser(chatId, { onboardingState: 'awaiting_edd' });

    // Step 4: Send EDD prompt
    const t = getT();
    const sendMessage = getSendMessage();
    const promptText = await t(chatId, 'onboarding.edd_prompt');
    await sendMessage(chatId, promptText);

    return { status: 'edd_prompted' };
  } catch (err) {
    console.error('[editEdd] Error in handleEditEdd:', err.message);
    try {
      const t = getT();
      const sendMessage = getSendMessage();
      const errorText = await t(chatId, 'error.generic');
      await sendMessage(chatId, errorText);
    } catch (_sendErr) {
      // Не роняем обработчик при ошибке отправки сообщения об ошибке
    }
    return { status: 'error', message: err.message };
  }
}

/**
 * Handles a text message from the user during EDD input mode.
 *
 * Validates the input, persists eddDate on success, and clears
 * onboardingState. On validation failure, the user stays in input mode
 * (onboardingState is preserved) for retry.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} text - The user's input text (DD.MM.YYYY)
 * @returns {Promise<{status: string, eddDate?: string, error?: string, message?: string}>}
 *
 * @example
 *   const result = await handleEditEddInput(12345, '25.12.2026');
 *   // { status: 'edd_saved', eddDate: '2026-12-25' }
 */
async function handleEditEddInput(chatId, text) {
  try {
    // Step 1: Read user from Firestore
    const getUser = getGetUser();
    const user = await getUser(chatId);

    // Step 2: Validate user has lmpDate
    if (!user || !user.lmpDate) {
      const t = getT();
      const sendMessage = getSendMessage();
      const errorText = await t(chatId, 'error.session_expired');
      await sendMessage(chatId, errorText);
      return { status: 'error', message: 'no_lmp_date' };
    }

    // Step 3: Validate the input
    const validation = validateEddDate(text, user.lmpDate);

    if (!validation.valid) {
      const t = getT();
      const sendMessage = getSendMessage();

      // Resolve error text with appropriate variables
      let errorText;
      if (validation.error === 'onboarding.edd_before_lmp') {
        errorText = await t(chatId, validation.error, { lmp: formatEdd(user.lmpDate) });
      } else {
        errorText = await t(chatId, validation.error);
      }

      await sendMessage(chatId, errorText);

      // Do NOT clear onboardingState — user stays in input mode for retry
      return { status: 'invalid_edd', error: validation.error };
    }

    // Step 4: Save eddDate and clear onboarding state
    const updateUser = getUpdateUser();
    await updateUser(chatId, {
      eddDate: validation.isoDate,
      onboardingState: null,
    });

    // Step 5: Send success message
    const t = getT();
    const sendMessage = getSendMessage();
    const formattedEdd = formatEdd(validation.isoDate);
    const successText = await t(chatId, 'onboarding.edd_saved', { edd: formattedEdd });
    await sendMessage(chatId, successText);

    // Step 6: Show main menu (graceful degradation if FN-027 not merged)
    if (_showMainMenu) {
      await _showMainMenu(chatId);
    }

    return { status: 'edd_saved', eddDate: validation.isoDate };
  } catch (err) {
    console.error('[editEdd] Error in handleEditEddInput:', err.message);
    try {
      const t = getT();
      const sendMessage = getSendMessage();
      const errorText = await t(chatId, 'error.generic');
      await sendMessage(chatId, errorText);
    } catch (_sendErr) {
      // Не роняем обработчик при ошибке отправки сообщения об ошибке
    }
    return { status: 'error', message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Testability hook
// ---------------------------------------------------------------------------

/**
 * Injects mock dependencies for testing.
 *
 * Allows overriding internal references to t(), sendMessage(), getUser(),
 * updateUser(), and showMainMenu without module-level mocking.
 *
 * @param {{ t?: Function, sendMessage?: Function, getUser?: Function, updateUser?: Function, showMainMenu?: Function|null }} deps - Mock dependencies
 * @returns {void}
 *
 * @example
 *   const { handleEditEdd, __inject } = require('./editEdd');
 *   __inject({ t: mockT, sendMessage: mockSendMessage, getUser: mockGetUser, updateUser: mockUpdateUser });
 *
 * @private
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.getUser) _getUser = deps.getUser;
  if (deps.updateUser) _updateUser = deps.updateUser;
  if (deps.showMainMenu !== undefined) _showMainMenu = deps.showMainMenu;
}

module.exports = {
  handleEditEdd,
  handleEditEddInput,
  validateEddDate,
  formatEdd,
  __inject,
};
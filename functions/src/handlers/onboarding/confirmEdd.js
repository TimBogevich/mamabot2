/**
 * @fileoverview Confirm EDD dialog handler for MamaBot onboarding.
 *
 * Handles the "onboarding_confirm_edd" callback — when the user clicks
 * "✅ Верно" / "✅ Correct" after seeing the auto-calculated EDD.
 *
 * The handler reads the user's `lmpDate` from Firestore, recalculates the
 * EDD via calculateEdd() (Naegele's rule, +280 days), persists `eddDate`
 * to Firestore in ISO format (YYYY-MM-DD), sends a localized success message
 * with the EDD formatted as DD.MM.YYYY, and shows the main menu.
 *
 * This is the final step of onboarding. The handler recalculates EDD from
 * lmpDate rather than relying on callback_data, guaranteeing correctness
 * even under race conditions between FN-005 and FN-006.
 *
 * Exported functions:
 *   - handleConfirmEdd(chatId) — Main handler (async)
 *   - formatEdd(isoDate)       — ISO → DD.MM.YYYY formatter (pure, sync)
 *   - __inject(deps)           — Testability hook (private)
 *
 * @module confirmEdd
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

/** @type {Function|null} */
let _calculateEdd = null;

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

function getCalculateEdd() {
  if (!_calculateEdd) _calculateEdd = require('./lmpDialog').calculateEdd;
  return _calculateEdd;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) to DD.MM.YYYY display format.
 *
 * Pure function with no external dependencies.
 *
 * @param {string} isoDate - ISO date string, e.g. "2026-12-20"
 * @returns {string} Formatted date string, e.g. "20.12.2026"
 *
 * @example
 *   formatEdd('2026-12-20') // returns '20.12.2026'
 *   formatEdd('2026-01-01') // returns '01.01.2026'
 */
function formatEdd(isoDate) {
  const parts = isoDate.split('-');
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  return `${day}.${month}.${year}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handles the "onboarding_confirm_edd" callback.
 *
 * Reads the user's lmpDate from Firestore, recalculates the EDD, persists
 * eddDate, sends a success message with the formatted date, and shows the
 * main menu.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<{status: string, eddDate?: string, message?: string}>}
 *
 * @example
 *   const result = await handleConfirmEdd(12345);
 *   // { status: 'edd_confirmed', eddDate: '2026-12-20' }
 */
async function handleConfirmEdd(chatId) {
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

    // Step 3: Recalculate EDD from lmpDate
    const calculateEdd = getCalculateEdd();
    const eddIso = calculateEdd(user.lmpDate);

    // Step 4: Format EDD for display (DD.MM.YYYY)
    const formattedEdd = formatEdd(eddIso);

    // Step 5: Persist eddDate to Firestore
    const updateUser = getUpdateUser();
    await updateUser(chatId, { eddDate: eddIso });

    // Step 6: Send success message
    const t = getT();
    const sendMessage = getSendMessage();
    const successText = await t(chatId, 'onboarding.edd_confirmed', { edd: formattedEdd });
    await sendMessage(chatId, successText);

    // Step 7: Show main menu (graceful degradation if FN-027 not merged)
    if (_showMainMenu) {
      await _showMainMenu(chatId);
    }

    return { status: 'edd_confirmed', eddDate: eddIso };
  } catch (err) {
    console.error('[confirmEdd] Error in handleConfirmEdd:', err.message);
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
 * updateUser(), calculateEdd(), and showMainMenu without module-level mocking.
 *
 * @param {{ t?: Function, sendMessage?: Function, getUser?: Function, updateUser?: Function, calculateEdd?: Function, showMainMenu?: Function|null }} deps - Mock dependencies
 * @returns {void}
 *
 * @example
 *   const { handleConfirmEdd, __inject } = require('./confirmEdd');
 *   __inject({ t: mockT, sendMessage: mockSendMessage, getUser: mockGetUser, updateUser: mockUpdateUser, calculateEdd: mockCalculateEdd });
 *
 * @private
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.getUser) _getUser = deps.getUser;
  if (deps.updateUser) _updateUser = deps.updateUser;
  if (deps.calculateEdd) _calculateEdd = deps.calculateEdd;
  if (deps.showMainMenu !== undefined) _showMainMenu = deps.showMainMenu;
}

module.exports = { handleConfirmEdd, formatEdd, __inject };
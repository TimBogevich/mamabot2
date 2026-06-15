/**
 * @fileoverview LMP (last menstrual period) date input dialog handler for
 * MamaBot's onboarding flow.
 *
 * After the user selects a language, the bot prompts for the LMP date in
 * DD.MM.YYYY format. The handler validates the input — rejecting invalid
 * formats, future dates, and dates older than 42 weeks — then computes the
 * pregnancy week, persists lmpDate and currentWeek to Firestore, and sends
 * a localized confirmation message with the week number and estimated due date.
 *
 * Exported functions:
 *   - askForLmpDate(chatId)       — Sends the LMP date prompt
 *   - validateLmpDate(text)       — Validates DD.MM.YYYY input (sync)
 *   - calculateEdd(lmpDateString) — Computes EDD via Naegele's rule (sync)
 *   - handleLmpInput(chatId, text) — Full dialog flow (async)
 *   - __inject(deps)              — Testability hook (private)
 *
 * @module lmpDialog
 */

const { t } = require('../../i18n');
const { sendMessage } = require('../../utils/telegram');
const { updateUser } = require('../../collections/users');

// ---------------------------------------------------------------------------
// Internal dependency references (mutable for testability via __inject)
// ---------------------------------------------------------------------------

/** @type {typeof t} */
let _t = t;

/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

/** @type {typeof updateUser} */
let _updateUser = updateUser;

/**
 * @type {Function}
 * @description Reference to calculatePregnancyWeek, dynamically resolved on
 * first use to avoid load-order dependency on FN-026.
 */
let _calculatePregnancyWeek = null;

/**
 * Lazy-getter for calculatePregnancyWeek. Loads the module on first call,
 * which allows FN-026 to be implemented after this module.
 *
 * @returns {Function} calculatePregnancyWeek function
 */
function getCalculatePregnancyWeek() {
  if (!_calculatePregnancyWeek) {
    _calculatePregnancyWeek = require('../../utils/pregnancyWeek').calculatePregnancyWeek;
  }
  return _calculatePregnancyWeek;
}

// ---------------------------------------------------------------------------
// Helpers
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
 * Number of days in 42 weeks (the cutoff).
 * @type {number}
 */
const MAX_WEEKS = 42;
const MAX_DAYS = MAX_WEEKS * 7; // 294

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends the LMP date prompt message to the user.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} The Telegram API response
 *
 * @example
 *   const { askForLmpDate } = require('./handlers/onboarding/lmpDialog');
 *   await askForLmpDate(12345);
 */
async function askForLmpDate(chatId) {
  const text = await _t(chatId, 'onboarding.ask_lmp');
  return _sendMessage(chatId, text);
}

/**
 * Validates a DD.MM.YYYY date string.
 *
 * Validation rules (in order):
 * 1. Must match strict DD.MM.YYYY format (exactly two digits each for day/month)
 * 2. Day must be 1–31, month 1–12, year ≥ 2020 and ≤ current year + 1
 * 3. Must be a real calendar date (catches 32.13.2025, 29.02.2025, 31.04.2026)
 * 4. Must not be in the future (compared to today at midnight UTC)
 * 5. Must not be more than 42 weeks (294 days) before today
 *
 * @param {string} text - The user's input string
 * @returns {{ valid: boolean, error?: string, isoDate?: string }}
 *
 * @example
 *   validateLmpDate('15.03.2026')  // { valid: true, isoDate: '2026-03-15' }
 *   validateLmpDate('32.13.2025')  // { valid: false, error: 'onboarding.invalid_date' }
 *   validateLmpDate('hello')       // { valid: false, error: 'onboarding.invalid_date' }
 */
function validateLmpDate(text) {
  // Step 1: Check strict DD.MM.YYYY format
  if (typeof text !== 'string') {
    return { valid: false, error: 'onboarding.invalid_date' };
  }

  const match = text.match(DD_MM_YYYY_RE);
  if (!match) {
    return { valid: false, error: 'onboarding.invalid_date' };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Step 2: Validate ranges
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { valid: false, error: 'onboarding.invalid_date' };
  }

  // Year must be >= 2020 and <= current year + 1
  const currentYear = new Date().getUTCFullYear();
  if (year < 2020 || year > currentYear + 1) {
    return { valid: false, error: 'onboarding.invalid_date' };
  }

  // Step 3: Validate it's a real calendar date
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return { valid: false, error: 'onboarding.invalid_date' };
  }

  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Step 4: Must not be in the future (compare against today at midnight UTC)
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (date > todayUtc) {
    return { valid: false, error: 'onboarding.date_in_future' };
  }

  // Step 5: Must not be more than 42 weeks before today
  const diffMs = todayUtc.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffDays > MAX_DAYS) {
    return { valid: false, error: 'onboarding.date_too_old' };
  }

  return { valid: true, isoDate };
}

/**
 * Calculates the estimated due date (EDD) using Naegele's rule.
 *
 * Naegele's rule: EDD = LMP + 280 days (40 weeks).
 *
 * @param {string} lmpDateString - ISO date string (YYYY-MM-DD) of the LMP
 * @returns {string} ISO date string (YYYY-MM-DD) of the estimated due date
 *
 * @example
 *   calculateEdd('2026-03-15') // returns '2026-12-20'
 */
function calculateEdd(lmpDateString) {
  const lmpDate = new Date(lmpDateString + 'T00:00:00Z');
  const edd = new Date(lmpDate.getTime() + 280 * MS_PER_DAY);

  const year = edd.getUTCFullYear();
  const month = String(edd.getUTCMonth() + 1).padStart(2, '0');
  const day = String(edd.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Handles the full LMP date input dialog flow.
 *
 * Flow:
 * 1. Validates the input via validateLmpDate()
 * 2. If invalid, sends the error message and returns { success: false }
 * 3. If valid, calls calculatePregnancyWeek() to compute the week
 * 4. Computes EDC via calculateEdd()
 * 5. Saves lmpDate and currentWeek to Firestore via updateUser()
 * 6. Sends confirmation message with week number and EDC
 * 7. Returns { success: true, lmpDate, week, edc }
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} text - The user's input text (DD.MM.YYYY)
 * @returns {Promise<{ success: boolean, lmpDate?: string, week?: number, edc?: string, error?: string }>}
 *
 * @example
 *   const result = await handleLmpInput(12345, '15.03.2026');
 *   // { success: true, lmpDate: '2026-03-15', week: 14, edc: '2026-12-20' }
 */
async function handleLmpInput(chatId, text) {
  // Step 1: Validate
  const validation = validateLmpDate(text);

  if (!validation.valid) {
    const errorText = await _t(chatId, validation.error);
    await _sendMessage(chatId, errorText);
    return { success: false };
  }

  const isoDate = validation.isoDate;

  // Step 3: Compute pregnancy week
  let week;
  try {
    const calcFn = getCalculatePregnancyWeek();
    week = calcFn(isoDate).week;
  } catch {
    const errorText = await _t(chatId, 'error.generic');
    await _sendMessage(chatId, errorText);
    return { success: false, error: 'error.generic' };
  }

  // Step 4: Compute EDC
  const edc = calculateEdd(isoDate);

  // Step 5: Persist to Firestore
  try {
    await _updateUser(chatId, { lmpDate: isoDate, currentWeek: week });
  } catch {
    const errorText = await _t(chatId, 'error.generic');
    await _sendMessage(chatId, errorText);
    return { success: false, error: 'error.generic' };
  }

  // Step 6: Send confirmation
  const confirmText = await _t(chatId, 'onboarding.week_calculated', { week: String(week), edc });
  await _sendMessage(chatId, confirmText);

  return { success: true, lmpDate: isoDate, week, edc };
}

// ---------------------------------------------------------------------------
// Testability hook
// ---------------------------------------------------------------------------

/**
 * Injects mock dependencies for testing.
 *
 * Allows overriding internal references to t(), sendMessage(), updateUser(),
 * and calculatePregnancyWeek without module-level mocking.
 *
 * @param {{ t?: Function, sendMessage?: Function, updateUser?: Function, calculatePregnancyWeek?: Function }} deps - Mock dependencies
 * @returns {void}
 *
 * @example
 *   const { handleLmpInput, __inject } = require('./lmpDialog');
 *   __inject({ t: mockT, sendMessage: mockSendMessage, updateUser: mockUpdateUser, calculatePregnancyWeek: mockCalc });
 *
 * @private
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.updateUser) _updateUser = deps.updateUser;
  if (deps.calculatePregnancyWeek) _calculatePregnancyWeek = deps.calculatePregnancyWeek;
}

module.exports = {
  askForLmpDate,
  validateLmpDate,
  calculateEdd,
  handleLmpInput,
  __inject,
};
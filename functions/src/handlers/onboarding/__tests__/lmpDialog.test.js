/**
 * @fileoverview Tests for the LMP date dialog handler (lmpDialog.js).
 *
 * Uses the __inject() testability hook to inject mock t(), sendMessage(),
 * updateUser(), and calculatePregnancyWeek() implementations, following the
 * same pattern as mainMenu.test.js and i18n.test.js.
 *
 * validateLmpDate() and calculateEdd() are pure functions tested without mocks.
 * handleLmpInput() and askForLmpDate() are integration-style tests with mocked
 * dependencies via __inject().
 *
 * @module lmpDialog.test
 */

// ---------------------------------------------------------------------------
// Environment — prevent firebase-admin from hanging on credential lookups.
// Must be set before any firebase-dependent module is loaded.
// ---------------------------------------------------------------------------

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.TELEGRAM_TOKEN = 'test-token-for-module-load';

// ---------------------------------------------------------------------------
// Mock function declarations (before require() to satisfy hoisting)
// ---------------------------------------------------------------------------

const mockT = vi.fn();
const mockSendMessage = vi.fn();
const mockUpdateUser = vi.fn();
const mockCalculatePregnancyWeek = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const {
  askForLmpDate,
  validateLmpDate,
  calculateEdd,
  handleLmpInput,
  __inject,
} = req('../lmpDialog.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = 12345;
/**
 * Returns the local date string for today in DD.MM.YYYY format.
 * This is the ACTUAL current date at the time the test runs.
 *
 * @returns {string}
 */
function todayDDMMYYYY() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Returns a date string for N days ago in DD.MM.YYYY format.
 *
 * @param {number} days - Number of days to subtract from today
 * @returns {string}
 */
function daysAgoDDMMYYYY(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Returns a date string for N days in the future in DD.MM.YYYY format.
 *
 * @param {number} days - Number of days to add to today
 * @returns {string}
 */
function daysAheadDDMMYYYY(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// ---------------------------------------------------------------------------
// Tests: validateLmpDate (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe('validateLmpDate', () => {
  // --- Valid dates ---

  describe('valid dates', () => {
    it('should accept "15.03.2026" → { valid: true, isoDate: "2026-03-15" }', () => {
      const result = validateLmpDate('15.03.2026');
      expect(result).toEqual({ valid: true, isoDate: '2026-03-15' });
    });

    it('should accept "01.01.2026" → { valid: true, isoDate: "2026-01-01" }', () => {
      const result = validateLmpDate('01.01.2026');
      expect(result).toEqual({ valid: true, isoDate: '2026-01-01' });
    });

    it('should accept "31.12.2025" (single-digit day/month with leading zeros)', () => {
      const result = validateLmpDate('31.12.2025');
      expect(result).toEqual({ valid: true, isoDate: '2025-12-31' });
    });

    it('29.02.2024 returns date_too_old (2024 is a leap year but too far from 2026)', () => {
      // 2024 is a leap year so calendar validation passes for Feb 29.
      // However, from 2026, this date is more than 42 weeks ago.
      const result = validateLmpDate('29.02.2024');
      expect(result).toEqual({ valid: false, error: 'onboarding.date_too_old' });
    });

    it('should accept today\'s date (first day of LMP can be today)', () => {
      const result = validateLmpDate(todayDDMMYYYY());
      expect(result.valid).toBe(true);
    });

    it('should accept a date exactly 294 days ago (42 weeks boundary)', () => {
      const result = validateLmpDate(daysAgoDDMMYYYY(294));
      expect(result.valid).toBe(true);
    });
  });

  // --- Invalid dates: format ---

  describe('invalid format', () => {
    it('"32.13.2025" → invalid_date (month 13)', () => {
      const result = validateLmpDate('32.13.2025');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"29.02.2025" → invalid_date (2025 is not a leap year)', () => {
      const result = validateLmpDate('29.02.2025');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"31.04.2026" → invalid_date (April has 30 days)', () => {
      const result = validateLmpDate('31.04.2026');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"00.05.2026" → invalid_date (day 0)', () => {
      const result = validateLmpDate('00.05.2026');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"15.00.2026" → invalid_date (month 0)', () => {
      const result = validateLmpDate('15.00.2026');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"hello world" → invalid_date', () => {
      const result = validateLmpDate('hello world');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"" (empty string) → invalid_date', () => {
      const result = validateLmpDate('');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"2026-03-15" (YYYY-MM-DD format) → invalid_date', () => {
      const result = validateLmpDate('2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"15/03/2026" (wrong separator) → invalid_date', () => {
      const result = validateLmpDate('15/03/2026');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"15.3.2026" (single-digit month) → invalid_date (strict DD.MM.YYYY)', () => {
      const result = validateLmpDate('15.3.2026');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });

    it('"1.1.2026" (no leading zeros) → invalid_date (strict DD.MM.YYYY)', () => {
      const result = validateLmpDate('1.1.2026');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });
  });

  // --- Future dates ---

  describe('future dates', () => {
    it('tomorrow\'s date → date_in_future', () => {
      const result = validateLmpDate(daysAheadDDMMYYYY(1));
      expect(result).toEqual({ valid: false, error: 'onboarding.date_in_future' });
    });
  });

  // --- Dates too old ---

  describe('dates too old', () => {
    it('a date 295 days ago (42 weeks + 1 day) → date_too_old', () => {
      const result = validateLmpDate(daysAgoDDMMYYYY(295));
      expect(result).toEqual({ valid: false, error: 'onboarding.date_too_old' });
    });
  });

  // --- Year bounds ---

  describe('year bounds', () => {
    it('"15.03.2019" → invalid_date (year 2019 < 2020 minimum)', () => {
      const result = validateLmpDate('15.03.2019');
      expect(result).toEqual({ valid: false, error: 'onboarding.invalid_date' });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateEdd (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe('calculateEdd', () => {
  it('"2026-03-15" → "2026-12-20" (Naegele\'s rule)', () => {
    const result = calculateEdd('2026-03-15');
    expect(result).toBe('2026-12-20');
  });

  it('"2026-01-01" → "2026-10-08"', () => {
    const result = calculateEdd('2026-01-01');
    expect(result).toBe('2026-10-08');
  });

  it('returns ISO format YYYY-MM-DD', () => {
    const result = calculateEdd('2026-06-15');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// Tests: askForLmpDate (with mocked dependencies)
// ---------------------------------------------------------------------------

describe('askForLmpDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __inject({
      t: mockT,
      sendMessage: mockSendMessage,
    });
    mockT.mockResolvedValue('📅 Введи дату первого дня последней менструации в формате ДД.ММ.ГГГГ:');
    mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
  });

  it('calls t(chatId, "onboarding.ask_lmp")', async () => {
    await askForLmpDate(CHAT_ID);
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.ask_lmp');
  });

  it('calls sendMessage with the localized text', async () => {
    await askForLmpDate(CHAT_ID);
    expect(mockSendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      '📅 Введи дату первого дня последней менструации в формате ДД.ММ.ГГГГ:',
    );
  });

  it('the text matches the content from the locale file', async () => {
    mockT.mockResolvedValue('📅 Enter the first day of your last menstrual period in DD.MM.YYYY format:');
    await askForLmpDate(CHAT_ID);
    expect(mockSendMessage.mock.calls[0][1]).toBe(
      '📅 Enter the first day of your last menstrual period in DD.MM.YYYY format:',
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: handleLmpInput (with mocked dependencies)
// ---------------------------------------------------------------------------

describe('handleLmpInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __inject({
      t: mockT,
      sendMessage: mockSendMessage,
      updateUser: mockUpdateUser,
      calculatePregnancyWeek: mockCalculatePregnancyWeek,
    });

    // Default mock implementations
    mockT.mockImplementation((_chatId, key, vars) => {
      if (key === 'onboarding.week_calculated') {
        return Promise.resolve(`🤰 Ты на ${vars.week} неделе беременности! Предполагаемая дата родов: ${vars.edc}.`);
      }
      if (key === 'onboarding.invalid_date') {
        return Promise.resolve('❌ Неверный формат даты.');
      }
      if (key === 'onboarding.date_in_future') {
        return Promise.resolve('❌ Дата не может быть в будущем.');
      }
      if (key === 'onboarding.date_too_old') {
        return Promise.resolve('⚠️ Эта дата старше 42 недель.');
      }
      if (key === 'error.generic') {
        return Promise.resolve('❌ Произошла ошибка.');
      }
      return Promise.resolve(key);
    });

    mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
    mockUpdateUser.mockResolvedValue(undefined);
    mockCalculatePregnancyWeek.mockReturnValue({ week: 14 });
  });

  // --- Valid input ---

  describe('valid input', () => {
    it('should call calculatePregnancyWeek with the ISO date', async () => {
      await handleLmpInput(CHAT_ID, '15.03.2026');
      expect(mockCalculatePregnancyWeek).toHaveBeenCalledWith('2026-03-15');
    });

    it('should call updateUser with lmpDate and currentWeek', async () => {
      await handleLmpInput(CHAT_ID, '15.03.2026');
      expect(mockUpdateUser).toHaveBeenCalledWith(CHAT_ID, {
        lmpDate: '2026-03-15',
        currentWeek: 14,
      });
    });

    it('should send confirmation message with week and EDC', async () => {
      await handleLmpInput(CHAT_ID, '15.03.2026');
      expect(mockSendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        expect.stringContaining('14'),
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        expect.stringContaining('2026-12-20'),
      );
    });

    it('should return { success: true, lmpDate, week, edc }', async () => {
      const result = await handleLmpInput(CHAT_ID, '15.03.2026');
      expect(result).toEqual({
        success: true,
        lmpDate: '2026-03-15',
        week: 14,
        edc: '2026-12-20',
      });
    });
  });

  // --- Invalid input ---

  describe('invalid input', () => {
    it('should send error message using invalid_date key for bad format', async () => {
      await handleLmpInput(CHAT_ID, 'hello');
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.invalid_date');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Неверный формат даты.');
    });

    it('should NOT call updateUser for invalid input', async () => {
      await handleLmpInput(CHAT_ID, 'hello');
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should return { success: false } for invalid input', async () => {
      const result = await handleLmpInput(CHAT_ID, 'hello');
      expect(result).toEqual({ success: false });
    });

    it('should send date_in_future error for future dates', async () => {
      const tomorrow = daysAheadDDMMYYYY(1);
      await handleLmpInput(CHAT_ID, tomorrow);
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.date_in_future');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Дата не может быть в будущем.');
    });

    it('should send date_too_old error for dates older than 42 weeks', async () => {
      const oldDate = daysAgoDDMMYYYY(295);
      await handleLmpInput(CHAT_ID, oldDate);
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.date_too_old');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '⚠️ Эта дата старше 42 недель.');
    });
  });

  // --- updateUser failure ---

  describe('updateUser failure', () => {
    it('should send error.generic when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      await handleLmpInput(CHAT_ID, '15.03.2026');
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.generic');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Произошла ошибка.');
    });

    it('should return { success: false, error: "error.generic" } on updateUser failure', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      const result = await handleLmpInput(CHAT_ID, '15.03.2026');
      expect(result).toEqual({ success: false, error: 'error.generic' });
    });
  });
});
/**
 * @fileoverview Tests for the EDD edit dialog handler (editEdd.js).
 *
 * Uses the __inject() testability hook to inject mock t(), sendMessage(),
 * getUser(), updateUser(), and showMainMenu() implementations, following the
 * same pattern as lmpDialog.test.js and confirmEdd.test.js.
 *
 * validateEddDate() and formatEdd() are pure functions tested without mocks.
 * handleEditEdd() and handleEditEddInput() are integration-style tests with
 * mocked dependencies via __inject().
 *
 * @module editEdd.test
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
const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockShowMainMenu = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const {
  handleEditEdd,
  handleEditEddInput,
  validateEddDate,
  formatEdd,
  __inject,
} = req('../editEdd.js');

// ---------------------------------------------------------------------------
// Inject mocks before any test runs
// ---------------------------------------------------------------------------

__inject({
  t: mockT,
  sendMessage: mockSendMessage,
  getUser: mockGetUser,
  updateUser: mockUpdateUser,
  showMainMenu: mockShowMainMenu,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = 12345;

// ---------------------------------------------------------------------------
// Tests: formatEdd (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe('formatEdd', () => {
  it('should format "2026-12-25" → "25.12.2026"', () => {
    expect(formatEdd('2026-12-25')).toBe('25.12.2026');
  });

  it('should format "2026-01-01" → "01.01.2026"', () => {
    expect(formatEdd('2026-01-01')).toBe('01.01.2026');
  });

  it('should format "2026-10-08" → "08.10.2026"', () => {
    expect(formatEdd('2026-10-08')).toBe('08.10.2026');
  });

  it('should format "2025-03-05" → "05.03.2025"', () => {
    expect(formatEdd('2025-03-05')).toBe('05.03.2025');
  });
});

// ---------------------------------------------------------------------------
// Tests: validateEddDate (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe('validateEddDate', () => {
  // --- Valid EDD dates ---

  describe('valid EDD dates', () => {
    it('should accept "25.12.2026" with LMP "2026-03-15" → valid: true, isoDate: "2026-12-25"', () => {
      const result = validateEddDate('25.12.2026', '2026-03-15');
      expect(result).toEqual({ valid: true, isoDate: '2026-12-25' });
    });

    it('should accept "20.12.2026" with LMP "2026-03-15" → exact Naegele date', () => {
      const result = validateEddDate('20.12.2026', '2026-03-15');
      expect(result).toEqual({ valid: true, isoDate: '2026-12-20' });
    });

    it('should accept "09.01.2027" with LMP "2026-03-15" → LMP+300 boundary', () => {
      const result = validateEddDate('09.01.2027', '2026-03-15');
      expect(result).toEqual({ valid: true, isoDate: '2027-01-09' });
    });

    it('should accept "15.03.2026" with LMP "2026-03-15" → EDD = LMP boundary', () => {
      const result = validateEddDate('15.03.2026', '2026-03-15');
      expect(result).toEqual({ valid: true, isoDate: '2026-03-15' });
    });
  });

  // --- Invalid format ---

  describe('invalid format', () => {
    it('"hello" → edd_invalid_format', () => {
      const result = validateEddDate('hello', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_invalid_format' });
    });

    it('"2026-12-25" (wrong format) → edd_invalid_format', () => {
      const result = validateEddDate('2026-12-25', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_invalid_format' });
    });

    it('"32.13.2026" → edd_invalid_format (month 13, day 32)', () => {
      const result = validateEddDate('32.13.2026', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_invalid_format' });
    });

    it('"29.02.2025" → edd_invalid_format (not a leap year)', () => {
      const result = validateEddDate('29.02.2025', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_invalid_format' });
    });
  });

  // --- EDD before LMP ---

  describe('EDD before LMP', () => {
    it('"01.01.2020" with LMP "2026-03-15" → edd_before_lmp', () => {
      const result = validateEddDate('01.01.2020', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_before_lmp' });
    });

    it('"14.03.2026" with LMP "2026-03-15" → edd_before_lmp (one day before)', () => {
      const result = validateEddDate('14.03.2026', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_before_lmp' });
    });
  });

  // --- EDD too late (beyond LMP + 300 days) ---

  describe('EDD too late', () => {
    it('"10.01.2027" with LMP "2026-03-15" → edd_too_late (LMP+301 days)', () => {
      const result = validateEddDate('10.01.2027', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_too_late' });
    });

    it('"01.06.2027" with LMP "2026-03-15" → edd_too_late', () => {
      const result = validateEddDate('01.06.2027', '2026-03-15');
      expect(result).toEqual({ valid: false, error: 'onboarding.edd_too_late' });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: handleEditEdd (with mocked dependencies)
// ---------------------------------------------------------------------------

describe('handleEditEdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __inject({
      t: mockT,
      sendMessage: mockSendMessage,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      showMainMenu: mockShowMainMenu,
    });

    mockT.mockResolvedValue('📅 Введи предполагаемую дату родов в формате ДД.ММ.ГГГГ:');
    mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
    mockUpdateUser.mockResolvedValue(undefined);
    mockShowMainMenu.mockResolvedValue({ message_id: 43 });
  });

  describe('success path', () => {
    it('should read user from Firestore', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });

      await handleEditEdd(CHAT_ID);

      expect(mockGetUser).toHaveBeenCalledWith(CHAT_ID);
    });

    it('should set onboardingState to "awaiting_edd"', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });

      await handleEditEdd(CHAT_ID);

      expect(mockUpdateUser).toHaveBeenCalledWith(CHAT_ID, { onboardingState: 'awaiting_edd' });
    });

    it('should send the EDD prompt to the user', async () => {
      mockT.mockResolvedValue('📅 Введи предполагаемую дату родов в формате ДД.ММ.ГГГГ:');
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });

      await handleEditEdd(CHAT_ID);

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_prompt');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '📅 Введи предполагаемую дату родов в формате ДД.ММ.ГГГГ:');
    });

    it('should return { status: "edd_prompted" }', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });

      const result = await handleEditEdd(CHAT_ID);

      expect(result).toEqual({ status: 'edd_prompted' });
    });
  });

  describe('user has no lmpDate', () => {
    it('should send error.session_expired when lmpDate is missing', async () => {
      mockT.mockResolvedValue('⏰ Сессия истекла.');
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });

      await handleEditEdd(CHAT_ID);

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.session_expired');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '⏰ Сессия истекла.');
    });

    it('should show main menu when lmpDate is missing', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });

      await handleEditEdd(CHAT_ID);

      expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
    });

    it('should return { status: "error", message: "no_lmp_date" }', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });

      const result = await handleEditEdd(CHAT_ID);

      expect(result).toEqual({ status: 'error', message: 'no_lmp_date' });
    });
  });

  describe('user is null', () => {
    it('should send error.session_expired when user is null', async () => {
      mockT.mockResolvedValue('⏰ Сессия истекла.');
      mockGetUser.mockResolvedValue(null);

      await handleEditEdd(CHAT_ID);

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.session_expired');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '⏰ Сессия истекла.');
    });

    it('should return { status: "error", message: "no_lmp_date" } when user is null', async () => {
      mockGetUser.mockResolvedValue(null);

      const result = await handleEditEdd(CHAT_ID);

      expect(result).toEqual({ status: 'error', message: 'no_lmp_date' });
    });
  });

  describe('Firestore error', () => {
    it('should send error.generic when updateUser throws', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      mockT.mockResolvedValue('❌ Произошла ошибка.');

      await handleEditEdd(CHAT_ID);

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.generic');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Произошла ошибка.');
    });

    it('should return { status: "error", ... } when updateUser throws', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));

      const result = await handleEditEdd(CHAT_ID);

      expect(result.status).toBe('error');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: handleEditEddInput (with mocked dependencies)
// ---------------------------------------------------------------------------

describe('handleEditEddInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __inject({
      t: mockT,
      sendMessage: mockSendMessage,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      showMainMenu: mockShowMainMenu,
    });

    mockT.mockImplementation((_chatId, key, vars) => {
      if (key === 'onboarding.edd_saved') {
        return Promise.resolve(`✅ ПДР ${vars.edd} сохранена!`);
      }
      if (key === 'onboarding.edd_invalid_format') {
        return Promise.resolve('❌ Неверный формат даты.');
      }
      if (key === 'onboarding.edd_before_lmp') {
        return Promise.resolve(`❌ ПДР не может быть раньше (${vars.lmp}).`);
      }
      if (key === 'onboarding.edd_too_late') {
        return Promise.resolve('❌ ПДР слишком далеко.');
      }
      if (key === 'error.session_expired') {
        return Promise.resolve('⏰ Сессия истекла.');
      }
      if (key === 'error.generic') {
        return Promise.resolve('❌ Произошла ошибка.');
      }
      return Promise.resolve(key);
    });

    mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
    mockUpdateUser.mockResolvedValue(undefined);
    mockShowMainMenu.mockResolvedValue({ message_id: 43 });
  });

  // --- Success path ---

  describe('valid input', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
    });

    it('should save eddDate and clear onboardingState', async () => {
      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockUpdateUser).toHaveBeenCalledWith(CHAT_ID, {
        eddDate: '2026-12-25',
        onboardingState: null,
      });
    });

    it('should send success message with formatted EDD', async () => {
      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_saved', { edd: '25.12.2026' });
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '✅ ПДР 25.12.2026 сохранена!');
    });

    it('should call showMainMenu', async () => {
      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
    });

    it('should return { status: "edd_saved", eddDate: "2026-12-25" }', async () => {
      const result = await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(result).toEqual({ status: 'edd_saved', eddDate: '2026-12-25' });
    });
  });

  // --- Invalid format (retry, state kept) ---

  describe('invalid format', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
    });

    it('should send edd_invalid_format error', async () => {
      await handleEditEddInput(CHAT_ID, 'hello');

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_invalid_format');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Неверный формат даты.');
    });

    it('should NOT call updateUser (state preserved for retry)', async () => {
      await handleEditEddInput(CHAT_ID, 'hello');

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should return { status: "invalid_edd", error: "onboarding.edd_invalid_format" }', async () => {
      const result = await handleEditEddInput(CHAT_ID, 'hello');

      expect(result).toEqual({ status: 'invalid_edd', error: 'onboarding.edd_invalid_format' });
    });
  });

  // --- EDD before LMP ---

  describe('EDD before LMP', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
    });

    it('should send edd_before_lmp error with formatted LMP date', async () => {
      await handleEditEddInput(CHAT_ID, '01.01.2020');

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_before_lmp', { lmp: '15.03.2026' });
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ ПДР не может быть раньше (15.03.2026).');
    });

    it('should NOT call updateUser (state preserved for retry)', async () => {
      await handleEditEddInput(CHAT_ID, '01.01.2020');

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should return { status: "invalid_edd", error: "onboarding.edd_before_lmp" }', async () => {
      const result = await handleEditEddInput(CHAT_ID, '01.01.2020');

      expect(result).toEqual({ status: 'invalid_edd', error: 'onboarding.edd_before_lmp' });
    });
  });

  // --- EDD too late ---

  describe('EDD too late', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
    });

    it('should send edd_too_late error', async () => {
      await handleEditEddInput(CHAT_ID, '10.01.2027');

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_too_late');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ ПДР слишком далеко.');
    });

    it('should NOT call updateUser (state preserved for retry)', async () => {
      await handleEditEddInput(CHAT_ID, '10.01.2027');

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  // --- User has no lmpDate ---

  describe('user has no lmpDate', () => {
    it('should send error.session_expired', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });

      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.session_expired');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '⏰ Сессия истекла.');
    });

    it('should return { status: "error", message: "no_lmp_date" }', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });

      const result = await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(result).toEqual({ status: 'error', message: 'no_lmp_date' });
    });
  });

  // --- Firestore error on save ---

  describe('Firestore error on save', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
    });

    it('should send error.generic when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));

      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.generic');
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Произошла ошибка.');
    });

    it('should NOT call showMainMenu on error path', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));

      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockShowMainMenu).not.toHaveBeenCalled();
    });

    it('should return { status: "error", ... } when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));

      const result = await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(result.status).toBe('error');
    });
  });

  // --- showMainMenu is null (graceful degradation) ---

  describe('showMainMenu is null', () => {
    beforeEach(() => {
      __inject({
        t: mockT,
        sendMessage: mockSendMessage,
        getUser: mockGetUser,
        updateUser: mockUpdateUser,
        showMainMenu: null,
      });
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
    });

    it('should not crash when showMainMenu is null', async () => {
      const result = await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockSendMessage).toHaveBeenCalled();
      expect(result).toEqual({ status: 'edd_saved', eddDate: '2026-12-25' });
    });

    it('should not call showMainMenu (it is null)', async () => {
      await handleEditEddInput(CHAT_ID, '25.12.2026');

      expect(mockShowMainMenu).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: __inject allows overriding all dependencies
// ---------------------------------------------------------------------------

describe('__inject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __inject({
      t: mockT,
      sendMessage: mockSendMessage,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      showMainMenu: mockShowMainMenu,
    });
  });

  it('should allow injecting custom t function', async () => {
    const altT = vi.fn().mockResolvedValue('alt text');
    __inject({ t: altT, showMainMenu: null });
    mockGetUser.mockResolvedValue(null);

    await handleEditEdd(CHAT_ID);

    expect(altT).toHaveBeenCalled();
    expect(mockT).not.toHaveBeenCalled();
  });

  it('should allow injecting custom updateUser', async () => {
    const altUpdateUser = vi.fn().mockResolvedValue(undefined);
    __inject({ updateUser: altUpdateUser });
    mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });

    await handleEditEddInput(CHAT_ID, '25.12.2026');

    expect(altUpdateUser).toHaveBeenCalledWith(CHAT_ID, {
      eddDate: '2026-12-25',
      onboardingState: null,
    });
  });
});
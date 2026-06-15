/**
 * @fileoverview Tests for the confirm EDD dialog handler (confirmEdd.js).
 *
 * Uses the __inject() testability hook to inject mock t(), sendMessage(),
 * getUser(), updateUser(), calculateEdd(), and showMainMenu() implementations,
 * following the same pattern as lmpDialog.test.js.
 *
 * formatEdd() is a pure function tested without mocks.
 * handleConfirmEdd() is integration-style tested with mocked dependencies.
 *
 * @module confirmEdd.test
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
const mockCalculateEdd = vi.fn();
const mockShowMainMenu = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const { handleConfirmEdd, formatEdd, __inject } = req('../confirmEdd.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = 12345;

// ---------------------------------------------------------------------------
// Tests: formatEdd (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe('formatEdd', () => {
  it('"2026-12-20" → "20.12.2026"', () => {
    expect(formatEdd('2026-12-20')).toBe('20.12.2026');
  });

  it('"2026-01-01" → "01.01.2026"', () => {
    expect(formatEdd('2026-01-01')).toBe('01.01.2026');
  });

  it('"2026-10-08" → "08.10.2026"', () => {
    expect(formatEdd('2026-10-08')).toBe('08.10.2026');
  });

  it('"2025-03-05" → "05.03.2025"', () => {
    expect(formatEdd('2025-03-05')).toBe('05.03.2025');
  });
});

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function restoreInjectDefaults() {
  __inject({
    t: mockT,
    sendMessage: mockSendMessage,
    getUser: mockGetUser,
    updateUser: mockUpdateUser,
    calculateEdd: mockCalculateEdd,
    showMainMenu: mockShowMainMenu,
  });
}

function setupDefaults() {
  mockT.mockImplementation((_chatId, key, vars) => {
    if (key === 'onboarding.edd_confirmed') {
      return Promise.resolve(`✅ ПДР ${vars.edd} сохранена! Ты успешно завершила настройку.`);
    }
    if (key === 'error.session_expired') {
      return Promise.resolve('⏰ Сессия истекла. Пожалуйста, начни заново: /start');
    }
    if (key === 'error.generic') {
      return Promise.resolve('❌ Произошла ошибка.');
    }
    return Promise.resolve(key);
  });

  mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
  mockGetUser.mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15', language: 'ru' });
  mockUpdateUser.mockResolvedValue(undefined);
  mockCalculateEdd.mockImplementation((lmpDate) => {
    if (lmpDate === '2026-03-15') return '2026-12-20';
    if (lmpDate === '2026-01-01') return '2026-10-08';
    return '2026-12-20';
  });
  mockShowMainMenu.mockResolvedValue({ message_id: 42 });
}

// ---------------------------------------------------------------------------
// Tests: handleConfirmEdd
// ---------------------------------------------------------------------------

describe('handleConfirmEdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  // --- Success path ---

  describe('success path', () => {
    it('should call getUser with chatId', async () => {
      await handleConfirmEdd(CHAT_ID);
      expect(mockGetUser).toHaveBeenCalledWith(CHAT_ID);
    });

    it('should call calculateEdd with user.lmpDate', async () => {
      await handleConfirmEdd(CHAT_ID);
      expect(mockCalculateEdd).toHaveBeenCalledWith('2026-03-15');
    });

    it('should call updateUser with eddDate', async () => {
      await handleConfirmEdd(CHAT_ID);
      expect(mockUpdateUser).toHaveBeenCalledWith(CHAT_ID, { eddDate: '2026-12-20' });
    });

    it('should call t with onboarding.edd_confirmed and formatted DD.MM.YYYY date', async () => {
      await handleConfirmEdd(CHAT_ID);
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_confirmed', { edd: '20.12.2026' });
    });

    it('should call sendMessage with the resolved success text', async () => {
      await handleConfirmEdd(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        '✅ ПДР 20.12.2026 сохранена! Ты успешно завершила настройку.',
      );
    });

    it('should call showMainMenu with chatId', async () => {
      await handleConfirmEdd(CHAT_ID);
      expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
    });

    it('should return { status: "edd_confirmed", eddDate }', async () => {
      const result = await handleConfirmEdd(CHAT_ID);
      expect(result).toEqual({ status: 'edd_confirmed', eddDate: '2026-12-20' });
    });
  });

  // --- User has no lmpDate ---

  describe('user has no lmpDate', () => {
    it('should call t with error.session_expired when user has no lmpDate', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });
      await handleConfirmEdd(CHAT_ID);
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.session_expired');
    });

    it('should send error message when user has no lmpDate', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });
      await handleConfirmEdd(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '⏰ Сессия истекла. Пожалуйста, начни заново: /start');
    });

    it('should NOT call updateUser when user has no lmpDate', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });
      await handleConfirmEdd(CHAT_ID);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should return { status: "error", message: "no_lmp_date" }', async () => {
      mockGetUser.mockResolvedValue({ chatId: CHAT_ID, language: 'ru' });
      const result = await handleConfirmEdd(CHAT_ID);
      expect(result).toEqual({ status: 'error', message: 'no_lmp_date' });
    });
  });

  // --- User is null ---

  describe('user is null', () => {
    it('should call t with error.session_expired when user is null', async () => {
      mockGetUser.mockResolvedValue(null);
      await handleConfirmEdd(CHAT_ID);
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.session_expired');
    });

    it('should send error message when user is null', async () => {
      mockGetUser.mockResolvedValue(null);
      await handleConfirmEdd(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '⏰ Сессия истекла. Пожалуйста, начни заново: /start');
    });

    it('should NOT call updateUser when user is null', async () => {
      mockGetUser.mockResolvedValue(null);
      await handleConfirmEdd(CHAT_ID);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should return { status: "error", message: "no_lmp_date" }', async () => {
      mockGetUser.mockResolvedValue(null);
      const result = await handleConfirmEdd(CHAT_ID);
      expect(result).toEqual({ status: 'error', message: 'no_lmp_date' });
    });
  });

  // --- updateUser failure ---

  describe('updateUser failure', () => {
    it('should call t with error.generic when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      await handleConfirmEdd(CHAT_ID);
      expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.generic');
    });

    it('should send error message when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      await handleConfirmEdd(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, '❌ Произошла ошибка.');
    });

    it('should NOT call showMainMenu when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      await handleConfirmEdd(CHAT_ID);
      expect(mockShowMainMenu).not.toHaveBeenCalled();
    });

    it('should return { status: "error", ... } when updateUser throws', async () => {
      mockUpdateUser.mockRejectedValue(new Error('Firestore unavailable'));
      const result = await handleConfirmEdd(CHAT_ID);
      expect(result).toEqual({ status: 'error', message: 'Firestore unavailable' });
    });
  });

  // --- showMainMenu is null (graceful degradation) ---

  describe('showMainMenu is null (graceful degradation)', () => {
    it('should not crash when showMainMenu is null', async () => {
      __inject({ showMainMenu: null });
      const result = await handleConfirmEdd(CHAT_ID);
      expect(mockShowMainMenu).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'edd_confirmed', eddDate: '2026-12-20' });
    });

    it('should still call sendMessage when showMainMenu is null', async () => {
      __inject({ showMainMenu: null });
      await handleConfirmEdd(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        '✅ ПДР 20.12.2026 сохранена! Ты успешно завершила настройку.',
      );
    });
  });

  // --- __inject overrides all dependencies ---

  describe('__inject overrides all dependencies', () => {
    it('should use injected t after __inject', async () => {
      const altT = vi.fn().mockResolvedValue('alt translation');
      const altGetUser = vi.fn().mockResolvedValue({ chatId: CHAT_ID, lmpDate: '2026-03-15' });
      const altSend = vi.fn().mockResolvedValue({ ok: true });
      const altUpdate = vi.fn().mockResolvedValue(undefined);
      const altCalcEdd = vi.fn().mockReturnValue('2026-12-20');
      const altMenu = vi.fn().mockResolvedValue({ message_id: 99 });

      __inject({
        t: altT,
        sendMessage: altSend,
        getUser: altGetUser,
        updateUser: altUpdate,
        calculateEdd: altCalcEdd,
        showMainMenu: altMenu,
      });

      const result = await handleConfirmEdd(CHAT_ID);

      expect(altGetUser).toHaveBeenCalledWith(CHAT_ID);
      expect(altCalcEdd).toHaveBeenCalled();
      expect(altT).toHaveBeenCalledWith(CHAT_ID, 'onboarding.edd_confirmed', { edd: '20.12.2026' });
      expect(altUpdate).toHaveBeenCalledWith(CHAT_ID, { eddDate: '2026-12-20' });
      expect(altSend).toHaveBeenCalledWith(CHAT_ID, 'alt translation');
      expect(altMenu).toHaveBeenCalledWith(CHAT_ID);
      expect(result).toEqual({ status: 'edd_confirmed', eddDate: '2026-12-20' });

      expect(mockT).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockCalculateEdd).not.toHaveBeenCalled();
      expect(mockShowMainMenu).not.toHaveBeenCalled();
    });
  });
});
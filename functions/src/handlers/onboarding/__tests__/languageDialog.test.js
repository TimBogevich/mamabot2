/**
 * @fileoverview Tests for the language dialog handler module.
 *
 * Uses the __inject() testability hook provided by languageDialog.js to inject
 * mock implementations, following the same pattern as i18n.test.js.
 */

// ---------------------------------------------------------------------------
// Environment — prevent firebase-admin from hanging on credential lookups
// ---------------------------------------------------------------------------

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.TELEGRAM_TOKEN = 'test-token-for-testing';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

// ---------------------------------------------------------------------------
// Mock function declarations
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockT = vi.fn();
const mockSetLanguage = vi.fn();
const mockSendMessage = vi.fn();
const mockAskForLmpDate = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const req = createRequire(import.meta.url);
const { askLanguage, handleLanguageChoice, __inject } = req('../languageDialog.js');

// ---------------------------------------------------------------------------
// Inject mocks before any test runs
// ---------------------------------------------------------------------------

__inject({
  getUser: mockGetUser,
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
  t: mockT,
  setLanguage: mockSetLanguage,
  sendMessage: mockSendMessage,
  askForLmpDate: mockAskForLmpDate,
});

// ---------------------------------------------------------------------------
// Cleanup between tests
// ---------------------------------------------------------------------------

beforeEach(function () {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: askLanguage
// ---------------------------------------------------------------------------

describe('askLanguage', function () {
  describe('returning user (already has language)', function () {
    it('sends already_registered when language is ru', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: 'ru', lmpDate: '2026-01-15' });
      mockT.mockResolvedValue('👋 Ты уже зарегистрирован(а)! Используй меню для навигации.');

      const result = await askLanguage(12345);

      expect(mockGetUser).toHaveBeenCalledWith(12345);
      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.already_registered');
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        '👋 Ты уже зарегистрирован(а)! Используй меню для навигации.',
      );
      expect(result).toEqual({ status: 'already_registered' });
    });

    it('sends already_registered when language is en', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: 'en', lmpDate: '2026-01-15' });
      mockT.mockResolvedValue("👋 You're already registered! Use the menu to navigate.");

      const result = await askLanguage(12345);

      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.already_registered');
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        "👋 You're already registered! Use the menu to navigate.",
      );
      expect(result).toEqual({ status: 'already_registered' });
    });

    it('does NOT send reply_markup for returning users', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: 'ru', lmpDate: '2026-01-15' });
      mockT.mockResolvedValue('already registered message');

      await askLanguage(12345);

      // Should be called without a reply_markup option
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        'already registered message',
      );
      const callArgs = mockSendMessage.mock.calls[0];
      expect(callArgs.length).toBe(2); // chatId + text only
    });
  });

  describe('new user (no language)', function () {
    it('sends keyboard when user does not exist', async function () {
      mockGetUser.mockResolvedValue(null);
      mockT.mockResolvedValueOnce('🌍 Choose your language:')
        .mockResolvedValueOnce('🇷🇺 Русский')
        .mockResolvedValueOnce('🇬🇧 English');

      const result = await askLanguage(12345);

      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.choose_language');
      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.language_ru');
      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.language_en');
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        '🌍 Choose your language:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
              [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
            ],
          },
        },
      );
      expect(result).toEqual({ status: 'language_prompted' });
    });

    it('sends keyboard when user exists but has no language field', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345 }); // no language field
      mockT.mockResolvedValueOnce('🌍 Choose your language:')
        .mockResolvedValueOnce('🇷🇺 Русский')
        .mockResolvedValueOnce('🇬🇧 English');

      const result = await askLanguage(12345);

      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        '🌍 Choose your language:',
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        }),
      );
      expect(result).toEqual({ status: 'language_prompted' });
    });

    it('sends keyboard when user exists with language: null', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: null });
      mockT.mockResolvedValueOnce('🌍 Choose your language:')
        .mockResolvedValueOnce('🇷🇺 Русский')
        .mockResolvedValueOnce('🇬🇧 English');

      const result = await askLanguage(12345);

      expect(result).toEqual({ status: 'language_prompted' });
    });

    it('inline keyboard has exactly 2 rows, 1 button per row', async function () {
      mockGetUser.mockResolvedValue(null);
      mockT.mockResolvedValueOnce('prompt').mockResolvedValueOnce('Русский').mockResolvedValueOnce('English');

      await askLanguage(12345);

      const sendArgs = mockSendMessage.mock.calls[0];
      const keyboard = sendArgs[2].reply_markup;

      expect(keyboard.inline_keyboard).toHaveLength(2);
      expect(keyboard.inline_keyboard[0]).toHaveLength(1); // 1 button in first row
      expect(keyboard.inline_keyboard[1]).toHaveLength(1); // 1 button in second row
    });

    it('uses correct callback_data strings in the keyboard', async function () {
      mockGetUser.mockResolvedValue(null);
      mockT.mockResolvedValueOnce('prompt').mockResolvedValueOnce('Русский').mockResolvedValueOnce('English');

      await askLanguage(12345);

      const sendArgs = mockSendMessage.mock.calls[0];
      const keyboard = sendArgs[2].reply_markup;

      expect(keyboard.inline_keyboard[0][0].callback_data).toBe('lang_ru');
      expect(keyboard.inline_keyboard[1][0].callback_data).toBe('lang_en');
    });
  });

  describe('error handling', function () {
    it('catches errors and returns error status', async function () {
      mockGetUser.mockRejectedValue(new Error('Firestore unavailable'));

      const result = await askLanguage(12345);

      expect(result).toEqual({ status: 'error', message: 'Firestore unavailable' });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: handleLanguageChoice
// ---------------------------------------------------------------------------

describe('handleLanguageChoice', function () {
  const userInfo = {
    userId: '456',
    firstName: 'Test',
    lastName: '',
    username: '',
  };

  describe('new user (first interaction)', function () {
    it('creates user with language ru when lang_ru is chosen and chains to askForLmpDate', async function () {
      mockGetUser.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue(undefined);
      mockT.mockResolvedValue('✅ Русский язык установлен!');

      const result = await handleLanguageChoice(12345, 'lang_ru', userInfo);

      expect(mockCreateUser).toHaveBeenCalledWith(12345, {
        userId: '456',
        firstName: 'Test',
        lastName: '',
        username: '',
        language: 'ru',
        role: 'mom',
      });
      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.language_saved', { lang: 'Русский' });
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '✅ Русский язык установлен!');
      expect(mockAskForLmpDate).toHaveBeenCalledWith(12345);
      expect(result).toEqual({ status: 'language_set', language: 'ru' });
    });

    it('creates user with language en when lang_en is chosen and chains to askForLmpDate', async function () {
      mockGetUser.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue(undefined);
      mockT.mockResolvedValue('✅ Language set to English!');

      const result = await handleLanguageChoice(12345, 'lang_en', userInfo);

      expect(mockCreateUser).toHaveBeenCalledWith(12345, {
        userId: '456',
        firstName: 'Test',
        lastName: '',
        username: '',
        language: 'en',
        role: 'mom',
      });
      expect(mockT).toHaveBeenCalledWith(12345, 'onboarding.language_saved', { lang: 'English' });
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '✅ Language set to English!');
      expect(mockAskForLmpDate).toHaveBeenCalledWith(12345);
      expect(result).toEqual({ status: 'language_set', language: 'en' });
    });
  });

  describe('returning user (updating language)', function () {
    it('calls setLanguage instead of createUser for ru, does NOT chain to LMP', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: 'ru', lmpDate: '2026-01-15' });
      mockSetLanguage.mockResolvedValue('ru');
      mockT.mockResolvedValue('✅ Русский язык установлен!');

      const result = await handleLanguageChoice(12345, 'lang_ru', userInfo);

      expect(mockSetLanguage).toHaveBeenCalledWith(12345, 'ru');
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockAskForLmpDate).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'language_set', language: 'ru' });
    });

    it('calls setLanguage instead of createUser for en, does NOT chain to LMP', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: 'en', lmpDate: '2026-01-15' });
      mockSetLanguage.mockResolvedValue('en');
      mockT.mockResolvedValue('✅ Language set to English!');

      const result = await handleLanguageChoice(12345, 'lang_en', userInfo);

      expect(mockSetLanguage).toHaveBeenCalledWith(12345, 'en');
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockAskForLmpDate).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'language_set', language: 'en' });
    });
  });

  describe('error handling', function () {
    it('returns error for unknown callback data', async function () {
      const result = await handleLanguageChoice(12345, 'lang_fr', userInfo);

      expect(result).toEqual({ status: 'error', message: 'Unknown language callback' });
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockSetLanguage).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('returns error for empty callback data', async function () {
      const result = await handleLanguageChoice(12345, '', userInfo);

      expect(result).toEqual({ status: 'error', message: 'Unknown language callback' });
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockSetLanguage).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('catches createUser error', async function () {
      mockGetUser.mockResolvedValue(null);
      mockCreateUser.mockRejectedValue(new Error('Write failed'));

      const result = await handleLanguageChoice(12345, 'lang_ru', userInfo);

      expect(result).toEqual({ status: 'error', message: 'Write failed' });
    });

    it('catches setLanguage error', async function () {
      mockGetUser.mockResolvedValue({ chatId: 12345, language: 'ru' });
      mockSetLanguage.mockRejectedValue(new Error('Update failed'));

      const result = await handleLanguageChoice(12345, 'lang_ru', userInfo);

      expect(result).toEqual({ status: 'error', message: 'Update failed' });
    });
  });
});
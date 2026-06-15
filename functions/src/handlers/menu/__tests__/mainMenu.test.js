/**
 * @fileoverview Tests for the mainMenu module (showMainMenu and __inject).
 *
 * Uses the __inject() testability hook to inject mock t() and sendMessage()
 * implementations, following the same pattern as i18n.test.js.
 *
 * @module mainMenu.test
 */

// ---------------------------------------------------------------------------
// Environment — prevent firebase-admin from hanging on credential lookups.
// The emulator host must be set before any firebase-dependent module is loaded.
// ---------------------------------------------------------------------------

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.TELEGRAM_TOKEN = 'test-token-for-module-load';

// ---------------------------------------------------------------------------
// Mock function declarations (before require() to satisfy hoisting)
// ---------------------------------------------------------------------------

const mockT = vi.fn();
const mockSendMessage = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const { showMainMenu, __inject } = req('../mainMenu.js');

// ---------------------------------------------------------------------------
// Inject mocks before any test runs
// ---------------------------------------------------------------------------

__inject({ t: mockT, sendMessage: mockSendMessage });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = 12345;

/**
 * Returns default resolved values for the five t() calls in showMainMenu:
 *   header + my_week -> 'menu.my_week'
 *   mood_diary      -> 'menu.mood_diary'
 *   nutrition       -> 'menu.nutrition'
 *   settings        -> 'menu.settings'
 */
const DEFAULT_T_VALUES = {
  'menu.my_week': '📋 Моя неделя',
  'menu.mood_diary': '😊 Дневник настроения',
  'menu.nutrition': '🍎 Питание',
  'menu.settings': '⚙️ Настройки',
};

/**
 * Configures mockT to resolve with default localized values.
 * Matches keys using the first call argument.
 */
function setupDefaultMockT() {
  mockT.mockImplementation((chatId, key) => {
    return Promise.resolve(DEFAULT_T_VALUES[key] || key);
  });
}

/**
 * Configures mockSendMessage to resolve with a default Telegram-like response.
 */
function setupDefaultMockSendMessage() {
  mockSendMessage.mockResolvedValue({
    ok: true,
    result: { message_id: 42 },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showMainMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMockT();
    setupDefaultMockSendMessage();
  });

  // ----- Basic functionality: t() calls -----

  describe('t() calls', () => {
    it('вызывает _t ровно 5 раз: заголовок + 4 подписи кнопок', async () => {
      await showMainMenu(CHAT_ID);

      expect(mockT).toHaveBeenCalledTimes(5);
    });

    it('все вызовы _t используют правильный chatId и ключи', async () => {
      await showMainMenu(CHAT_ID);

      expect(mockT).toHaveBeenNthCalledWith(1, CHAT_ID, 'menu.my_week');
      expect(mockT).toHaveBeenNthCalledWith(2, CHAT_ID, 'menu.my_week');
      expect(mockT).toHaveBeenNthCalledWith(3, CHAT_ID, 'menu.mood_diary');
      expect(mockT).toHaveBeenNthCalledWith(4, CHAT_ID, 'menu.nutrition');
      expect(mockT).toHaveBeenNthCalledWith(5, CHAT_ID, 'menu.settings');
    });

    it('порядок вызовов _t: заголовок, затем кнопки', async () => {
      const callOrder = [];
      mockT.mockImplementation((chatId, key) => {
        callOrder.push(key);
        return Promise.resolve(DEFAULT_T_VALUES[key] || key);
      });

      await showMainMenu(CHAT_ID);

      expect(callOrder).toEqual([
        'menu.my_week',       // заголовок
        'menu.my_week',       // кнопка 1
        'menu.mood_diary',    // кнопка 2
        'menu.nutrition',     // кнопка 3
        'menu.settings',      // кнопка 4
      ]);
    });
  });

  // ----- Inline keyboard structure -----

  describe('inline keyboard structure', () => {
    it('_sendMessage вызывается с chatId = 12345', async () => {
      await showMainMenu(CHAT_ID);

      expect(mockSendMessage).toHaveBeenCalledWith(
        CHAT_ID,
        expect.any(String),
        expect.any(Object),
      );
    });

    it('_sendMessage получает текст равный результату _t("menu.my_week")', async () => {
      mockT.mockResolvedValue('📋 Моя неделя');

      await showMainMenu(CHAT_ID);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        '📋 Моя неделя',
        expect.any(Object),
      );
    });

    it('третий аргумент _sendMessage содержит reply_markup с inline_keyboard', async () => {
      await showMainMenu(CHAT_ID);

      const options = mockSendMessage.mock.calls[0][2];
      expect(options).toHaveProperty('reply_markup');
      expect(options.reply_markup).toHaveProperty('inline_keyboard');
    });

    it('inline_keyboard — массив из 2 строк (рядов)', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard).toHaveLength(2);
    });

    it('первый ряд содержит 2 кнопки: my_week и mood_diary', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;

      expect(inline_keyboard[0]).toHaveLength(2);
      expect(inline_keyboard[0][0]).toEqual({
        text: '📋 Моя неделя',
        callback_data: 'menu_my_week',
      });
      expect(inline_keyboard[0][1]).toEqual({
        text: '😊 Дневник настроения',
        callback_data: 'menu_mood_diary',
      });
    });

    it('второй ряд содержит 2 кнопки: nutrition и settings', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;

      expect(inline_keyboard[1]).toHaveLength(2);
      expect(inline_keyboard[1][0]).toEqual({
        text: '🍎 Питание',
        callback_data: 'menu_nutrition',
      });
      expect(inline_keyboard[1][1]).toEqual({
        text: '⚙️ Настройки',
        callback_data: 'menu_settings',
      });
    });

    it('подписи кнопок соответствуют значениям, возвращённым _t', async () => {
      // Custom labels to verify passthrough
      mockT.mockImplementation((chatId, key) => {
        const labels = {
          'menu.my_week': '📋 My Week',
          'menu.mood_diary': '😊 Mood Diary',
          'menu.nutrition': '🍎 Nutrition',
          'menu.settings': '⚙️ Settings',
        };
        return Promise.resolve(labels[key] || key);
      });

      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;

      expect(inline_keyboard[0][0].text).toBe('📋 My Week');
      expect(inline_keyboard[0][1].text).toBe('😊 Mood Diary');
      expect(inline_keyboard[1][0].text).toBe('🍎 Nutrition');
      expect(inline_keyboard[1][1].text).toBe('⚙️ Settings');
    });
  });

  // ----- callback_data values -----

  describe('callback_data values', () => {
    it('callback_data кнопки «Моя неделя» = "menu_my_week"', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0][0].callback_data).toBe('menu_my_week');
    });

    it('callback_data кнопки «Дневник настроения» = "menu_mood_diary"', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0][1].callback_data).toBe('menu_mood_diary');
    });

    it('callback_data кнопки «Питание» = "menu_nutrition"', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[1][0].callback_data).toBe('menu_nutrition');
    });

    it('callback_data кнопки «Настройки» = "menu_settings"', async () => {
      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[1][1].callback_data).toBe('menu_settings');
    });
  });

  // ----- Language independence -----

  describe('language independence', () => {
    it('при русском языке подписи кнопок содержат кириллицу', async () => {
      mockT.mockImplementation((chatId, key) => {
        const ru = {
          'menu.my_week': '📋 Моя неделя',
          'menu.mood_diary': '😊 Дневник настроения',
          'menu.nutrition': '🍎 Питание',
          'menu.settings': '⚙️ Настройки',
        };
        return Promise.resolve(ru[key] || key);
      });

      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;

      expect(inline_keyboard[0][0].text).toContain('неделя');
      expect(inline_keyboard[0][1].text).toContain('настроения');
      expect(inline_keyboard[1][0].text).toContain('Питание');
      expect(inline_keyboard[1][1].text).toContain('Настройки');
    });

    it('при английском языке подписи кнопок содержат латиницу', async () => {
      mockT.mockImplementation((chatId, key) => {
        const en = {
          'menu.my_week': '📋 My Week',
          'menu.mood_diary': '😊 Mood Diary',
          'menu.nutrition': '🍎 Nutrition',
          'menu.settings': '⚙️ Settings',
        };
        return Promise.resolve(en[key] || key);
      });

      await showMainMenu(CHAT_ID);

      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;

      expect(inline_keyboard[0][0].text).toContain('My Week');
      expect(inline_keyboard[0][1].text).toContain('Mood Diary');
      expect(inline_keyboard[1][0].text).toContain('Nutrition');
      expect(inline_keyboard[1][1].text).toContain('Settings');
    });

    it('структура клавиатуры и callback_data идентичны для обоих языков', async () => {
      // Test with Russian
      mockT.mockImplementation((chatId, key) => {
        const ru = {
          'menu.my_week': '📋 Моя неделя',
          'menu.mood_diary': '😊 Дневник настроения',
          'menu.nutrition': '🍎 Питание',
          'menu.settings': '⚙️ Настройки',
        };
        return Promise.resolve(ru[key] || key);
      });

      await showMainMenu(CHAT_ID);

      const rusKeyboard = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard;

      // Clear and test with English
      vi.clearAllMocks();
      mockT.mockImplementation((chatId, key) => {
        const en = {
          'menu.my_week': '📋 My Week',
          'menu.mood_diary': '😊 Mood Diary',
          'menu.nutrition': '🍎 Nutrition',
          'menu.settings': '⚙️ Settings',
        };
        return Promise.resolve(en[key] || key);
      });

      await showMainMenu(CHAT_ID);

      const engKeyboard = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard;

      // Structure is identical
      expect(rusKeyboard).toHaveLength(2);
      expect(engKeyboard).toHaveLength(2);
      rusKeyboard.forEach((row, ri) => {
        expect(row).toHaveLength(2);
        expect(engKeyboard[ri]).toHaveLength(2);
        row.forEach((btn, ci) => {
          expect(engKeyboard[ri][ci].callback_data).toBe(btn.callback_data);
        });
      });
    });
  });

  // ----- Input validation -----

  describe('input validation', () => {
    it('showMainMenu(null) выбрасывает Error("chatId is required") синхронно', () => {
      expect(() => showMainMenu(null)).toThrow('chatId is required');
    });

    it('showMainMenu(undefined) выбрасывает Error("chatId is required") синхронно', () => {
      expect(() => showMainMenu(undefined)).toThrow('chatId is required');
    });

    it('showMainMenu(0) НЕ выбрасывает (0 — валидный chatId)', async () => {
      mockT.mockResolvedValue('header');
      mockSendMessage.mockResolvedValue({ ok: true });

      await expect(showMainMenu(0)).resolves.not.toThrow();
    });

    it('showMainMenu("") НЕ выбрасывает (пустая строка — валидный строковый chatId)', async () => {
      mockT.mockResolvedValue('header');
      mockSendMessage.mockResolvedValue({ ok: true });

      await expect(showMainMenu('')).resolves.not.toThrow();
    });
  });

  // ----- Return value -----

  describe('return value', () => {
    it('showMainMenu возвращает результат вызова _sendMessage', async () => {
      const expectedResult = { ok: true, result: { message_id: 99 } };
      mockSendMessage.mockResolvedValue(expectedResult);

      const result = await showMainMenu(CHAT_ID);

      expect(result).toBe(expectedResult);
    });

    it('если _sendMessage резолвится с { ok: true, result: { message_id: 42 } }, showMainMenu возвращает этот же объект', async () => {
      const telegramResponse = { ok: true, result: { message_id: 42 } };
      mockSendMessage.mockResolvedValue(telegramResponse);

      const result = await showMainMenu(CHAT_ID);

      expect(result).toEqual(telegramResponse);
    });
  });

  // ----- Error handling -----

  describe('error handling', () => {
    it('если _t выбрасывает для одного из ключей кнопки, ошибка пробрасывается', async () => {
      const testError = new Error('Translation failed');
      mockT.mockImplementation((chatId, key) => {
        if (key === 'menu.nutrition') {
          return Promise.reject(testError);
        }
        return Promise.resolve(DEFAULT_T_VALUES[key] || key);
      });

      await expect(showMainMenu(CHAT_ID)).rejects.toThrow('Translation failed');
    });
  });
});
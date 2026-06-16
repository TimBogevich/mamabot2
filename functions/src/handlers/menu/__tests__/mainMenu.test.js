/**
 * @fileoverview Tests for the mainMenu module (showMainMenu and __inject).
 */

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.TELEGRAM_TOKEN = 'test-token-for-module-load';

const mockT = vi.fn();
const mockSendMessage = vi.fn();

const { createRequire } = require('node:module');
const req = createRequire(import.meta.url);
const { showMainMenu, __inject } = req('../mainMenu.js');

__inject({ t: mockT, sendMessage: mockSendMessage });

const CHAT_ID = 12345;

const DEFAULT_T_VALUES = {
  'menu.my_week': 'Моя неделя',
  'menu.mood_diary': 'Дневник настроения',
  'menu.nutrition': 'Питание',
  'menu.invite_partner': 'Пригласить партнёра',
  'menu.settings': 'Настройки',
  'menu.help': 'Помощь',
};

function setupDefaultMockT() {
  mockT.mockImplementation((chatId, key) => {
    return Promise.resolve(DEFAULT_T_VALUES[key] || key);
  });
}

function setupDefaultMockSendMessage() {
  mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
}

describe('showMainMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMockT();
    setupDefaultMockSendMessage();
  });

  describe('t() calls', () => {
    it('вызывает _t ровно 7 раз: заголовок + 6 подписей кнопок', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockT).toHaveBeenCalledTimes(7);
    });

    it('все вызовы _t используют правильный chatId и ключи', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockT).toHaveBeenNthCalledWith(1, CHAT_ID, 'menu.my_week');
      expect(mockT).toHaveBeenNthCalledWith(2, CHAT_ID, 'menu.my_week');
      expect(mockT).toHaveBeenNthCalledWith(3, CHAT_ID, 'menu.mood_diary');
      expect(mockT).toHaveBeenNthCalledWith(4, CHAT_ID, 'menu.nutrition');
      expect(mockT).toHaveBeenNthCalledWith(5, CHAT_ID, 'menu.invite_partner');
      expect(mockT).toHaveBeenNthCalledWith(6, CHAT_ID, 'menu.settings');
      expect(mockT).toHaveBeenNthCalledWith(7, CHAT_ID, 'menu.help');
    });

    it('порядок вызовов _t: заголовок, затем кнопки', async () => {
      const callOrder = [];
      mockT.mockImplementation((chatId, key) => {
        callOrder.push(key);
        return Promise.resolve(DEFAULT_T_VALUES[key] || key);
      });
      await showMainMenu(CHAT_ID);
      expect(callOrder).toEqual([
        'menu.my_week',
        'menu.my_week',
        'menu.mood_diary',
        'menu.nutrition',
        'menu.invite_partner',
        'menu.settings',
        'menu.help',
      ]);
    });
  });

  describe('inline keyboard structure', () => {
    it('_sendMessage вызывается с chatId = 12345', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, expect.any(String), expect.any(Object));
    });

    it('третий аргумент _sendMessage содержит reply_markup с inline_keyboard', async () => {
      await showMainMenu(CHAT_ID);
      const options = mockSendMessage.mock.calls[0][2];
      expect(options).toHaveProperty('reply_markup');
      expect(options.reply_markup).toHaveProperty('inline_keyboard');
    });

    it('inline_keyboard — массив из 4 строк (рядов)', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard).toHaveLength(4);
    });

    it('первый ряд содержит 2 кнопки: my_week и mood_diary', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0]).toHaveLength(2);
      expect(inline_keyboard[0][0].callback_data).toBe('menu_my_week');
      expect(inline_keyboard[0][1].callback_data).toBe('menu_mood_diary');
    });

    it('второй ряд содержит 2 кнопки: nutrition и invite_partner', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[1]).toHaveLength(2);
      expect(inline_keyboard[1][0].callback_data).toBe('menu_nutrition');
      expect(inline_keyboard[1][1].callback_data).toBe('menu_invite_partner');
    });

    it('третий ряд содержит 1 кнопку: settings', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[2]).toHaveLength(1);
      expect(inline_keyboard[2][0].callback_data).toBe('menu_settings');
    });

    it('четвёртый ряд содержит 1 кнопку: help', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[3]).toHaveLength(1);
      expect(inline_keyboard[3][0].callback_data).toBe('menu_help');
    });
  });

  describe('callback_data values', () => {
    it('menu_my_week', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0][0].callback_data).toBe('menu_my_week');
    });
    it('menu_mood_diary', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0][1].callback_data).toBe('menu_mood_diary');
    });
    it('menu_nutrition', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[1][0].callback_data).toBe('menu_nutrition');
    });
    it('menu_invite_partner', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[1][1].callback_data).toBe('menu_invite_partner');
    });
    it('menu_settings', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[2][0].callback_data).toBe('menu_settings');
    });
    it('menu_help', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[3][0].callback_data).toBe('menu_help');
    });
  });

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
  });

  describe('return value', () => {
    it('showMainMenu возвращает результат вызова _sendMessage', async () => {
      const expectedResult = { ok: true, result: { message_id: 99 } };
      mockSendMessage.mockResolvedValue(expectedResult);
      const result = await showMainMenu(CHAT_ID);
      expect(result).toBe(expectedResult);
    });
  });
});

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
  'menu.show_button': '📋 Главное меню',
  'menu.placeholder': 'Выбери раздел меню...',
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
    it('вызывает _t ровно 9 раз: заголовок + show_button + 6 reply-кнопок + placeholder', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockT).toHaveBeenCalledTimes(9);
    });

    it('все вызовы _t используют правильный chatId и ключи', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockT).toHaveBeenNthCalledWith(1, CHAT_ID, 'menu.my_week');
      expect(mockT).toHaveBeenNthCalledWith(2, CHAT_ID, 'menu.show_button');
      expect(mockT).toHaveBeenNthCalledWith(3, CHAT_ID, 'menu.my_week');
      expect(mockT).toHaveBeenNthCalledWith(4, CHAT_ID, 'menu.mood_diary');
      expect(mockT).toHaveBeenNthCalledWith(5, CHAT_ID, 'menu.nutrition');
      expect(mockT).toHaveBeenNthCalledWith(6, CHAT_ID, 'menu.invite_partner');
      expect(mockT).toHaveBeenNthCalledWith(7, CHAT_ID, 'menu.settings');
      expect(mockT).toHaveBeenNthCalledWith(8, CHAT_ID, 'menu.help');
      expect(mockT).toHaveBeenNthCalledWith(9, CHAT_ID, 'menu.placeholder');
    });

    it('порядок вызовов _t: заголовок, show_button, reply-кнопки, placeholder', async () => {
      const callOrder = [];
      mockT.mockImplementation((chatId, key) => {
        callOrder.push(key);
        return Promise.resolve(DEFAULT_T_VALUES[key] || key);
      });
      await showMainMenu(CHAT_ID);
      expect(callOrder).toEqual([
        'menu.my_week',
        'menu.show_button',
        'menu.my_week',
        'menu.mood_diary',
        'menu.nutrition',
        'menu.invite_partner',
        'menu.settings',
        'menu.help',
        'menu.placeholder',
      ]);
    });
  });

  describe('количество sendMessage', () => {
    it('_sendMessage вызывается ровно 2 раза (inline + reply)', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    it('первый вызов _sendMessage с chatId = 12345', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockSendMessage).toHaveBeenNthCalledWith(1, CHAT_ID, expect.any(String), expect.any(Object));
    });

    it('второй вызов _sendMessage с chatId = 12345', async () => {
      await showMainMenu(CHAT_ID);
      expect(mockSendMessage).toHaveBeenNthCalledWith(2, CHAT_ID, expect.any(String), expect.any(Object));
    });
  });

  describe('первый вызов — inline-сообщение', () => {
    it('третий аргумент содержит reply_markup с inline_keyboard', async () => {
      await showMainMenu(CHAT_ID);
      const options = mockSendMessage.mock.calls[0][2];
      expect(options).toHaveProperty('reply_markup');
      expect(options.reply_markup).toHaveProperty('inline_keyboard');
    });

    it('inline_keyboard — массив из 1 строки (1 ряд)', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard).toHaveLength(1);
    });

    it('единственный ряд содержит 1 кнопку с callback_data = menu_show', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0]).toHaveLength(1);
      expect(inline_keyboard[0][0].callback_data).toBe('menu_show');
    });

    it('текст inline-кнопки — menu.show_button', async () => {
      await showMainMenu(CHAT_ID);
      const { inline_keyboard } = mockSendMessage.mock.calls[0][2].reply_markup;
      expect(inline_keyboard[0][0].text).toBe('📋 Главное меню');
    });

    it('первый вызов не содержит keyboard', async () => {
      await showMainMenu(CHAT_ID);
      const options = mockSendMessage.mock.calls[0][2];
      expect(options.reply_markup).not.toHaveProperty('keyboard');
    });

    it('первый вызов не содержит resize_keyboard', async () => {
      await showMainMenu(CHAT_ID);
      const options = mockSendMessage.mock.calls[0][2];
      expect(options.reply_markup).not.toHaveProperty('resize_keyboard');
    });
  });

  describe('второй вызов — reply-клавиатура', () => {
    it('третий аргумент содержит reply_markup с keyboard', async () => {
      await showMainMenu(CHAT_ID);
      const options = mockSendMessage.mock.calls[1][2];
      expect(options).toHaveProperty('reply_markup');
      expect(options.reply_markup).toHaveProperty('keyboard');
    });

    it('keyboard — массив из 3 строк (3 ряда)', async () => {
      await showMainMenu(CHAT_ID);
      const { keyboard } = mockSendMessage.mock.calls[1][2].reply_markup;
      expect(keyboard).toHaveLength(3);
    });

    it('первый ряд содержит 2 кнопки: my_week и mood_diary', async () => {
      await showMainMenu(CHAT_ID);
      const { keyboard } = mockSendMessage.mock.calls[1][2].reply_markup;
      expect(keyboard[0]).toHaveLength(2);
      expect(keyboard[0][0].text).toBe('Моя неделя');
      expect(keyboard[0][1].text).toBe('Дневник настроения');
    });

    it('второй ряд содержит 2 кнопки: nutrition и invite_partner', async () => {
      await showMainMenu(CHAT_ID);
      const { keyboard } = mockSendMessage.mock.calls[1][2].reply_markup;
      expect(keyboard[1]).toHaveLength(2);
      expect(keyboard[1][0].text).toBe('Питание');
      expect(keyboard[1][1].text).toBe('Пригласить партнёра');
    });

    it('третий ряд содержит 2 кнопки: settings и help', async () => {
      await showMainMenu(CHAT_ID);
      const { keyboard } = mockSendMessage.mock.calls[1][2].reply_markup;
      expect(keyboard[2]).toHaveLength(2);
      expect(keyboard[2][0].text).toBe('Настройки');
      expect(keyboard[2][1].text).toBe('Помощь');
    });

    it('resize_keyboard = true', async () => {
      await showMainMenu(CHAT_ID);
      const { resize_keyboard } = mockSendMessage.mock.calls[1][2].reply_markup;
      expect(resize_keyboard).toBe(true);
    });

    it('input_field_placeholder установлен', async () => {
      await showMainMenu(CHAT_ID);
      const { input_field_placeholder } = mockSendMessage.mock.calls[1][2].reply_markup;
      expect(input_field_placeholder).toBe('Выбери раздел меню...');
    });

    it('второй вызов не содержит inline_keyboard', async () => {
      await showMainMenu(CHAT_ID);
      const options = mockSendMessage.mock.calls[1][2];
      expect(options.reply_markup).not.toHaveProperty('inline_keyboard');
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
    it('showMainMenu возвращает результат ПЕРВОГО вызова _sendMessage (inline)', async () => {
      const expectedResult = { ok: true, result: { message_id: 99 } };
      mockSendMessage.mockResolvedValue(expectedResult);
      const result = await showMainMenu(CHAT_ID);
      expect(result).toBe(expectedResult);
    });
  });
});

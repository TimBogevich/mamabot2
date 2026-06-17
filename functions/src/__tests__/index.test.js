/**
 * Tests for Telegram token resolution and webhook behavior.
 *
 * The Telegram token is resolved lazily via getTelegramToken() from process.env.TELEGRAM_TOKEN.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const TEST_TOKEN = 'test:resolved-token-12345';
const TELEGRAM_API_URL = 'https://api.telegram.org';

const req = createRequire(import.meta.url);

function cleanSlate() {
  delete process.env.TELEGRAM_TOKEN;

  try {
    const tgPath = req.resolve('../utils/telegram.js');
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }
  try {
    const tgPath = req.resolve('../../src/utils/telegram.js');
    delete req.cache[tgPath];
  } catch { /* not cached yet */ }

  vi.resetModules();
}

describe('TELEGRAM_API constant', () => {
  beforeEach(() => {
    cleanSlate();
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_TOKEN;
  });

  it('remains the standard Telegram API URL (https://api.telegram.org)', async () => {
    const mod = await import('../utils/telegram.js');
    expect(mod.TELEGRAM_API).toBe(TELEGRAM_API_URL);
  });
});

describe('TELEGRAM_TOKEN resolution', () => {
  beforeEach(() => {
    cleanSlate();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_TOKEN;
  });

  it('uses TELEGRAM_TOKEN env var when set', async () => {
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;

    const mod = await import('../utils/telegram.js');
    expect(mod.getTelegramToken()).toBe(TEST_TOKEN);
  });

  it('throws a clear error when TELEGRAM_TOKEN is not set', async () => {
    delete process.env.TELEGRAM_TOKEN;

    const mod = await import('../utils/telegram.js');
    expect(() => mod.getTelegramToken()).toThrow(
      'TELEGRAM_TOKEN not configured',
    );
  });
});

// ---------------------------------------------------------------------------
// Reply keyboard text routing — handleReplyKeyboardText
// ---------------------------------------------------------------------------

describe('handleReplyKeyboardText', () => {
  let mockT;
  let mockSendMessage;
  let mockShowWeekInfo;
  let mockShowMoodMenu;
  let mockShowNutritionMenu;
  let mockShowPartnerMenu;
  let mockShowSettingsMenu;
  let mockShowMainMenu;
  let handleReplyKeyboardTextFn;
  let injectFn;

  beforeEach(() => {
    cleanSlate();
    process.env.TELEGRAM_TOKEN = TEST_TOKEN;

    mockT = vi.fn();
    mockSendMessage = vi.fn();
    mockShowWeekInfo = vi.fn();
    mockShowMoodMenu = vi.fn();
    mockShowNutritionMenu = vi.fn();
    mockShowPartnerMenu = vi.fn();
    mockShowSettingsMenu = vi.fn();
    mockShowMainMenu = vi.fn();

    // Load index.js with createRequire (same pattern as router.test.js)
    const req = createRequire(import.meta.url);

    const mod = req('../../index.js');
    handleReplyKeyboardTextFn = mod.handleReplyKeyboardText;
    injectFn = mod.__inject;

    // Inject mocks
    injectFn({
      t: mockT,
      sendMessage: mockSendMessage,
      showMainMenu: mockShowMainMenu,
      showWeekInfo: mockShowWeekInfo,
      showMoodMenu: mockShowMoodMenu,
      showNutritionMenu: mockShowNutritionMenu,
      showPartnerMenu: mockShowPartnerMenu,
      showSettingsMenu: mockShowSettingsMenu,
    });

    // Default mock implementations
    mockT.mockImplementation((_chatId, key) => {
      const labels = {
        'menu.my_week': 'Моя неделя',
        'menu.mood_diary': 'Дневник настроения',
        'menu.nutrition': 'Питание',
        'menu.invite_partner': 'Пригласить партнёра',
        'menu.settings': 'Настройки',
        'menu.help': 'Помощь',
        'menu.show_button': '📋 Главное меню',
        'help.message': 'Текст помощи',
        'error.generic': 'Произошла ошибка',
      };
      return Promise.resolve(labels[key] || key);
    });
    mockSendMessage.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env.TELEGRAM_TOKEN;
  });

  describe('reply button routing', () => {
    it('"Моя неделя" вызывает showWeekInfo с правильным chatId', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Моя неделя');
      expect(result).toBe(true);
      expect(mockShowWeekInfo).toHaveBeenCalledTimes(1);
      expect(mockShowWeekInfo).toHaveBeenCalledWith(12345);
    });

    it('"Дневник настроения" вызывает showMoodMenu с правильным chatId', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Дневник настроения');
      expect(result).toBe(true);
      expect(mockShowMoodMenu).toHaveBeenCalledTimes(1);
      expect(mockShowMoodMenu).toHaveBeenCalledWith(12345);
    });

    it('"Питание" вызывает showNutritionMenu с правильным chatId', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Питание');
      expect(result).toBe(true);
      expect(mockShowNutritionMenu).toHaveBeenCalledTimes(1);
      expect(mockShowNutritionMenu).toHaveBeenCalledWith(12345);
    });

    it('"Пригласить партнёра" вызывает showPartnerMenu с правильным chatId', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Пригласить партнёра');
      expect(result).toBe(true);
      expect(mockShowPartnerMenu).toHaveBeenCalledTimes(1);
      expect(mockShowPartnerMenu).toHaveBeenCalledWith(12345);
    });

    it('"Настройки" вызывает showSettingsMenu с правильным chatId', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Настройки');
      expect(result).toBe(true);
      expect(mockShowSettingsMenu).toHaveBeenCalledTimes(1);
      expect(mockShowSettingsMenu).toHaveBeenCalledWith(12345);
    });

    it('"Помощь" отправляет help.message и вызывает showMainMenu', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Помощь');
      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Текст помощи');
      expect(mockShowMainMenu).toHaveBeenCalledTimes(1);
      expect(mockShowMainMenu).toHaveBeenCalledWith(12345);
    });

    it('неизвестный текст возвращает false (не обработан)', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Какой-то другой текст');
      expect(result).toBe(false);
      expect(mockShowWeekInfo).not.toHaveBeenCalled();
      expect(mockShowMoodMenu).not.toHaveBeenCalled();
      expect(mockShowNutritionMenu).not.toHaveBeenCalled();
      expect(mockShowPartnerMenu).not.toHaveBeenCalled();
      expect(mockShowSettingsMenu).not.toHaveBeenCalled();
      expect(mockShowMainMenu).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('graceful degradation', () => {
    it('когда showWeekInfo = null, отправляет error.generic', async () => {
      injectFn({
        t: mockT,
        sendMessage: mockSendMessage,
        showMainMenu: mockShowMainMenu,
        showWeekInfo: null,
        showMoodMenu: mockShowMoodMenu,
        showNutritionMenu: mockShowNutritionMenu,
        showPartnerMenu: mockShowPartnerMenu,
        showSettingsMenu: mockShowSettingsMenu,
      });

      const result = await handleReplyKeyboardTextFn(12345, 'Моя неделя');
      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Произошла ошибка');
    });

    it('когда showMainMenu = null, "Помощь" отправляет help.message без вызова showMainMenu', async () => {
      injectFn({
        t: mockT,
        sendMessage: mockSendMessage,
        showMainMenu: null,
        showWeekInfo: mockShowWeekInfo,
        showMoodMenu: mockShowMoodMenu,
        showNutritionMenu: mockShowNutritionMenu,
        showPartnerMenu: mockShowPartnerMenu,
        showSettingsMenu: mockShowSettingsMenu,
      });

      const result = await handleReplyKeyboardTextFn(12345, 'Помощь');
      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Текст помощи');
      expect(mockShowMainMenu).not.toHaveBeenCalled();
    });
  });

  describe('i18n — english labels', () => {
    beforeEach(() => {
      mockT.mockImplementation((_chatId, key) => {
        const labels = {
          'menu.my_week': 'My Week',
          'menu.mood_diary': 'Mood Diary',
          'menu.nutrition': 'Nutrition',
          'menu.invite_partner': 'Invite Partner',
          'menu.settings': 'Settings',
          'menu.help': 'Help',
          'help.message': 'Help text',
          'error.generic': 'An error occurred',
        };
        return Promise.resolve(labels[key] || key);
      });
    });

    it('"My Week" вызывает showWeekInfo', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'My Week');
      expect(result).toBe(true);
      expect(mockShowWeekInfo).toHaveBeenCalledWith(12345);
    });

    it('"Mood Diary" вызывает showMoodMenu', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Mood Diary');
      expect(result).toBe(true);
      expect(mockShowMoodMenu).toHaveBeenCalledWith(12345);
    });

    it('"Help" отправляет помощь и вызывает showMainMenu', async () => {
      const result = await handleReplyKeyboardTextFn(12345, 'Help');
      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Help text');
      expect(mockShowMainMenu).toHaveBeenCalledWith(12345);
    });
  });
});
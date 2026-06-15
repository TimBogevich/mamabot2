/**
 * @fileoverview Tests for the settings submenu module (settingsMenu.js).
 *
 * Uses the __inject() testability hook to inject mock t(), setLanguage(),
 * getUser(), sendMessage(), db and showMainMenu() implementations,
 * following the same pattern as mainMenu.test.js and router.test.js.
 *
 * @module settingsMenu.test
 */

// ---------------------------------------------------------------------------
// Environment — prevent firebase-admin from hanging on credential lookups.
// ---------------------------------------------------------------------------

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.TELEGRAM_TOKEN = 'test-token-for-module-load';

// ---------------------------------------------------------------------------
// Mock function declarations (before require() to satisfy hoisting)
// ---------------------------------------------------------------------------

const mockT = vi.fn();
const mockSetLanguage = vi.fn();
const mockGetUser = vi.fn();
const mockSendMessage = vi.fn();
const mockShowMainMenu = vi.fn();

// Batch mock
const mockBatchCommit = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatch = {
  update: mockBatchUpdate,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
};

// Query snapshot mock
function createQuerySnapshot(docs) {
  return {
    forEach: (cb) => docs.forEach((d) => cb(d)),
    docs,
    empty: docs.length === 0,
  };
}

function createDocSnapshot(id) {
  return { id, ref: { id } };
}

const mockCollection = vi.fn();
const mockDb = {
  collection: mockCollection,
  batch: vi.fn(() => mockBatch),
};

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const { showSettingsMenu, handleSettingsCallback, __inject } = req('../settingsMenu.js');

// ---------------------------------------------------------------------------
// Inject mocks before any test runs
// ---------------------------------------------------------------------------

__inject({
  t: mockT,
  setLanguage: mockSetLanguage,
  getUser: mockGetUser,
  sendMessage: mockSendMessage,
  showMainMenu: mockShowMainMenu,
  db: mockDb,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = 12345;

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function restoreInjectDefaults() {
  __inject({
    t: mockT,
    setLanguage: mockSetLanguage,
    getUser: mockGetUser,
    sendMessage: mockSendMessage,
    showMainMenu: mockShowMainMenu,
    db: mockDb,
  });
}

function setupDefaults() {
  mockT.mockImplementation((_chatId, key) => Promise.resolve(key));
  mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 42 } });
  mockSetLanguage.mockResolvedValue('en');
  mockGetUser.mockResolvedValue({
    chatId: 12345,
    userId: '12345',
    firstName: 'Test',
    language: 'ru',
    lmpDate: '2026-03-15',
    currentWeek: 12,
    role: 'mom',
  });
  mockShowMainMenu.mockResolvedValue({ message_id: 99 });
  mockBatchCommit.mockResolvedValue(undefined);
  mockBatchUpdate.mockReturnThis();
  mockBatchDelete.mockReturnThis();
}

// ---------------------------------------------------------------------------
// Tests — showSettingsMenu
// ---------------------------------------------------------------------------

describe('showSettingsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает _t для заголовка и всех 4 кнопок', async () => {
    await showSettingsMenu(CHAT_ID);

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.title');
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.change_language');
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.view_lmp');
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.reset_data');
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'menu.back');
  });

  it('все вызовы _t используют правильный chatId', async () => {
    await showSettingsMenu(CHAT_ID);

    const calls = mockT.mock.calls;
    calls.forEach(([chatId]) => {
      expect(chatId).toBe(CHAT_ID);
    });
  });

  it('_sendMessage вызывается с chatId и текстом заголовка', async () => {
    mockT.mockResolvedValue('⚙️ Настройки');
    await showSettingsMenu(CHAT_ID);

    expect(mockSendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      '⚙️ Настройки',
      expect.any(Object),
    );
  });

  it('reply_markup.inline_keyboard содержит 3 ряда', async () => {
    await showSettingsMenu(CHAT_ID);

    const keyboard = mockSendMessage.mock.calls[0][2].reply_markup;
    expect(keyboard.inline_keyboard).toHaveLength(3);
  });

  it('ряд 1: 2 кнопки — settings_change_language и settings_view_lmp', async () => {
    await showSettingsMenu(CHAT_ID);

    const row1 = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard[0];
    expect(row1).toHaveLength(2);
    expect(row1[0].callback_data).toBe('settings_change_language');
    expect(row1[1].callback_data).toBe('settings_view_lmp');
  });

  it('ряд 2: 1 кнопка — settings_reset_data', async () => {
    await showSettingsMenu(CHAT_ID);

    const row2 = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard[1];
    expect(row2).toHaveLength(1);
    expect(row2[0].callback_data).toBe('settings_reset_data');
  });

  it('ряд 3: 1 кнопка — settings_back', async () => {
    await showSettingsMenu(CHAT_ID);

    const row3 = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard[2];
    expect(row3).toHaveLength(1);
    expect(row3[0].callback_data).toBe('settings_back');
  });

  it('возвращает результат _sendMessage', async () => {
    const result = await showSettingsMenu(CHAT_ID);

    expect(result).toEqual({ ok: true, result: { message_id: 42 } });
  });

  it('не выбрасывает при chatId = 0', async () => {
    await expect(showSettingsMenu(0)).resolves.toBeDefined();
  });

  // Валидация
  it('выбрасывает Error при chatId = null', () => {
    expect(() => showSettingsMenu(null)).toThrow('chatId is required');
  });

  it('выбрасывает Error при chatId = undefined', () => {
    expect(() => showSettingsMenu(undefined)).toThrow('chatId is required');
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → settings_change_language
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — settings_change_language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает _getUser(chatId)', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(mockGetUser).toHaveBeenCalledWith(CHAT_ID);
  });

  it('переключает ru → en при user.language = "ru"', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru' });
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(mockSetLanguage).toHaveBeenCalledWith(CHAT_ID, 'en');
  });

  it('переключает en → ru при user.language = "en"', async () => {
    mockGetUser.mockResolvedValue({ language: 'en' });
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(mockSetLanguage).toHaveBeenCalledWith(CHAT_ID, 'ru');
  });

  it('считает текущим ru при отсутствии user.language и переключает на en', async () => {
    mockGetUser.mockResolvedValue({ language: null });
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(mockSetLanguage).toHaveBeenCalledWith(CHAT_ID, 'en');
  });

  it('считает текущим ru при user = null и переключает на en', async () => {
    mockGetUser.mockResolvedValue(null);
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(mockSetLanguage).toHaveBeenCalledWith(CHAT_ID, 'en');
  });

  it('отправляет подтверждение с ключом settings.language_changed', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.language_changed');
    expect(mockSendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.language_changed',
    );
  });

  it('после подтверждения вызывает showSettingsMenu (через _sendMessage с клавиатурой)', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    // Первый sendMessage — подтверждение
    // Второй sendMessage — меню настроек (через showSettingsMenu)
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    const secondCallOptions = mockSendMessage.mock.calls[1][2];
    expect(secondCallOptions.reply_markup.inline_keyboard).toBeDefined();
  });

  it('возвращает { status: "language_changed", from, to }', async () => {
    const result = await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(result).toEqual({
      status: 'language_changed',
      from: 'ru',
      to: 'en',
    });
  });

  it('возвращает корректные from/to при смене en → ru', async () => {
    mockGetUser.mockResolvedValue({ language: 'en' });
    const result = await handleSettingsCallback(CHAT_ID, 'settings_change_language');

    expect(result).toEqual({
      status: 'language_changed',
      from: 'en',
      to: 'ru',
    });
  });

  it('пробрасывает ошибку _setLanguage (не глотает)', async () => {
    mockSetLanguage.mockRejectedValue(new Error('Firestore write failed'));

    await expect(
      handleSettingsCallback(CHAT_ID, 'settings_change_language'),
    ).rejects.toThrow('Firestore write failed');
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → settings_view_lmp
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — settings_view_lmp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает _getUser(chatId)', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockGetUser).toHaveBeenCalledWith(CHAT_ID);
  });

  it('форматирует дату в DD.MM.YYYY и отправляет через _t с ключом settings.lmp_date_display', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: '2026-03-15' });
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockT).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.lmp_date_display',
      { date: '15.03.2026' },
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.lmp_date_display',
    );
  });

  it('после показа LMP вызывает showSettingsMenu', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: '2026-03-15' });
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    const secondCallOptions = mockSendMessage.mock.calls[1][2];
    expect(secondCallOptions.reply_markup.inline_keyboard).toBeDefined();
  });

  it('возвращает { status: "lmp_shown", lmpDate }', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: '2026-03-15' });
    const result = await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(result).toEqual({
      status: 'lmp_shown',
      lmpDate: '2026-03-15',
    });
  });

  it('если user.lmpDate отсутствует → отправляет settings.lmp_not_set', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: null });
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.lmp_not_set');
    expect(mockSendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.lmp_not_set',
    );
  });

  it('если user = null → отправляет settings.lmp_not_set', async () => {
    mockGetUser.mockResolvedValue(null);
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.lmp_not_set');
  });

  it('если lmpDate отсутствует → возвращает { status: "lmp_not_set" }', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: null });
    const result = await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(result).toEqual({ status: 'lmp_not_set' });
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → settings_reset_data (подтверждение)
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — settings_reset_data (подтверждение)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает _t для reset_confirm, reset_yes, reset_no', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_reset_data');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.reset_confirm');
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.reset_yes');
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.reset_no');
  });

  it('отправляет сообщение с inline-клавиатурой из 1 ряда и 2 кнопок', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_reset_data');

    const keyboard = mockSendMessage.mock.calls[0][2].reply_markup;
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(2);
  });

  it('кнопка 1: callback_data = settings_confirm_reset', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_reset_data');

    const btn0 = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard[0][0];
    expect(btn0.callback_data).toBe('settings_confirm_reset');
  });

  it('кнопка 2: callback_data = settings_cancel_reset', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_reset_data');

    const btn1 = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard[0][1];
    expect(btn1.callback_data).toBe('settings_cancel_reset');
  });

  it('возвращает { status: "reset_confirmation_shown" }', async () => {
    const result = await handleSettingsCallback(CHAT_ID, 'settings_reset_data');

    expect(result).toEqual({ status: 'reset_confirmation_shown' });
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → settings_confirm_reset (выполнение сброса)
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — settings_confirm_reset (выполнение сброса)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  function setupBatchMocks(moodDocs, nutritionDocs) {
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({})),
        };
      }
      if (name === 'mood_logs') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(() => createQuerySnapshot(moodDocs)),
          })),
        };
      }
      if (name === 'nutrition_logs') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(() => createQuerySnapshot(nutritionDocs)),
          })),
        };
      }
      return { where: vi.fn(), doc: vi.fn() };
    });
  }

  it('создаёт batch и запрашивает mood_logs и nutrition_logs', async () => {
    setupBatchMocks([], []);
    await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    // Проверяем, что batch создан
    expect(mockDb.batch).toHaveBeenCalledTimes(1);

    // Проверяем запросы к коллекциям
    expect(mockCollection).toHaveBeenCalledWith('mood_logs');
    expect(mockCollection).toHaveBeenCalledWith('nutrition_logs');
  });

  it('добавляет в batch обновление users/{chatId} (lmpDate=null, currentWeek=null)', async () => {
    setupBatchMocks([], []);

    // Create a proper doc ref mock for users
    const mockUserDocRef = { id: String(CHAT_ID) };
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => mockUserDocRef),
        };
      }
      return {
        where: vi.fn(() => ({
          get: vi.fn(() => createQuerySnapshot([])),
        })),
      };
    });

    await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    // batch.update должен быть вызван для doc ref
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      mockUserDocRef,
      expect.objectContaining({
        lmpDate: null,
        currentWeek: null,
      }),
    );
  });

  it('добавляет в batch удаление всех mood_logs и nutrition_logs', async () => {
    const moodDocs = [createDocSnapshot('mood_1'), createDocSnapshot('mood_2')];
    const nutritionDocs = [createDocSnapshot('nut_1')];
    setupBatchMocks(moodDocs, nutritionDocs);

    await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    // 1 update + 2 deletes + 1 delete = 4 batch operations
    expect(mockBatchDelete).toHaveBeenCalledTimes(3);
  });

  it('коммитит batch', async () => {
    setupBatchMocks([], []);
    await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('после коммита отправляет settings.data_reset_done', async () => {
    setupBatchMocks([], []);
    await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'settings.data_reset_done');
    expect(mockSendMessage).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.data_reset_done',
    );
  });

  it('если _showMainMenu доступен → вызывает showMainMenu', async () => {
    setupBatchMocks([], []);
    await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('если _showMainMenu = null → не падает, не вызывает showMainMenu', async () => {
    __inject({ showMainMenu: null });
    setupBatchMocks([], []);
    mockSendMessage.mockResolvedValue({ ok: true });

    const result = await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(result).toEqual({ status: 'data_reset_done' });
    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });

  it('возвращает { status: "data_reset_done" } при успехе', async () => {
    setupBatchMocks([], []);
    const result = await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(result).toEqual({ status: 'data_reset_done' });
  });

  it('при ошибке batch.commit отправляет error.generic и возвращает статус reset_failed', async () => {
    mockBatchCommit.mockRejectedValue(new Error('Firestore batch failed'));
    setupBatchMocks([], []);

    const result = await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.generic');
    expect(result).toEqual({
      status: 'reset_failed',
      error: 'Firestore batch failed',
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → settings_cancel_reset
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — settings_cancel_reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает showSettingsMenu (через _sendMessage с клавиатурой)', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_cancel_reset');

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const options = mockSendMessage.mock.calls[0][2];
    expect(options.reply_markup.inline_keyboard).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → settings_back
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — settings_back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает _showMainMenu(chatId) когда доступен', async () => {
    const result = await handleSettingsCallback(CHAT_ID, 'settings_back');

    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
    expect(result).toEqual({ status: 'back_to_menu' });
  });

  it('когда _showMainMenu = null → отправляет menu.back и возвращает back_unavailable', async () => {
    __inject({ showMainMenu: null });
    mockSendMessage.mockResolvedValue({ ok: true });

    const result = await handleSettingsCallback(CHAT_ID, 'settings_back');

    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'menu.back');
    expect(mockSendMessage).toHaveBeenCalledWith(CHAT_ID, 'menu.back');
    expect(result).toEqual({ status: 'back_unavailable' });
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback → неизвестный callback
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — неизвестный callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('неизвестный callback → вызывает showSettingsMenu', async () => {
    await handleSettingsCallback(CHAT_ID, 'settings_unknown');

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const options = mockSendMessage.mock.calls[0][2];
    expect(options.reply_markup.inline_keyboard).toBeDefined();
  });

  it('пустая строка → вызывает showSettingsMenu', async () => {
    await handleSettingsCallback(CHAT_ID, '');

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSettingsCallback валидация
// ---------------------------------------------------------------------------

describe('handleSettingsCallback — валидация chatId', () => {
  it('chatId = null → rejected promise с Error', async () => {
    await expect(handleSettingsCallback(null, 'settings_back')).rejects.toThrow('chatId is required');
  });

  it('chatId = undefined → rejected promise с Error', async () => {
    await expect(handleSettingsCallback(undefined, 'settings_back')).rejects.toThrow('chatId is required');
  });
});

// ---------------------------------------------------------------------------
// Tests — форматирование даты
// ---------------------------------------------------------------------------

describe('formatLmpDate (внутренняя)', () => {
  // Тестируем через handleViewLmp — проверяем передачу форматированной даты
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('2026-03-15 → date = 15.03.2026', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: '2026-03-15' });
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockT).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.lmp_date_display',
      { date: '15.03.2026' },
    );
  });

  it('2026-01-01 → date = 01.01.2026', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: '2026-01-01' });
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockT).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.lmp_date_display',
      { date: '01.01.2026' },
    );
  });

  it('2025-12-31 → date = 31.12.2025', async () => {
    mockGetUser.mockResolvedValue({ lmpDate: '2025-12-31' });
    await handleSettingsCallback(CHAT_ID, 'settings_view_lmp');

    expect(mockT).toHaveBeenCalledWith(
      CHAT_ID,
      'settings.lmp_date_display',
      { date: '31.12.2025' },
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — graceful degradation
// ---------------------------------------------------------------------------

describe('graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('_showMainMenu = null: settings_back не падает', async () => {
    __inject({ showMainMenu: null });
    mockSendMessage.mockResolvedValue({ ok: true });

    const result = await handleSettingsCallback(CHAT_ID, 'settings_back');

    expect(result).toEqual({ status: 'back_unavailable' });
  });

  it('_showMainMenu = null: settings_confirm_reset не падает (не вызывает меню)', async () => {
    __inject({ showMainMenu: null });

    // Setup batch mocks for successful reset
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return { doc: vi.fn(() => ({})) };
      }
      return {
        where: vi.fn(() => ({
          get: vi.fn(() => createQuerySnapshot([])),
        })),
      };
    });

    mockSendMessage.mockResolvedValue({ ok: true });
    mockDb.batch.mockReturnValue(mockBatch);

    const result = await handleSettingsCallback(CHAT_ID, 'settings_confirm_reset');

    expect(result).toEqual({ status: 'data_reset_done' });
  });

  it('_getUser выбрасывает ошибку при settings_change_language — ошибка пробрасывается', async () => {
    mockGetUser.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(
      handleSettingsCallback(CHAT_ID, 'settings_change_language'),
    ).rejects.toThrow('Firestore unavailable');
  });
});

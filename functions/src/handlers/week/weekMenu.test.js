/**
 * @fileoverview Unit-тесты обработчика раздела «Моя неделя».
 *
 * Все зависимости мокируются через __inject. Firestore-запросы не выполняются.
 */

// ---------------------------------------------------------------------------
// Vitest globals (enabled in vitest.config.mjs)
// ---------------------------------------------------------------------------

const mockT = vi.fn();
const mockGetUser = vi.fn();
const mockSendMessage = vi.fn();
const mockShowMainMenu = vi.fn();

const mockDbCollection = vi.fn();
const mockDoc = vi.fn();
const mockGet = vi.fn();
const mockSnap = { exists: false, id: '', data: () => ({}) };

const mockDb = {
  collection: (...args) => {
    mockDbCollection(...args);
    return { doc: mockDoc };
  },
};

// Reset all mocks and re-inject before each test
beforeEach(() => {
  vi.resetAllMocks();
  mockDoc.mockReturnValue({ get: mockGet });
  mockGet.mockResolvedValue(mockSnap);

  const { __inject } = require('./weekMenu');
  __inject({
    t: mockT,
    getUser: mockGetUser,
    sendMessage: mockSendMessage,
    db: mockDb,
    showMainMenu: mockShowMainMenu,
  });
});

const { showWeekInfo, handleWeekCallback } = require('./weekMenu');

describe('showWeekInfo', () => {
  it('отклоняет null chatId синхронно', () => {
    expect(() => showWeekInfo(null)).toThrow('chatId is required');
    expect(() => showWeekInfo(undefined)).toThrow('chatId is required');
  });

  it('показывает no_lmp если пользователь не найден', async () => {
    mockGetUser.mockResolvedValue(null);
    mockT.mockImplementation((_chatId, key) => Promise.resolve(key));

    const result = await showWeekInfo(12345);

    expect(mockT).toHaveBeenCalledWith(12345, 'week.no_lmp');
    expect(mockSendMessage).toHaveBeenCalledWith(12345, 'week.no_lmp');
    expect(mockShowMainMenu).toHaveBeenCalledWith(12345);
    expect(result).toEqual({ status: 'no_lmp' });
  });

  it('показывает no_lmp если у пользователя нет lmpDate', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: null, currentWeek: null });
    mockT.mockImplementation((_chatId, key) => Promise.resolve(key));

    const result = await showWeekInfo(12345);

    expect(mockT).toHaveBeenCalledWith(12345, 'week.no_lmp');
    expect(result).toEqual({ status: 'no_lmp' });
  });

  it('показывает no_lmp если currentWeek вне диапазона', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 0 });
    mockT.mockImplementation((_chatId, key) => Promise.resolve(key));

    const result = await showWeekInfo(12345);

    expect(mockT).toHaveBeenCalledWith(12345, 'week.no_lmp');
    expect(result).toEqual({ status: 'invalid_week', week: 0 });
  });

  it('показывает no_data если данные недели не найдены', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 15 });
    mockT.mockImplementation((_chatId, key, vars) => {
      if (key === 'week.no_data') return Promise.resolve(`no_data_${vars.week}`);
      return Promise.resolve(key);
    });
    mockGet.mockResolvedValue({ exists: false, id: '', data: () => ({}) });

    const result = await showWeekInfo(12345);

    expect(mockSendMessage).toHaveBeenCalledWith(12345, 'no_data_15');
    expect(mockShowMainMenu).toHaveBeenCalled();
    expect(result).toEqual({ status: 'no_data', week: 15 });
  });

  it('показывает полную информацию о неделе', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 20 });
    const pregnancyData = {
      weekNumber: 20,
      babyDevelopment: 'Малыш активно двигается',
      motherChanges: 'Живот заметно вырос',
      babySize: 'с банан',
      babyWeightGrams: 300,
      nutritionTips: 'Ешьте больше железа',
      vitaminRecommendations: 'Принимайте витамин D',
      symptomsCommon: 'Изжога и усталость',
    };
    mockGet.mockResolvedValue({ exists: true, id: '20_ru', data: () => pregnancyData });

    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      if (key === 'week.label_size') return `Размер: ${vars.size}`;
      if (key === 'week.label_weight') return `Вес: ${vars.weight} г`;
      return key;
    });

    const result = await showWeekInfo(12345);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[0]).toBe(12345);
    expect(callArgs[1]).toContain('Неделя 20');
    expect(callArgs[1]).toContain('Малыш активно двигается');
    expect(callArgs[1]).toContain('Размер: с банан');
    expect(callArgs[1]).toContain('Вес: 300 г');

    const keyboard = callArgs[2].reply_markup;
    expect(keyboard).toBeDefined();
    expect(keyboard.inline_keyboard.length).toBeGreaterThanOrEqual(2);

    expect(result).toEqual({ status: 'week_shown', week: 20 });
  });

  it('загружает данные на языке пользователя (en)', async () => {
    mockGetUser.mockResolvedValue({ language: 'en', lmpDate: '2026-01-01', currentWeek: 10 });
    const pregnancyData = { weekNumber: 10, babyDevelopment: 'Baby is growing', babySize: 'strawberry', babyWeightGrams: 5 };
    mockGet.mockResolvedValue({ exists: true, id: '10_en', data: () => pregnancyData });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Week ${vars.week}`;
      return key;
    });

    await showWeekInfo(12345);

    expect(mockDoc).toHaveBeenCalledWith('10_en');
  });

  it('показывает корректную клавиатуру для первой недели (без prev)', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 1 });
    const data = { weekNumber: 1, babyDevelopment: '...', babySize: 'мак', babyWeightGrams: 1 };
    mockGet.mockResolvedValue({ exists: true, id: '1_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      if (key === 'week.next_week') return `Неделя ${vars.week} ▶️`;
      if (key === 'week.back_to_menu') return 'Назад';
      return key;
    });

    await showWeekInfo(12345);

    const keyboard = mockSendMessage.mock.calls[0][2].reply_markup;
    const navRow = keyboard.inline_keyboard[0];
    expect(navRow.length).toBe(1);
    expect(navRow[0].callback_data).toBe('week_show_2');
  });

  it('показывает корректную клавиатуру для последней недели (без next)', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 40 });
    const data = { weekNumber: 40, babyDevelopment: '...', babySize: 'арбуз', babyWeightGrams: 3500 };
    mockGet.mockResolvedValue({ exists: true, id: '40_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      if (key === 'week.prev_week') return `◀️ ${vars.week} неделя`;
      if (key === 'week.back_to_menu') return 'Назад';
      return key;
    });

    await showWeekInfo(12345);

    const keyboard = mockSendMessage.mock.calls[0][2].reply_markup;
    const navRow = keyboard.inline_keyboard[0];
    expect(navRow.length).toBe(1);
    expect(navRow[0].callback_data).toBe('week_show_39');
  });
});

describe('handleWeekCallback', () => {
  it('отклоняет null chatId', async () => {
    await expect(handleWeekCallback(null, 'week_show')).rejects.toThrow('chatId is required');
  });

  it('menu_my_week показывает текущую неделю', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 12 });
    const data = { weekNumber: 12, babyDevelopment: '...', babySize: 'лайм', babyWeightGrams: 14 };
    mockGet.mockResolvedValue({ exists: true, id: '12_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      return key;
    });

    const result = await handleWeekCallback(12345, 'menu_my_week');

    expect(result).toEqual({ status: 'week_shown', week: 12 });
  });

  it('week_back показывает текущую неделю', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 8 });
    const data = { weekNumber: 8, babyDevelopment: '...', babySize: 'малина', babyWeightGrams: 2 };
    mockGet.mockResolvedValue({ exists: true, id: '8_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      return key;
    });

    const result = await handleWeekCallback(12345, 'week_back');

    expect(result).toEqual({ status: 'week_shown', week: 8 });
  });

  it('week_show_N показывает указанную неделю', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 10 });
    const data = { weekNumber: 25, babyDevelopment: '...', babySize: 'цветная капуста', babyWeightGrams: 700 };
    mockGet.mockResolvedValue({ exists: true, id: '25_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      return key;
    });

    const result = await handleWeekCallback(12345, 'week_show_25');

    expect(result).toEqual({ status: 'week_shown', week: 25 });
    expect(mockDoc).toHaveBeenCalledWith('25_ru');
  });

  it('игнорирует некорректный callback и падает в showWeekInfo (no_user)', async () => {
    mockGetUser.mockResolvedValue(null);
    mockT.mockImplementation((_chatId, key) => Promise.resolve(key));

    const result = await handleWeekCallback(12345, 'week_unknown');

    expect(result).toEqual({ status: 'no_lmp' });
  });
});

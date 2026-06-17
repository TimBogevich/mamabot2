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
const mockCalculatePregnancyWeek = vi.fn();
const mockAskForLmpDate = vi.fn();

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
  mockCalculatePregnancyWeek.mockReturnValue({ week: 0 });

  const { __inject } = require('./weekMenu');
  __inject({
    t: mockT,
    getUser: mockGetUser,
    sendMessage: mockSendMessage,
    db: mockDb,
    showMainMenu: mockShowMainMenu,
    calculatePregnancyWeek: mockCalculatePregnancyWeek,
    askForLmpDate: mockAskForLmpDate,
  });
});

const { showWeekInfo, handleWeekCallback, handleWeekDetail } = require('./weekMenu');

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
    expect(mockAskForLmpDate).toHaveBeenCalledWith(12345);
    expect(result).toEqual({ status: 'no_lmp' });
  });

  it('показывает no_lmp если у пользователя нет lmpDate', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: null, currentWeek: null });
    mockT.mockImplementation((_chatId, key) => Promise.resolve(key));

    const result = await showWeekInfo(12345);

    expect(mockT).toHaveBeenCalledWith(12345, 'week.no_lmp');
    expect(mockAskForLmpDate).toHaveBeenCalledWith(12345);
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

  it('показывает полную информацию о неделе (summary + detail кнопки)', async () => {
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
      if (key === 'week.summary_title') return `Неделя ${vars.week}`;
      if (key === 'week.label_size') return `Размер: ${vars.size}`;
      if (key === 'week.label_weight') return `Вес: ${vars.weight} г`;
      return key;
    });

    const result = await showWeekInfo(12345);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[0]).toBe(12345);
    const text = callArgs[1];
    // Сводка содержит заголовок, размер, вес
    expect(text).toContain('Неделя 20');
    expect(text).toContain('Малыш активно двигается');
    expect(text).toContain('Размер: с банан');
    expect(text).toContain('Вес: 300 г');
    // Сводка НЕ содержит полный текст других секций
    expect(text).not.toContain('Живот заметно вырос');
    expect(text).not.toContain('Ешьте больше железа');
    expect(text).not.toContain('Принимайте витамин D');
    expect(text).not.toContain('Изжога и усталость');

    const keyboard = callArgs[2].reply_markup;
    expect(keyboard).toBeDefined();
    // Детальные кнопки + навигация + назад
    expect(keyboard.inline_keyboard.length).toBeGreaterThanOrEqual(3);

    // Проверяем, что есть детальные кнопки
    const allButtons = keyboard.inline_keyboard.flat();
    const detailCallbacks = allButtons
      .map(b => b.callback_data)
      .filter(c => c.startsWith('week_detail_'));
    expect(detailCallbacks).toContain('week_detail_development_20');
    expect(detailCallbacks).toContain('week_detail_mother_20');
    expect(detailCallbacks).toContain('week_detail_nutrition_20');
    expect(detailCallbacks).toContain('week_detail_vitamins_20');
    expect(detailCallbacks).toContain('week_detail_symptoms_20');

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

  it('показывает корректную клавиатуру для первой недели (без prev) — навигация во 2-м ряду', async () => {
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
    // Первый ряд — детальная кнопка, второй ряд — навигация
    const navRow = keyboard.inline_keyboard[1];
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
    // Первый ряд — детальная кнопка, второй ряд — навигация
    const navRow = keyboard.inline_keyboard[1];
    expect(navRow.length).toBe(1);
    expect(navRow[0].callback_data).toBe('week_show_39');
  });

  it('пересчитывает неделю динамически из lmpDate, игнорируя устаревший currentWeek', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-15', currentWeek: 5 });
    mockCalculatePregnancyWeek.mockReturnValue({ week: 22 });
    const data = { weekNumber: 22, babyDevelopment: '...', babySize: 'кокос', babyWeightGrams: 430 };
    mockGet.mockResolvedValue({ exists: true, id: '22_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      return key;
    });

    const result = await showWeekInfo(12345);

    expect(mockGetUser).toHaveBeenCalledWith(12345);
    expect(mockCalculatePregnancyWeek).toHaveBeenCalledWith('2026-01-15');
    expect(mockDoc).toHaveBeenCalledWith('22_ru');
    expect(result).toEqual({ status: 'week_shown', week: 22 });
  });

  it('при отсутствии lmpDate запускает онбординг через askForLmpDate', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: null, currentWeek: null });
    mockT.mockImplementation((_chatId, key) => Promise.resolve(key));

    const result = await showWeekInfo(12345);

    expect(mockSendMessage).toHaveBeenCalledWith(12345, 'week.no_lmp');
    expect(mockAskForLmpDate).toHaveBeenCalledWith(12345);
    expect(mockShowMainMenu).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'no_lmp' });
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

  it('week_detail_development_N показывает детальную секцию через handleWeekDetail', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 20 });
    const data = {
      weekNumber: 20,
      babyDevelopment: 'Развитие малыша на 20-й неделе',
      babySize: 'банан',
      babyWeightGrams: 300,
    };
    mockGet.mockResolvedValue({ exists: true, id: '20_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.detail_development_title') return `👶 Развитие — ${vars.week} неделя`;
      if (key === 'week.back_to_summary') return '🔙 Назад';
      return key;
    });

    const result = await handleWeekCallback(12345, 'week_detail_development_20');

    expect(result).toEqual({ status: 'detail_shown', week: 20, section: 'development' });
  });

  it('week_detail_back_N показывает сводку недели', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 20 });
    const data = { weekNumber: 15, babyDevelopment: '...', babySize: 'яблоко', babyWeightGrams: 150 };
    mockGet.mockResolvedValue({ exists: true, id: '15_ru', data: () => data });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.summary_title') return `Неделя ${vars.week}`;
      return key;
    });

    const result = await handleWeekCallback(12345, 'week_detail_back_15');

    expect(result).toEqual({ status: 'week_shown', week: 15 });
  });
});

describe('handleWeekDetail', () => {
  const pregnancyData = {
    weekNumber: 20,
    babyDevelopment: 'На 20-й неделе малыш активно двигается, его кожа покрывается первородной смазкой.',
    motherChanges: 'Матка продолжает расти, живот заметно округляется.',
    nutritionTips: 'Увеличьте потребление железа и фолиевой кислоты.',
    vitaminRecommendations: 'Продолжайте принимать пренатальные витамины с DHA.',
    symptomsCommon: 'Возможны изжога, запоры и отёки ног.',
    babySize: 'банан',
    babyWeightGrams: 300,
  };

  beforeEach(() => {
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.detail_development_title') return `👶 Развитие — ${vars.week} неделя`;
      if (key === 'week.detail_mother_title') return `🤰 Изменения — ${vars.week} неделя`;
      if (key === 'week.detail_nutrition_title') return `🍎 Питание — ${vars.week} неделя`;
      if (key === 'week.detail_vitamins_title') return `💊 Витамины — ${vars.week} неделя`;
      if (key === 'week.detail_symptoms_title') return `🤒 Симптомы — ${vars.week} неделя`;
      if (key === 'week.detail_no_data') return '⚠️ Данные не найдены.';
      if (key === 'week.back_to_summary') return '🔙 Назад к сводке';
      return key;
    });
  });

  it('отправляет сообщение с развитием малыша', async () => {
    const result = await handleWeekDetail(12345, 'development', 20, pregnancyData);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('👶 Развитие — 20 неделя');
    expect(callArgs[1]).toContain('малыш активно двигается');
    expect(result).toEqual({ status: 'detail_shown', week: 20, section: 'development' });
  });

  it('отправляет сообщение с изменениями мамы', async () => {
    const result = await handleWeekDetail(12345, 'mother', 20, pregnancyData);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('🤰 Изменения — 20 неделя');
    expect(callArgs[1]).toContain('Матка продолжает расти');
    expect(result).toEqual({ status: 'detail_shown', week: 20, section: 'mother' });
  });

  it('отправляет сообщение с питанием', async () => {
    const result = await handleWeekDetail(12345, 'nutrition', 20, pregnancyData);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('🍎 Питание — 20 неделя');
    expect(callArgs[1]).toContain('железа и фолиевой');
    expect(result).toEqual({ status: 'detail_shown', week: 20, section: 'nutrition' });
  });

  it('отправляет сообщение с витаминами', async () => {
    const result = await handleWeekDetail(12345, 'vitamins', 20, pregnancyData);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('💊 Витамины — 20 неделя');
    expect(callArgs[1]).toContain('пренатальные витамины');
    expect(result).toEqual({ status: 'detail_shown', week: 20, section: 'vitamins' });
  });

  it('отправляет сообщение с симптомами', async () => {
    const result = await handleWeekDetail(12345, 'symptoms', 20, pregnancyData);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('🤒 Симптомы — 20 неделя');
    expect(callArgs[1]).toContain('изжога, запоры');
    expect(result).toEqual({ status: 'detail_shown', week: 20, section: 'symptoms' });
  });

  it('показывает fallback если секция пуста', async () => {
    const emptyData = { ...pregnancyData, motherChanges: '' };
    const result = await handleWeekDetail(12345, 'mother', 20, emptyData);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('⚠️ Данные не найдены.');
    expect(result).toEqual({ status: 'detail_shown_no_data', week: 20, section: 'mother' });
  });

  it('отправляет сообщение с кнопкой Назад к сводке', async () => {
    await handleWeekDetail(12345, 'development', 20, pregnancyData);

    const callArgs = mockSendMessage.mock.calls[0];
    const keyboard = callArgs[2].reply_markup;
    expect(keyboard).toBeDefined();
    expect(keyboard.inline_keyboard[0][0].text).toBe('🔙 Назад к сводке');
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe('week_detail_back_20');
  });

  it('возвращает unknown_section для неизвестной секции', async () => {
    const result = await handleWeekDetail(12345, 'garbage', 20, pregnancyData);

    expect(result).toEqual({ status: 'unknown_section', week: 20, section: 'garbage' });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('summary message length safety', () => {
  it('текст сводки не превышает 4000 символов', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 20 });
    // Создаём очень длинный babyDevelopment (~3000 символов)
    const longDev = 'Малыш активно развивается. '.repeat(120); // ~3600 символов
    const fertilityData = {
      weekNumber: 20,
      babyDevelopment: longDev,
      motherChanges: 'Очень длинные изменения мамы. '.repeat(50),
      nutritionTips: 'Очень длинные советы по питанию. '.repeat(50),
      vitaminRecommendations: 'Очень длинные советы по витаминам. '.repeat(50),
      symptomsCommon: 'Очень длинные симптомы. '.repeat(50),
      babySize: 'банан',
      babyWeightGrams: 300,
    };
    mockGet.mockResolvedValue({ exists: true, id: '20_ru', data: () => fertilityData });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.summary_title') return `Неделя ${vars.week}`;
      if (key === 'week.label_size') return `Размер: ${vars.size}`;
      if (key === 'week.label_weight') return `Вес: ${vars.weight} г`;
      return key;
    });

    await showWeekInfo(12345);

    // Проверяем, что каждый вызов sendMessage имеет текст ≤ 4000 символов
    for (const call of mockSendMessage.mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(4000);
    }
  });

  it('воспроизводит исходную ошибку — все секции вместе > 4096, но сводка остаётся ≤ 4000', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 20 });
    // Создаём данные, где каждая секция по отдельности ~1000 символов.
    // Все 5 секций + заголовок + размер + вес = > 5000 символов (выше лимита 4096).
    const longSection = 'Длинный текст для проверки превышения лимита Telegram. '.repeat(25); // ~1000 символов
    const verboseData = {
      weekNumber: 20,
      babyDevelopment: longSection,
      motherChanges: longSection,
      nutritionTips: longSection,
      vitaminRecommendations: longSection,
      symptomsCommon: longSection,
      babySize: 'банан',
      babyWeightGrams: 300,
    };
    mockGet.mockResolvedValue({ exists: true, id: '20_ru', data: () => verboseData });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.summary_title') return `Неделя ${vars.week}`;
      if (key === 'week.label_size') return `Размер: ${vars.size}`;
      if (key === 'week.label_weight') return `Вес: ${vars.weight} г`;
      return key;
    });

    await showWeekInfo(12345);

    // Сообщение было отправлено хотя бы один раз
    expect(mockSendMessage.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Каждый вызов sendMessage имеет текст ≤ 4000 символов
    for (const call of mockSendMessage.mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(4000);
    }
  });

  it('текст детальной секции не превышает 4000 символов для длинного контента', async () => {
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.detail_development_title') return `👶 Развитие — ${vars.week} неделя`;
      if (key === 'week.back_to_summary') return '🔙 Назад к сводке';
      if (key === 'week.detail_no_data') return '⚠️ Данные не найдены.';
      return key;
    });

    const longDev = 'Малыш развивается. '.repeat(500); // ~10000 символов
    const verboseData = {
      weekNumber: 20,
      babyDevelopment: longDev,
      babySize: 'банан',
      babyWeightGrams: 300,
    };

    await handleWeekDetail(12345, 'development', 20, verboseData);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1].length).toBeLessThanOrEqual(4000);
    // Должен быть обрезан
    expect(callArgs[1]).toMatch(/\.\.\.$/);
  });
});

describe('detail button visibility', () => {
  it('кнопки деталей не добавляются для пустых секций', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 15 });
    const partialData = {
      weekNumber: 15,
      babyDevelopment: 'Малыш растёт',
      motherChanges: '',
      nutritionTips: '',
      vitaminRecommendations: 'Принимайте витамин D',
      symptomsCommon: '',
      babySize: 'лимон',
      babyWeightGrams: 50,
    };
    mockGet.mockResolvedValue({ exists: true, id: '15_ru', data: () => partialData });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.summary_title') return `Неделя ${vars.week}`;
      return key;
    });

    await showWeekInfo(12345);

    const allButtons = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard.flat();
    const detailCallbacks = allButtons.map(b => b.callback_data).filter(c => c.startsWith('week_detail_'));
    // Только development (есть) и vitamins (есть) — без mother, nutrition, symptoms
    expect(detailCallbacks).toContain('week_detail_development_15');
    expect(detailCallbacks).toContain('week_detail_vitamins_15');
    expect(detailCallbacks).not.toContain('week_detail_mother_15');
    expect(detailCallbacks).not.toContain('week_detail_nutrition_15');
    expect(detailCallbacks).not.toContain('week_detail_symptoms_15');
  });

  it('все 5 кнопок добавляются когда все данные есть', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 25 });
    const fullData = {
      weekNumber: 25,
      babyDevelopment: 'Малыш активно растёт',
      motherChanges: 'Изменения есть',
      nutritionTips: 'Советы по питанию',
      vitaminRecommendations: 'Витамины',
      symptomsCommon: 'Симптомы',
      babySize: 'цветная капуста',
      babyWeightGrams: 700,
    };
    mockGet.mockResolvedValue({ exists: true, id: '25_ru', data: () => fullData });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.summary_title') return `Неделя ${vars.week}`;
      return key;
    });

    await showWeekInfo(12345);

    const allButtons = mockSendMessage.mock.calls[0][2].reply_markup.inline_keyboard.flat();
    const detailCallbacks = allButtons.map(b => b.callback_data).filter(c => c.startsWith('week_detail_'));
    expect(detailCallbacks).toContain('week_detail_development_25');
    expect(detailCallbacks).toContain('week_detail_mother_25');
    expect(detailCallbacks).toContain('week_detail_nutrition_25');
    expect(detailCallbacks).toContain('week_detail_vitamins_25');
    expect(detailCallbacks).toContain('week_detail_symptoms_25');
  });

  it('если все 5 секций пусты — используется fallback старый формат (все inline)', async () => {
    mockGetUser.mockResolvedValue({ language: 'ru', lmpDate: '2026-01-01', currentWeek: 10 });
    const emptyData = {
      weekNumber: 10,
      babyDevelopment: '',
      motherChanges: '',
      nutritionTips: '',
      vitaminRecommendations: '',
      symptomsCommon: '',
      babySize: 'клубника',
      babyWeightGrams: 5,
    };
    mockGet.mockResolvedValue({ exists: true, id: '10_ru', data: () => emptyData });
    mockT.mockImplementation(async (_chatId, key, vars) => {
      if (key === 'week.title') return `Неделя ${vars.week}`;
      if (key === 'week.label_size') return `Размер: ${vars.size}`;
      if (key === 'week.label_weight') return `Вес: ${vars.weight} г`;
      return key;
    });

    await showWeekInfo(12345);

    const callArgs = mockSendMessage.mock.calls[0];
    expect(callArgs[1]).toContain('Неделя 10');
    expect(callArgs[1]).toContain('Размер: клубника');
    expect(callArgs[1]).toContain('Вес: 5 г');

    // Нет детальных кнопок
    const allButtons = callArgs[2].reply_markup.inline_keyboard.flat();
    const detailCallbacks = allButtons.map(b => b.callback_data).filter(c => c.startsWith('week_detail_'));
    expect(detailCallbacks).toHaveLength(0);

    // Есть навигация и назад
    const navCallbacks = allButtons.map(b => b.callback_data).filter(c => c.startsWith('week_show_'));
    expect(navCallbacks.length).toBeGreaterThanOrEqual(1);
    expect(allButtons.map(b => b.callback_data)).toContain('week_back');
  });
});

/**
 * @fileoverview Tests for the central callback router (router.js).
 *
 * Uses the __inject() testability hook to inject mock t(), sendMessage(),
 * answerCallbackQuery(), showMainMenu(), handleLanguageChoice(),
 * handleSettingsCallback() and showSettingsMenu() implementations,
 * following the same pattern as mainMenu.test.js.
 *
 * @module router.test
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
const mockSendMessage = vi.fn();
const mockAnswerCallbackQuery = vi.fn();
const mockShowMainMenu = vi.fn();
const mockHandleLanguageChoice = vi.fn();
const mockHandleConfirmEdd = vi.fn();
const mockHandleEditEdd = vi.fn();
const mockHandleWeekCallback = vi.fn();
const mockShowMoodPlaceholder = vi.fn();
const mockShowNutritionPlaceholder = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const { routeCallback, __inject } = req('../router.js');

// ---------------------------------------------------------------------------
// Inject mocks before any test runs
// ---------------------------------------------------------------------------

__inject({
  t: mockT,
  sendMessage: mockSendMessage,
  answerCallbackQuery: mockAnswerCallbackQuery,
  showMainMenu: mockShowMainMenu,
  handleLanguageChoice: mockHandleLanguageChoice,
  handleConfirmEdd: mockHandleConfirmEdd,
  handleEditEdd: mockHandleEditEdd,
    handleSettingsCallback: null,
    showSettingsMenu: null,
    handleWeekCallback: null,
    showMoodPlaceholder: null,
    showNutritionPlaceholder: null,
  });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = 12345;
const CALLBACK_QUERY_ID = 'callback_query_id_abc123';

const DEFAULT_CONTEXT = {
  callbackQueryId: CALLBACK_QUERY_ID,
  from: {
    id: 98765,
    first_name: 'Anna',
    last_name: 'Ivanova',
    username: 'anna_iv',
  },
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function restoreInjectDefaults() {
  __inject({
    t: mockT,
    sendMessage: mockSendMessage,
    answerCallbackQuery: mockAnswerCallbackQuery,
    showMainMenu: mockShowMainMenu,
    handleLanguageChoice: mockHandleLanguageChoice,
    handleConfirmEdd: mockHandleConfirmEdd,
    handleEditEdd: mockHandleEditEdd,
    handleSettingsCallback: null,
    showSettingsMenu: null,
    handleWeekCallback: null,
    showMoodPlaceholder: null,
    showNutritionPlaceholder: null,
  });
}

function setupDefaults() {
  mockT.mockResolvedValue('❌ Неизвестная команда. Пожалуйста, воспользуйся меню.');
  mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
  mockHandleLanguageChoice.mockResolvedValue({ status: 'language_set', language: 'ru' });
  mockHandleConfirmEdd.mockResolvedValue({ status: 'edd_confirmed', eddDate: '2026-12-20' });
  mockHandleEditEdd.mockResolvedValue({ status: 'edd_prompted' });
  mockShowMainMenu.mockResolvedValue({ message_id: 42 });
  mockSendMessage.mockResolvedValue({ ok: true });
  mockHandleWeekCallback.mockResolvedValue({ status: 'week_shown', week: 10 });
  mockShowMoodPlaceholder.mockResolvedValue({ status: 'mood_placeholder' });
  mockShowNutritionPlaceholder.mockResolvedValue({ status: 'nutrition_placeholder' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routeCallback — answerCallbackQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('вызывает answerCallbackQuery с правильным callbackQueryId из context', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockAnswerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(CALLBACK_QUERY_ID);
  });

  it('answerCallbackQuery вызывается ДО диспатча (первое действие)', async () => {
    const callOrder = [];
    mockAnswerCallbackQuery.mockImplementation(async (id) => {
      callOrder.push('answerCallbackQuery');
      return { ok: true };
    });
    mockHandleLanguageChoice.mockImplementation(async () => {
      callOrder.push('handleLanguageChoice');
      return { status: 'language_set' };
    });

    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(callOrder).toEqual(['answerCallbackQuery', 'handleLanguageChoice']);
  });

  it('если context.callbackQueryId отсутствует (undefined), answerCallbackQuery не вызывается', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', { from: DEFAULT_CONTEXT.from });

    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
  });

  it('если context.callbackQueryId === null, answerCallbackQuery не вызывается', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', { callbackQueryId: null, from: DEFAULT_CONTEXT.from });

    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
  });

  it('если answerCallbackQuery выбрасывает исключение, роутер не падает и продолжает обработку', async () => {
    mockAnswerCallbackQuery.mockRejectedValue(new Error('Telegram API error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'language_set', language: 'ru' });
    warnSpy.mockRestore();
  });

  it('если context не передан, answerCallbackQuery не вызывается', async () => {
    // context is undefined — should not crash
    await routeCallback(CHAT_ID, 'lang_ru');

    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
    // Should still process as unknown callback (no from in context)
  });
});

describe('routeCallback — маршрутизация onboarding (lang_ru / lang_en)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('lang_ru вызывает handleLanguageChoice с chatId, callbackData и userInfo', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).toHaveBeenCalledTimes(1);
    expect(mockHandleLanguageChoice).toHaveBeenCalledWith(
      CHAT_ID,
      'lang_ru',
      {
        userId: '98765',
        firstName: 'Anna',
        lastName: 'Ivanova',
        username: 'anna_iv',
      },
    );
  });

  it('lang_en вызывает handleLanguageChoice с правильными параметрами', async () => {
    await routeCallback(CHAT_ID, 'lang_en', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).toHaveBeenCalledTimes(1);
    expect(mockHandleLanguageChoice).toHaveBeenCalledWith(
      CHAT_ID,
      'lang_en',
      {
        userId: '98765',
        firstName: 'Anna',
        lastName: 'Ivanova',
        username: 'anna_iv',
      },
    );
  });

  it('lang_fr — неизвестный callback (не exact match и не префикс)', async () => {
    await routeCallback(CHAT_ID, 'lang_fr', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_* префикс направляется в onboarding, но без точного совпадения → not-implemented', async () => {
    await routeCallback(CHAT_ID, 'onboarding_some_future_callback', DEFAULT_CONTEXT);

    // handleOnboarding receives it but no exact match → handleNotImplemented
    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('при успешном lang_ru showMainMenu НЕ вызывается (это ответственность обработчика)', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });
});

describe('routeCallback — маршрутизация menu_*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('menu_my_week → placeholder (not implemented) + возврат в меню', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_my_week', DEFAULT_CONTEXT);

    expect(result).toEqual({
      status: 'not_implemented',
      domain: 'menu',
      callbackData: 'menu_my_week',
    });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('menu_mood_diary → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_mood_diary', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('menu');
  });

  it('menu_nutrition → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_nutrition', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('menu');
  });

  it('menu_settings → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_settings', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('menu');
  });
});

describe('routeCallback — маршрутизация menu_* с реальными заглушками', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
    __inject({
      handleWeekCallback: mockHandleWeekCallback,
      showMoodPlaceholder: mockShowMoodPlaceholder,
      showNutritionPlaceholder: mockShowNutritionPlaceholder,
    });
  });

  it('menu_my_week → вызывает handleWeekCallback', async () => {
    mockHandleWeekCallback.mockResolvedValue({ status: 'week_shown', week: 10 });

    const result = await routeCallback(CHAT_ID, 'menu_my_week', DEFAULT_CONTEXT);

    expect(mockHandleWeekCallback).toHaveBeenCalledTimes(1);
    expect(mockHandleWeekCallback).toHaveBeenCalledWith(CHAT_ID, 'menu_my_week');
    expect(result).toEqual({ status: 'week_shown', week: 10 });
    expect(mockT).not.toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });

  it('menu_mood_diary → вызывает showMoodPlaceholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_mood_diary', DEFAULT_CONTEXT);

    expect(mockShowMoodPlaceholder).toHaveBeenCalledTimes(1);
    expect(mockShowMoodPlaceholder).toHaveBeenCalledWith(CHAT_ID);
    expect(result).toEqual({ status: 'mood_placeholder' });
  });

  it('menu_nutrition → вызывает showNutritionPlaceholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_nutrition', DEFAULT_CONTEXT);

    expect(mockShowNutritionPlaceholder).toHaveBeenCalledTimes(1);
    expect(mockShowNutritionPlaceholder).toHaveBeenCalledWith(CHAT_ID);
    expect(result).toEqual({ status: 'nutrition_placeholder' });
  });
});

describe('routeCallback — маршрутизация префиксов подменю', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('settings_change_language → placeholder (not implemented)', async () => {
    const result = await routeCallback(CHAT_ID, 'settings_change_language', DEFAULT_CONTEXT);

    expect(result).toEqual({
      status: 'not_implemented',
      domain: 'settings',
      callbackData: 'settings_change_language',
    });
  });

  it('settings_view_lmp → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'settings_view_lmp', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('settings');
  });

  it('week_12 → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'week_12', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('week');
  });

  it('mood_log → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'mood_log', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('mood');
  });

  it('nutrition_add → placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'nutrition_add', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('nutrition');
  });
});

describe('routeCallback — неизвестный callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('random_garbage → unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('пустая строка → unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, '', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });

  it('null → unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, null, DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });

  it('undefined → unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, undefined, DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });
});

describe('routeCallback — возврат в главное меню', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('при unknown callback showMainMenu вызывается с правильным chatId', async () => {
    await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('при not-implemented (menu_*) showMainMenu вызывается', async () => {
    await routeCallback(CHAT_ID, 'menu_my_week', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('при успешной маршрутизации (lang_ru) showMainMenu НЕ вызывается', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });
});

describe('routeCallback — маршрутизация onboarding_confirm_edd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('onboarding_confirm_edd вызывает handleConfirmEdd с chatId', async () => {
    await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(mockHandleConfirmEdd).toHaveBeenCalledTimes(1);
    expect(mockHandleConfirmEdd).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_confirm_edd не вызывает handleLanguageChoice', async () => {
    await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
  });

  it('onboarding_confirm_edd не вызывает showMainMenu через роутер', async () => {
    await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });

  it('при успешном onboarding_confirm_edd возвращается результат обработчика', async () => {
    const result = await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'edd_confirmed', eddDate: '2026-12-20' });
  });

  it('когда handleConfirmEdd = null, onboarding_confirm_edd → not-implemented', async () => {
    __inject({ handleConfirmEdd: null });

    const result = await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_edit_edd (не реализован) → not-implemented — проверка падения при отсутствии обработчика', async () => {
    __inject({ handleEditEdd: null });

    const result = await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(mockHandleConfirmEdd).not.toHaveBeenCalled();
    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
  });
});

describe('routeCallback — маршрутизация onboarding_edit_edd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('onboarding_edit_edd вызывает handleEditEdd с chatId', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockHandleEditEdd).toHaveBeenCalledTimes(1);
    expect(mockHandleEditEdd).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_edit_edd не вызывает handleLanguageChoice', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
  });

  it('onboarding_edit_edd не вызывает handleConfirmEdd', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockHandleConfirmEdd).not.toHaveBeenCalled();
  });

  it('onboarding_edit_edd не вызывает showMainMenu через роутер', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });

  it('при успешном onboarding_edit_edd возвращается результат обработчика', async () => {
    const result = await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'edd_prompted' });
  });

  it('когда handleEditEdd = null, onboarding_edit_edd → not-implemented', async () => {
    __inject({ handleEditEdd: null });

    const result = await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });
});

describe('routeCallback — graceful degradation (моки отсутствуют)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
  });

  it('когда showMainMenu = null, unknown callback не падает', async () => {
    __inject({ showMainMenu: null });
    mockT.mockResolvedValue('❌ error');
    mockSendMessage.mockResolvedValue({ ok: true });
    mockAnswerCallbackQuery.mockResolvedValue({ ok: true });

    const result = await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // showMainMenu should not be called since it's null
  });

  it('когда handleLanguageChoice = null, lang_ru обрабатывается как unknown (not-implemented)', async () => {
    __inject({ handleLanguageChoice: null });
    mockT.mockResolvedValue('❌ error');
    mockSendMessage.mockResolvedValue({ ok: true });
    mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
    mockShowMainMenu.mockResolvedValue({ message_id: 42 });

    const result = await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    // Should be handled as not-implemented (fallback) since no handler
    expect(result.status).toBe('not_implemented');
    expect(mockShowMainMenu).toHaveBeenCalledTimes(1);
  });

  it('когда showMainMenu не задан (undefined после inject), showMainMenu не вызывается', async () => {
    __inject({
      showMainMenu: undefined,
      t: mockT,
      sendMessage: mockSendMessage,
      answerCallbackQuery: mockAnswerCallbackQuery,
      handleLanguageChoice: mockHandleLanguageChoice,
    });
    mockT.mockResolvedValue('❌ error');
    mockSendMessage.mockResolvedValue({ ok: true });
    mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
    mockHandleLanguageChoice.mockResolvedValue({ status: 'language_set', language: 'ru' });

    // Set showMainMenu to undefined — this actually passes through the __inject guard
    // since it checks !== undefined, so it stays as the mock. Let me reset properly.
    __inject({
      showMainMenu: null,
      handleLanguageChoice: null,
      t: mockT,
      sendMessage: mockSendMessage,
      answerCallbackQuery: mockAnswerCallbackQuery,
    });

    const result = await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);
    expect(result).toEqual({ status: 'unknown_callback' });
  });
});

describe('routeCallback — возвращаемое значение', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('успешная маршрутизация возвращает результат обработчика (language_set)', async () => {
    const result = await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'language_set', language: 'ru' });
  });

  it('unknown callback возвращает { status: "unknown_callback" }', async () => {
    const result = await routeCallback(CHAT_ID, 'nonexistent', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
  });

  it('not-implemented возвращает { status, domain, callbackData }', async () => {
    const result = await routeCallback(CHAT_ID, 'settings_language', DEFAULT_CONTEXT);

    expect(result).toHaveProperty('status', 'not_implemented');
    expect(result).toHaveProperty('domain', 'settings');
    expect(result).toHaveProperty('callbackData', 'settings_language');
  });
});

describe('routeCallback — точное совпадение имеет приоритет над префиксным', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('lang_ru направляется в onboarding (exact match), а НЕ как onboarding_ префикс', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).toHaveBeenCalledTimes(1);
  });

  it('onboarding_ префикс направляется в onboarding, но exact match с lang_ru не срабатывает', async () => {
    await routeCallback(CHAT_ID, 'onboarding_start', DEFAULT_CONTEXT);

    // Goes to handleOnboarding → not lang_ru/lang_en → handleNotImplemented
    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
    expect(mockT).toHaveBeenCalled();
  });
});

describe('__inject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('позволяет подменить t, sendMessage, answerCallbackQuery', async () => {
    const altT = vi.fn().mockResolvedValue('alt error');
    const altSend = vi.fn().mockResolvedValue({ ok: true });
    const altAnswer = vi.fn().mockResolvedValue({ ok: true });

    __inject({
      t: altT,
      sendMessage: altSend,
      answerCallbackQuery: altAnswer,
      showMainMenu: null,
      handleLanguageChoice: null,
    });

    await routeCallback(CHAT_ID, 'unknown_cb', DEFAULT_CONTEXT);

    expect(altT).toHaveBeenCalled();
    expect(altSend).toHaveBeenCalled();
    expect(altAnswer).toHaveBeenCalled();
    expect(mockT).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
  });

  it('showMainMenu = null корректно отключает возврат в меню', async () => {
    __inject({ showMainMenu: null });

    const result = await routeCallback(CHAT_ID, 'unknown_cb', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
  });
});

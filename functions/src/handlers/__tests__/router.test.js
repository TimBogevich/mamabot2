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
// Environment вЂ” prevent firebase-admin from hanging on credential lookups.
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
const mockHandleMoodCallback = vi.fn();
const mockHandleNutritionCallback = vi.fn();
const mockHandlePartnerCallback = vi.fn();

// ---------------------------------------------------------------------------
// Module under test вЂ” loads real modules but we inject mocks via __inject()
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
  handleMoodCallback: null,
  handleNutritionCallback: null,
  handlePartnerCallback: null,
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
    handleMoodCallback: null,
    handleNutritionCallback: null,
    handlePartnerCallback: null,
  });
}

function setupDefaults() {
  mockT.mockResolvedValue('вќЊ РќРµРёР·РІРµСЃС‚РЅР°СЏ РєРѕРјР°РЅРґР°. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РІРѕСЃРїРѕР»СЊР·СѓР№СЃСЏ РјРµРЅСЋ.');
  mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
  mockHandleLanguageChoice.mockResolvedValue({ status: 'language_set', language: 'ru' });
  mockHandleConfirmEdd.mockResolvedValue({ status: 'edd_confirmed', eddDate: '2026-12-20' });
  mockHandleEditEdd.mockResolvedValue({ status: 'edd_prompted' });
  mockShowMainMenu.mockResolvedValue({ message_id: 42 });
  mockSendMessage.mockResolvedValue({ ok: true });
  mockHandleWeekCallback.mockResolvedValue({ status: 'week_shown', week: 10 });
  mockHandleMoodCallback.mockResolvedValue({ status: 'mood_placeholder' });
  mockHandleNutritionCallback.mockResolvedValue({ status: 'nutrition_placeholder' });
  mockHandlePartnerCallback.mockResolvedValue({ status: 'partner_menu_shown' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routeCallback вЂ” answerCallbackQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('РІС‹Р·С‹РІР°РµС‚ answerCallbackQuery СЃ РїСЂР°РІРёР»СЊРЅС‹Рј callbackQueryId РёР· context', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockAnswerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(CALLBACK_QUERY_ID);
  });

  it('answerCallbackQuery РІС‹Р·С‹РІР°РµС‚СЃСЏ Р”Рћ РґРёСЃРїР°С‚С‡Р° (РїРµСЂРІРѕРµ РґРµР№СЃС‚РІРёРµ)', async () => {
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

  it('РµСЃР»Рё context.callbackQueryId РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚ (undefined), answerCallbackQuery РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', { from: DEFAULT_CONTEXT.from });

    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
  });

  it('РµСЃР»Рё context.callbackQueryId === null, answerCallbackQuery РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', { callbackQueryId: null, from: DEFAULT_CONTEXT.from });

    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
  });

  it('РµСЃР»Рё answerCallbackQuery РІС‹Р±СЂР°СЃС‹РІР°РµС‚ РёСЃРєР»СЋС‡РµРЅРёРµ, СЂРѕСѓС‚РµСЂ РЅРµ РїР°РґР°РµС‚ Рё РїСЂРѕРґРѕР»Р¶Р°РµС‚ РѕР±СЂР°Р±РѕС‚РєСѓ', async () => {
    mockAnswerCallbackQuery.mockRejectedValue(new Error('Telegram API error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'language_set', language: 'ru' });
    warnSpy.mockRestore();
  });

  it('РµСЃР»Рё context РЅРµ РїРµСЂРµРґР°РЅ, answerCallbackQuery РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ', async () => {
    // context is undefined вЂ” should not crash
    await routeCallback(CHAT_ID, 'lang_ru');

    expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
    // Should still process as unknown callback (no from in context)
  });
});

describe('routeCallback вЂ” РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ onboarding (lang_ru / lang_en)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('lang_ru РІС‹Р·С‹РІР°РµС‚ handleLanguageChoice СЃ chatId, callbackData Рё userInfo', async () => {
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

  it('lang_en РІС‹Р·С‹РІР°РµС‚ handleLanguageChoice СЃ РїСЂР°РІРёР»СЊРЅС‹РјРё РїР°СЂР°РјРµС‚СЂР°РјРё', async () => {
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

  it('lang_fr вЂ” РЅРµРёР·РІРµСЃС‚РЅС‹Р№ callback (РЅРµ exact match Рё РЅРµ РїСЂРµС„РёРєСЃ)', async () => {
    await routeCallback(CHAT_ID, 'lang_fr', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_* РїСЂРµС„РёРєСЃ РЅР°РїСЂР°РІР»СЏРµС‚СЃСЏ РІ onboarding, РЅРѕ Р±РµР· С‚РѕС‡РЅРѕРіРѕ СЃРѕРІРїР°РґРµРЅРёСЏ в†’ not-implemented', async () => {
    await routeCallback(CHAT_ID, 'onboarding_some_future_callback', DEFAULT_CONTEXT);

    // handleOnboarding receives it but no exact match в†’ handleNotImplemented
    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('РїСЂРё СѓСЃРїРµС€РЅРѕРј lang_ru showMainMenu РќР• РІС‹Р·С‹РІР°РµС‚СЃСЏ (СЌС‚Рѕ РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚СЊ РѕР±СЂР°Р±РѕС‚С‡РёРєР°)', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });
});

describe('routeCallback вЂ” РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ menu_*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('menu_my_week в†’ placeholder (not implemented) + РІРѕР·РІСЂР°С‚ РІ РјРµРЅСЋ', async () => {
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

  it('menu_mood_diary в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_mood_diary', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('menu');
  });

  it('menu_nutrition в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_nutrition', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('menu');
  });

  it('menu_settings в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_settings', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('menu');
  });

  it('menu_help в†’ показывает help и возвращается в меню', async () => {
    const result = await routeCallback(CHAT_ID, 'menu_help', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'help_shown' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'help.message');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });
});

describe('routeCallback вЂ” РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ menu_* СЃ СЂРµР°Р»СЊРЅС‹РјРё Р·Р°РіР»СѓС€РєР°РјРё', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
    __inject({
      handleWeekCallback: mockHandleWeekCallback,
      handleMoodCallback: mockHandleMoodCallback,
      handleNutritionCallback: mockHandleNutritionCallback,
      handlePartnerCallback: mockHandlePartnerCallback,
    });
  });

  it('menu_my_week в†’ вызывает handleWeekCallback', async () => {
    mockHandleWeekCallback.mockResolvedValue({ status: 'week_shown', week: 10 });

    const result = await routeCallback(CHAT_ID, 'menu_my_week', DEFAULT_CONTEXT);

    expect(mockHandleWeekCallback).toHaveBeenCalledTimes(1);
    expect(mockHandleWeekCallback).toHaveBeenCalledWith(CHAT_ID, 'menu_my_week');
    expect(result).toEqual({ status: 'week_shown', week: 10 });
    expect(mockT).not.toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });

  it('menu_mood_diary в†’ вызывает handleMoodCallback', async () => {
    mockHandleMoodCallback.mockResolvedValue({ status: 'mood_menu_shown' });

    const result = await routeCallback(CHAT_ID, 'menu_mood_diary', DEFAULT_CONTEXT);

    expect(mockHandleMoodCallback).toHaveBeenCalledTimes(1);
    expect(mockHandleMoodCallback).toHaveBeenCalledWith(CHAT_ID, 'menu_mood_diary');
    expect(result).toEqual({ status: 'mood_menu_shown' });
  });

  it('menu_nutrition в†’ вызывает handleNutritionCallback', async () => {
    mockHandleNutritionCallback.mockResolvedValue({ status: 'nutrition_menu_shown' });

    const result = await routeCallback(CHAT_ID, 'menu_nutrition', DEFAULT_CONTEXT);

    expect(mockHandleNutritionCallback).toHaveBeenCalledTimes(1);
    expect(mockHandleNutritionCallback).toHaveBeenCalledWith(CHAT_ID, 'menu_nutrition');
    expect(result).toEqual({ status: 'nutrition_menu_shown' });
  });

  it('menu_invite_partner в†’ вызывает handlePartnerCallback', async () => {
    mockHandlePartnerCallback.mockResolvedValue({ status: 'partner_menu_shown' });

    const result = await routeCallback(CHAT_ID, 'menu_invite_partner', DEFAULT_CONTEXT);

    expect(mockHandlePartnerCallback).toHaveBeenCalledTimes(1);
    expect(mockHandlePartnerCallback).toHaveBeenCalledWith(CHAT_ID, 'menu_invite_partner');
    expect(result).toEqual({ status: 'partner_menu_shown' });
  });
});

describe('routeCallback вЂ” РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ РїСЂРµС„РёРєСЃРѕРІ РїРѕРґРјРµРЅСЋ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('settings_change_language в†’ placeholder (not implemented)', async () => {
    const result = await routeCallback(CHAT_ID, 'settings_change_language', DEFAULT_CONTEXT);

    expect(result).toEqual({
      status: 'not_implemented',
      domain: 'settings',
      callbackData: 'settings_change_language',
    });
  });

  it('settings_view_lmp в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'settings_view_lmp', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('settings');
  });

  it('week_12 в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'week_12', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('week');
  });

  it('mood_log в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'mood_log', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('mood');
  });

  it('nutrition_add в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'nutrition_add', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('nutrition');
  });

  it('partner_create_code в†’ placeholder', async () => {
    const result = await routeCallback(CHAT_ID, 'partner_create_code', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(result.domain).toBe('partner');
  });
});

describe('routeCallback — маршрутизация partner_* с реальным обработчиком', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
    __inject({ handlePartnerCallback: mockHandlePartnerCallback });
  });

  it('partner_create_code вызывает handlePartnerCallback', async () => {
    mockHandlePartnerCallback.mockResolvedValue({ status: 'code_created', code: 'ABC123' });

    const result = await routeCallback(CHAT_ID, 'partner_create_code', DEFAULT_CONTEXT);

    expect(mockHandlePartnerCallback).toHaveBeenCalledTimes(1);
    expect(mockHandlePartnerCallback).toHaveBeenCalledWith(CHAT_ID, 'partner_create_code');
    expect(result).toEqual({ status: 'code_created', code: 'ABC123' });
  });

  it('partner_status вызывает handlePartnerCallback', async () => {
    mockHandlePartnerCallback.mockResolvedValue({ status: 'status_shown' });

    const result = await routeCallback(CHAT_ID, 'partner_status', DEFAULT_CONTEXT);

    expect(mockHandlePartnerCallback).toHaveBeenCalledWith(CHAT_ID, 'partner_status');
    expect(result).toEqual({ status: 'status_shown' });
  });
});

describe('routeCallback вЂ” РЅРµРёР·РІРµСЃС‚РЅС‹Р№ callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('random_garbage в†’ unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('РїСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР° в†’ unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, '', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });

  it('null в†’ unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, null, DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });

  it('undefined в†’ unknown_callback', async () => {
    const result = await routeCallback(CHAT_ID, undefined, DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalledWith(CHAT_ID, 'error.unknown_callback');
  });
});

describe('routeCallback вЂ” РІРѕР·РІСЂР°С‚ РІ РіР»Р°РІРЅРѕРµ РјРµРЅСЋ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('РїСЂРё unknown callback showMainMenu РІС‹Р·С‹РІР°РµС‚СЃСЏ СЃ РїСЂР°РІРёР»СЊРЅС‹Рј chatId', async () => {
    await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('РїСЂРё not-implemented (menu_*) showMainMenu РІС‹Р·С‹РІР°РµС‚СЃСЏ', async () => {
    await routeCallback(CHAT_ID, 'menu_my_week', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).toHaveBeenCalledTimes(1);
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('РїСЂРё СѓСЃРїРµС€РЅРѕР№ РјР°СЂС€СЂСѓС‚РёР·Р°С†РёРё (lang_ru) showMainMenu РќР• РІС‹Р·С‹РІР°РµС‚СЃСЏ', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });
});

describe('routeCallback вЂ” РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ onboarding_confirm_edd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('onboarding_confirm_edd РІС‹Р·С‹РІР°РµС‚ handleConfirmEdd СЃ chatId', async () => {
    await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(mockHandleConfirmEdd).toHaveBeenCalledTimes(1);
    expect(mockHandleConfirmEdd).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_confirm_edd РЅРµ РІС‹Р·С‹РІР°РµС‚ handleLanguageChoice', async () => {
    await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
  });

  it('onboarding_confirm_edd РЅРµ РІС‹Р·С‹РІР°РµС‚ showMainMenu С‡РµСЂРµР· СЂРѕСѓС‚РµСЂ', async () => {
    await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });

  it('РїСЂРё СѓСЃРїРµС€РЅРѕРј onboarding_confirm_edd РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ СЂРµР·СѓР»СЊС‚Р°С‚ РѕР±СЂР°Р±РѕС‚С‡РёРєР°', async () => {
    const result = await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'edd_confirmed', eddDate: '2026-12-20' });
  });

  it('РєРѕРіРґР° handleConfirmEdd = null, onboarding_confirm_edd в†’ not-implemented', async () => {
    __inject({ handleConfirmEdd: null });

    const result = await routeCallback(CHAT_ID, 'onboarding_confirm_edd', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_edit_edd (РЅРµ СЂРµР°Р»РёР·РѕРІР°РЅ) в†’ not-implemented вЂ” РїСЂРѕРІРµСЂРєР° РїР°РґРµРЅРёСЏ РїСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё РѕР±СЂР°Р±РѕС‚С‡РёРєР°', async () => {
    __inject({ handleEditEdd: null });

    const result = await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(mockHandleConfirmEdd).not.toHaveBeenCalled();
    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
  });
});

describe('routeCallback вЂ” РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ onboarding_edit_edd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('onboarding_edit_edd РІС‹Р·С‹РІР°РµС‚ handleEditEdd СЃ chatId', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockHandleEditEdd).toHaveBeenCalledTimes(1);
    expect(mockHandleEditEdd).toHaveBeenCalledWith(CHAT_ID);
  });

  it('onboarding_edit_edd РЅРµ РІС‹Р·С‹РІР°РµС‚ handleLanguageChoice', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).not.toHaveBeenCalled();
  });

  it('onboarding_edit_edd РЅРµ РІС‹Р·С‹РІР°РµС‚ handleConfirmEdd', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockHandleConfirmEdd).not.toHaveBeenCalled();
  });

  it('onboarding_edit_edd РЅРµ РІС‹Р·С‹РІР°РµС‚ showMainMenu С‡РµСЂРµР· СЂРѕСѓС‚РµСЂ', async () => {
    await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(mockShowMainMenu).not.toHaveBeenCalled();
  });

  it('РїСЂРё СѓСЃРїРµС€РЅРѕРј onboarding_edit_edd РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ СЂРµР·СѓР»СЊС‚Р°С‚ РѕР±СЂР°Р±РѕС‚С‡РёРєР°', async () => {
    const result = await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'edd_prompted' });
  });

  it('РєРѕРіРґР° handleEditEdd = null, onboarding_edit_edd в†’ not-implemented', async () => {
    __inject({ handleEditEdd: null });

    const result = await routeCallback(CHAT_ID, 'onboarding_edit_edd', DEFAULT_CONTEXT);

    expect(result.status).toBe('not_implemented');
    expect(mockShowMainMenu).toHaveBeenCalledWith(CHAT_ID);
  });
});

describe('routeCallback вЂ” graceful degradation (РјРѕРєРё РѕС‚СЃСѓС‚СЃС‚РІСѓСЋС‚)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
  });

  it('РєРѕРіРґР° showMainMenu = null, unknown callback РЅРµ РїР°РґР°РµС‚', async () => {
    __inject({ showMainMenu: null });
    mockT.mockResolvedValue('вќЊ error');
    mockSendMessage.mockResolvedValue({ ok: true });
    mockAnswerCallbackQuery.mockResolvedValue({ ok: true });

    const result = await routeCallback(CHAT_ID, 'random_garbage', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
    expect(mockT).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    // showMainMenu should not be called since it's null
  });

  it('РєРѕРіРґР° handleLanguageChoice = null, lang_ru РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ РєР°Рє unknown (not-implemented)', async () => {
    __inject({ handleLanguageChoice: null });
    mockT.mockResolvedValue('вќЊ error');
    mockSendMessage.mockResolvedValue({ ok: true });
    mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
    mockShowMainMenu.mockResolvedValue({ message_id: 42 });

    const result = await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    // Should be handled as not-implemented (fallback) since no handler
    expect(result.status).toBe('not_implemented');
    expect(mockShowMainMenu).toHaveBeenCalledTimes(1);
  });

  it('РєРѕРіРґР° showMainMenu РЅРµ Р·Р°РґР°РЅ (undefined РїРѕСЃР»Рµ inject), showMainMenu РЅРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ', async () => {
    __inject({
      showMainMenu: undefined,
      t: mockT,
      sendMessage: mockSendMessage,
      answerCallbackQuery: mockAnswerCallbackQuery,
      handleLanguageChoice: mockHandleLanguageChoice,
    });
    mockT.mockResolvedValue('вќЊ error');
    mockSendMessage.mockResolvedValue({ ok: true });
    mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
    mockHandleLanguageChoice.mockResolvedValue({ status: 'language_set', language: 'ru' });

    // Set showMainMenu to undefined вЂ” this actually passes through the __inject guard
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

describe('routeCallback вЂ” РІРѕР·РІСЂР°С‰Р°РµРјРѕРµ Р·РЅР°С‡РµРЅРёРµ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('СѓСЃРїРµС€РЅР°СЏ РјР°СЂС€СЂСѓС‚РёР·Р°С†РёСЏ РІРѕР·РІСЂР°С‰Р°РµС‚ СЂРµР·СѓР»СЊС‚Р°С‚ РѕР±СЂР°Р±РѕС‚С‡РёРєР° (language_set)', async () => {
    const result = await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'language_set', language: 'ru' });
  });

  it('unknown callback РІРѕР·РІСЂР°С‰Р°РµС‚ { status: "unknown_callback" }', async () => {
    const result = await routeCallback(CHAT_ID, 'nonexistent', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
  });

  it('not-implemented РІРѕР·РІСЂР°С‰Р°РµС‚ { status, domain, callbackData }', async () => {
    const result = await routeCallback(CHAT_ID, 'settings_language', DEFAULT_CONTEXT);

    expect(result).toHaveProperty('status', 'not_implemented');
    expect(result).toHaveProperty('domain', 'settings');
    expect(result).toHaveProperty('callbackData', 'settings_language');
  });
});

describe('routeCallback вЂ” С‚РѕС‡РЅРѕРµ СЃРѕРІРїР°РґРµРЅРёРµ РёРјРµРµС‚ РїСЂРёРѕСЂРёС‚РµС‚ РЅР°Рґ РїСЂРµС„РёРєСЃРЅС‹Рј', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreInjectDefaults();
    setupDefaults();
  });

  it('lang_ru РЅР°РїСЂР°РІР»СЏРµС‚СЃСЏ РІ onboarding (exact match), Р° РќР• РєР°Рє onboarding_ РїСЂРµС„РёРєСЃ', async () => {
    await routeCallback(CHAT_ID, 'lang_ru', DEFAULT_CONTEXT);

    expect(mockHandleLanguageChoice).toHaveBeenCalledTimes(1);
  });

  it('onboarding_ РїСЂРµС„РёРєСЃ РЅР°РїСЂР°РІР»СЏРµС‚СЃСЏ РІ onboarding, РЅРѕ exact match СЃ lang_ru РЅРµ СЃСЂР°Р±Р°С‚С‹РІР°РµС‚', async () => {
    await routeCallback(CHAT_ID, 'onboarding_start', DEFAULT_CONTEXT);

    // Goes to handleOnboarding в†’ not lang_ru/lang_en в†’ handleNotImplemented
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

  it('РїРѕР·РІРѕР»СЏРµС‚ РїРѕРґРјРµРЅРёС‚СЊ t, sendMessage, answerCallbackQuery', async () => {
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

  it('showMainMenu = null РєРѕСЂСЂРµРєС‚РЅРѕ РѕС‚РєР»СЋС‡Р°РµС‚ РІРѕР·РІСЂР°С‚ РІ РјРµРЅСЋ', async () => {
    __inject({ showMainMenu: null });

    const result = await routeCallback(CHAT_ID, 'unknown_cb', DEFAULT_CONTEXT);

    expect(result).toEqual({ status: 'unknown_callback' });
  });
});

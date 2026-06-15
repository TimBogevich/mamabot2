/**
 * @fileoverview Tests for the i18n module (t() and setLanguage()).
 *
 * This module uses CommonJS syntax and relies on the __inject() testability
 * hook provided by i18n.js to inject mock getUser/updateUser implementations,
 * avoiding the need for module-level mocking that vitest cannot perform on
 * CommonJS require() calls.
 */

// ---------------------------------------------------------------------------
// Environment — prevent firebase-admin from hanging on credential lookups.
// The emulator host must be set before the firestore module is loaded.
// ---------------------------------------------------------------------------

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

// ---------------------------------------------------------------------------
// Mock function declarations (before require() to satisfy hoisting)
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();

// ---------------------------------------------------------------------------
// Module under test — loads real modules but we inject mocks via __inject()
// ---------------------------------------------------------------------------

const { t, setLanguage, __inject } = require('../i18n.js');

// ---------------------------------------------------------------------------
// Inject mocks before any test runs
// ---------------------------------------------------------------------------

__inject({ getUser: mockGetUser, updateUser: mockUpdateUser });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser = {
  chatId: 12345,
  userId: '12345',
  firstName: 'Test',
  language: 'ru',
  role: 'mom',
};

function freshUser(overrides) {
  return { ...mockUser, ...overrides };
}

// ---------------------------------------------------------------------------
// Cleanup between tests
// ---------------------------------------------------------------------------

beforeEach(function () {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('t() — key resolution', function () {
  it('returns a non-empty Russian string for onboarding.ask_lmp with ru language', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'onboarding.ask_lmp');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty English string for onboarding.ask_lmp with en language', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'onboarding.ask_lmp');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns correct localized string for menu.week_info in Russian', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'menu.week_info');
    expect(result).toBe('📋 Информация о неделе');
  });

  it('returns correct localized string for menu.week_info in English', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'menu.week_info');
    expect(result).toBe('📋 Week Info');
  });

  it('returns different strings for Russian and English for the same key', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var ruResult = await t('12345', 'menu.week_info');

    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var enResult = await t('12345', 'menu.week_info');

    expect(ruResult).not.toBe(enResult);
  });
});

describe('t() — fallback behavior', function () {
  it('returns the raw key for a nonexistent key without crashing', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'nonexistent.key');
    expect(result).toBe('nonexistent.key');
  });

  it('returns the raw key when the key resolves to an object (not a string)', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'menu');
    expect(result).toBe('menu');
  });

  it('returns an empty string for an empty key without crashing', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', '');
    expect(result).toBe('');
  });

  it('returns stringified value for a non-string key without crashing', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 123);
    expect(result).toBe('123');
  });

  it('falls back to Russian when user doc is null', async function () {
    mockGetUser.mockResolvedValue(null);
    var result = await t('12345', 'onboarding.welcome');
    expect(result).toContain('Добро пожаловать');
  });

  it('falls back to Russian when user doc has no language field', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: undefined }));
    var result = await t('12345', 'onboarding.welcome');
    expect(result).toContain('Добро пожаловать');
  });
});

describe('t() — variable interpolation', function () {
  it('replaces {{name}} with the provided value', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'onboarding.welcome', { name: 'Анна' });
    expect(result).toContain('Анна');
    expect(result).not.toContain('{{name}}');
  });

  it('replaces both {{week}} and {{edc}} with provided values', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'onboarding.week_calculated', {
      week: '5',
      edc: '2026-12-01',
    });
    expect(result).toContain('5');
    expect(result).toContain('2026-12-01');
    expect(result).not.toContain('{{week}}');
    expect(result).not.toContain('{{edc}}');
  });

  it('leaves unmatched {{placeholders}} intact (no crash)', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'menu.week_info', { nonexistent: 'value' });
    expect(result).toBe('📋 Week Info');
  });

  it('returns the original string unchanged with empty vars object', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var result = await t('12345', 'onboarding.welcome', {});
    expect(result).toContain('{{name}}');
  });

  it('replaces {{edd}} in onboarding.edd_calculated', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'onboarding.edd_calculated', { edd: '20.12.2026' });
    expect(result).toContain('20.12.2026');
    expect(result).not.toContain('{{edd}}');
  });

  it('replaces {{edd}} in onboarding.edd_saved', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'onboarding.edd_saved', { edd: '25.12.2026' });
    expect(result).toContain('25.12.2026');
    expect(result).not.toContain('{{edd}}');
  });

  it('replaces {{lmp}} in onboarding.edd_before_lmp', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'onboarding.edd_before_lmp', { lmp: '15.03.2026' });
    expect(result).toContain('15.03.2026');
    expect(result).not.toContain('{{lmp}}');
  });

  it('resolves onboarding.edd_confirm_btn to a non-empty string', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var result = await t('12345', 'onboarding.edd_confirm_btn');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('onboarding.edd_confirm_btn');
  });

  it('resolves all new edd keys in Russian without fallback', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'ru' }));
    var keys = [
      'onboarding.edd_calculated',
      'onboarding.edd_confirm_btn',
      'onboarding.edd_edit_btn',
      'onboarding.ask_edd',
      'onboarding.edd_invalid',
      'onboarding.edd_too_far',
    ];
    for (var i = 0; i < keys.length; i++) {
      var result = await t('12345', keys[i]);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toBe(keys[i]); // no key-as-fallback
    }
  });

  it('resolves all new edd keys in English without fallback', async function () {
    mockGetUser.mockResolvedValue(freshUser({ language: 'en' }));
    var keys = [
      'onboarding.edd_calculated',
      'onboarding.edd_confirm_btn',
      'onboarding.edd_edit_btn',
      'onboarding.ask_edd',
      'onboarding.edd_invalid',
      'onboarding.edd_too_far',
    ];
    for (var i = 0; i < keys.length; i++) {
      var result = await t('12345', keys[i]);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toBe(keys[i]); // no key-as-fallback
    }
  });
});

describe('setLanguage() — language switching', function () {
  it('calls updateUser with { language: "en" }', async function () {
    mockUpdateUser.mockResolvedValue(undefined);
    var result = await setLanguage('12345', 'en');
    expect(mockUpdateUser).toHaveBeenCalledWith('12345', { language: 'en' });
    expect(result).toBe('en');
  });

  it('calls updateUser with { language: "ru" }', async function () {
    mockUpdateUser.mockResolvedValue(undefined);
    var result = await setLanguage('12345', 'ru');
    expect(mockUpdateUser).toHaveBeenCalledWith('12345', { language: 'ru' });
    expect(result).toBe('ru');
  });

  it('throws an Error for an invalid language code', async function () {
    mockUpdateUser.mockResolvedValue(undefined);
    await expect(setLanguage('12345', 'fr')).rejects.toThrow(Error);
    await expect(setLanguage('12345', 'fr')).rejects.toThrow(/invalid language/i);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('reflects the new language in the next t() call after setLanguage', async function () {
    mockUpdateUser.mockImplementation(async function (_id, data) {
      mockGetUser.mockResolvedValue(freshUser({ language: data.language }));
    });

    await setLanguage('12345', 'en');
    var enResult = await t('12345', 'menu.week_info');
    expect(enResult).toBe('📋 Week Info');

    await setLanguage('12345', 'ru');
    var ruResult = await t('12345', 'menu.week_info');
    expect(ruResult).toBe('📋 Информация о неделе');
  });
});

describe('Locale file structural parity', function () {
  it('both ru.json and en.json exist and are valid JSON (require succeeds)', function () {
    var ruLocale;
    var enLocale;
    expect(function () {
      ruLocale = require('../locales/ru.json');
    }).not.toThrow();
    expect(function () {
      enLocale = require('../locales/en.json');
    }).not.toThrow();
    expect(ruLocale).toBeTruthy();
    expect(enLocale).toBeTruthy();
  });

  it('has identical leaf key paths in ru.json and en.json', function () {
    var ruLocale = require('../locales/ru.json');
    var enLocale = require('../locales/en.json');

    function collectLeafPaths(obj, prefix) {
      var paths = [];
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var value = obj[key];
          var fullPath = prefix ? prefix + '.' + key : key;
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            paths = paths.concat(collectLeafPaths(value, fullPath));
          } else {
            paths.push(fullPath);
          }
        }
      }
      return paths;
    }

    var ruPaths = collectLeafPaths(ruLocale).sort();
    var enPaths = collectLeafPaths(enLocale).sort();

    expect(ruPaths).toEqual(enPaths);
  });

  it('has no empty string values in either locale file', function () {
    var ruLocale = require('../locales/ru.json');
    var enLocale = require('../locales/en.json');

    function findEmptyStrings(obj, prefix) {
      var emptyPaths = [];
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var value = obj[key];
          var fullPath = prefix ? prefix + '.' + key : key;
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            emptyPaths = emptyPaths.concat(findEmptyStrings(value, fullPath));
          } else if (value === '') {
            emptyPaths.push(fullPath);
          }
        }
      }
      return emptyPaths;
    }

    expect(findEmptyStrings(ruLocale)).toEqual([]);
    expect(findEmptyStrings(enLocale)).toEqual([]);
  });

  it('ru.json contains Cyrillic characters', function () {
    var ruLocale = require('../locales/ru.json');

    function collectStrings(obj) {
      var strings = [];
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var value = obj[key];
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            strings = strings.concat(collectStrings(value));
          } else if (typeof value === 'string') {
            strings.push(value);
          }
        }
      }
      return strings;
    }

    var allStrings = collectStrings(ruLocale);
    var cyrillicRegex = /[а-яА-ЯёЁ]/;
    var hasCyrillic = allStrings.some(function (s) {
      return cyrillicRegex.test(s);
    });
    expect(hasCyrillic).toBe(true);
  });

  it('has required top-level keys in both files: onboarding, menu, settings, error', function () {
    var ruLocale = require('../locales/ru.json');
    var enLocale = require('../locales/en.json');

    var requiredKeys = ['onboarding', 'menu', 'settings', 'error'];
    for (var i = 0; i < requiredKeys.length; i++) {
      var key = requiredKeys[i];
      expect(ruLocale).toHaveProperty(key);
      expect(enLocale).toHaveProperty(key);
    }
  });
});
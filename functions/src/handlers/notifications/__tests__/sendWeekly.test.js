/**
 * Tests for the sendWeekly notifications handler.
 *
 * Mocks Firestore db and calculatePregnancyWeek via require.cache injection
 * using the same pattern as src/__tests__/webhook.test.js and
 * src/__tests__/utils/telegram.test.js.
 *
 * For the new t/sendMessage dependencies, uses __inject() exported by the
 * module under test (the pattern used by confirmEdd.js, router.js, etc.).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Paths of modules we need to mock (relative to this test file)
// ---------------------------------------------------------------------------

const FIRESTORE_PATH = req.resolve('../../../firestore.js');
const PREGNANCY_WEEK_PATH = req.resolve('../../../utils/pregnancyWeek.js');
const SEND_WEEKLY_PATH = req.resolve('../sendWeekly.js');

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a pregnancy_data document snapshot mock.
 *
 * @param {Object|null} data - Document data, or null if doc doesn't exist
 * @returns {{ exists: boolean, data: Function }}
 */
function createDocSnapshot(data) {
  return {
    exists: data !== null,
    data: () => data,
  };
}

/**
 * Create a Firestore snapshot mock with an array of user documents.
 * Each user doc has a .data() method and the snapshot has forEach() and docs[].
 *
 * @param {Array<Object>} users - Array of user data objects
 * @returns {{ docs: Array, forEach: Function }}
 */
function createQuerySnapshot(users) {
  const docs = users.map((userData) => ({ data: () => userData }));
  return {
    docs,
    forEach(callback) {
      docs.forEach((doc) => callback(doc));
    },
  };
}

/**
 * Inject mock modules into the require cache before sendingWeekly.js loads.
 *
 * @param {Object} options
 * @param {Object} options.firestoreMock - value for module.exports of firestore.js
 * @param {Function} options.pregnancyWeekMock - calculatePregnancyWeek function
 */
function injectMocks({ firestoreMock, pregnancyWeekMock }) {
  // Mock firestore.js
  req.cache[FIRESTORE_PATH] = {
    id: FIRESTORE_PATH,
    filename: FIRESTORE_PATH,
    loaded: true,
    exports: firestoreMock,
  };

  // Mock pregnancyWeek.js
  req.cache[PREGNANCY_WEEK_PATH] = {
    id: PREGNANCY_WEEK_PATH,
    filename: PREGNANCY_WEEK_PATH,
    loaded: true,
    exports: { calculatePregnancyWeek: pregnancyWeekMock },
  };


  // Clear the sendWeekly module cache so it reloads with fresh mocks
  delete req.cache[SEND_WEEKLY_PATH];

}

/** Remove mock entries from the require cache. */
function cleanCache() {
  delete req.cache[FIRESTORE_PATH];
  delete req.cache[PREGNANCY_WEEK_PATH];
  delete req.cache[SEND_WEEKLY_PATH];
  vi.resetModules();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('sendWeeklyNotifications', () => {
  /** @type {typeof import('../sendWeekly')} */
  let mod;
  /** @type {import('vitest').Mock} */
  let mockT;
  /** @type {import('vitest').Mock} */
  let mockSendMessage;
  /** @type {Function} */
  let mockGetPregnancyDoc;

  beforeEach(() => {
    cleanCache();

    mockT = vi.fn();
    mockSendMessage = vi.fn();
    mockGetPregnancyDoc = vi.fn();

    // Default: pregnancy data exists for all lookups
    mockGetPregnancyDoc.mockImplementation((docId) => {
      if (docId === '14_ru') {
        return {
          babyWeightGrams: 100,
          babySize: 'размером с лимон',
          babyDevelopment: 'Развитие на 14 неделе.',
        };
      }
      if (docId === '14_en') {
        return {
          babyWeightGrams: 100,
          babySize: 'size of a lemon',
          babyDevelopment: 'Development at week 14.',
        };
      }
      if (docId === '1_ru') {
        return {
          babyWeightGrams: 1,
          babySize: 'размером с маковое зёрнышко',
          babyDevelopment: 'Первая неделя.',
        };
      }
      if (docId === '20_ru') {
        return {
          babyWeightGrams: 300,
          babySize: 'размером с банан',
          babyDevelopment: 'Двадцатая неделя.',
        };
      }
      if (docId === '40_ru') {
        return {
          babyWeightGrams: 3400,
          babySize: 'размером с арбуз',
          babyDevelopment: 'Сороковая неделя.',
        };
      }
      if (docId === '2_ru') {
        return {
          babyWeightGrams: 1,
          babySize: 'размером с маковое зёрнышко',
          babyDevelopment: 'Вторая неделя.',
        };
      }
      return null;
    });
  });

  afterEach(() => {
    cleanCache();
  });

  it('exports a function and __inject', () => {
    // Arrange — minimal mocks (db never called)
    const mockDb = vi.fn();
    injectMocks({
      firestoreMock: { db: mockDb },
      pregnancyWeekMock: vi.fn(),
    });

    // Act
    mod = req('../sendWeekly.js');

    // Assert
    expect(typeof mod.sendWeeklyNotifications).toBe('function');
    expect(typeof mod.__inject).toBe('function');
  });

  it("queries users collection with where('lmpDate', '!=', null)", async () => {
    // Arrange
    const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot([]));
    const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
    const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDb = { collection: mockCollection };

    injectMocks({
      firestoreMock: { db: mockDb },
      pregnancyWeekMock: vi.fn(),
    });

    mod = req('../sendWeekly.js');
    mod.__inject({ t: mockT, sendMessage: mockSendMessage });

    // Act
    await mod.sendWeeklyNotifications();

    // Assert
    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockWhere).toHaveBeenCalledWith('lmpDate', '!=', null);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('returns correct counts with mixed data', async () => {
    // Arrange
    const users = [
      { lmpDate: '2026-06-01', chatId: 1 },   // valid week=2
      { lmpDate: '2025-01-01', chatId: 2 },    // outOfRange=true
    ];

    const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
    const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
    const mockDoc = vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue(createDocSnapshot({
        babyWeightGrams: 1,
        babySize: 'размером с маковое зёрнышко',
        babyDevelopment: 'Вторая неделя.',
      })),
      update: vi.fn().mockResolvedValue(),
    });
    const mockCollection = vi.fn().mockImplementation((name) => {
      if (name === 'users') {
        return { where: mockWhere, doc: mockDoc };
      }
      if (name === 'pregnancy_data') {
        return { doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(createDocSnapshot({ babyWeightGrams: 1, babySize: 'размером с маковое зёрнышко', babyDevelopment: 'Вторая неделя.' })) }) };
      }
      return {};
    });
    const mockDb = { collection: mockCollection };

    const mockCalc = vi.fn((lmpDate) => {
      if (lmpDate === '2026-06-01') return { week: 2, outOfRange: false };
      if (lmpDate === '2025-01-01') return { week: 76, outOfRange: true };
      return { week: 0, outOfRange: true };
    });

    mockT.mockResolvedValue('formatted message');
    mockSendMessage.mockResolvedValue({ ok: true });

    injectMocks({
      firestoreMock: { db: mockDb },
      pregnancyWeekMock: mockCalc,
    });

    mod = req('../sendWeekly.js');
    mod.__inject({ t: mockT, sendMessage: mockSendMessage });

    // Act
    const result = await mod.sendWeeklyNotifications();

    // Assert
    expect(result).toMatchObject({ checked: 2, notified: 1, skipped: 1, errors: 0 });
    expect(mockT).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(1, 'formatted message');
  });

  it('returns zero counts when no users have lmpDate', async () => {
    // Arrange
    const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot([]));
    const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
    const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDb = { collection: mockCollection };

    injectMocks({
      firestoreMock: { db: mockDb },
      pregnancyWeekMock: vi.fn(),
    });

    mod = req('../sendWeekly.js');
    mod.__inject({ t: mockT, sendMessage: mockSendMessage });

    // Act
    const result = await mod.sendWeeklyNotifications();

    // Assert
    expect(result).toMatchObject({ checked: 0, notified: 0, skipped: 0, errors: 0 });
  });

  it('handles all valid weeks correctly', async () => {
    // Arrange
    const users = [
      { lmpDate: '2026-06-08', chatId: 1 },  // week 1
      { lmpDate: '2026-01-21', chatId: 2 },  // week 20
      { lmpDate: '2025-09-03', chatId: 3 },  // week 40
    ];

    const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
    const mockWhere = vi.fn().mockReturnValue({ get: mockGet });

    const pregnancyDataMap = {
      '1_ru': { babyWeightGrams: 1, babySize: 'размером с маковое зёрнышко', babyDevelopment: 'Первая неделя.' },
      '20_ru': { babyWeightGrams: 300, babySize: 'размером с банан', babyDevelopment: 'Двадцатая неделя.' },
      '40_ru': { babyWeightGrams: 3400, babySize: 'размером с арбуз', babyDevelopment: 'Сороковая неделя.' },
    };

    const mockCollection = vi.fn().mockImplementation((name) => {
      if (name === 'users') {
        return {
          where: mockWhere,
          doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
        };
      }
      if (name === 'pregnancy_data') {
        return {
          doc: vi.fn().mockImplementation((docId) => ({
            get: vi.fn().mockResolvedValue(createDocSnapshot(pregnancyDataMap[docId] || null)),
          })),
        };
      }
      return {};
    });
    const mockDb = { collection: mockCollection };

    const mockCalc = vi.fn((lmpDate) => {
      if (lmpDate === '2026-06-08') return { week: 1, outOfRange: false };
      if (lmpDate === '2026-01-21') return { week: 20, outOfRange: false };
      if (lmpDate === '2025-09-03') return { week: 40, outOfRange: false };
      return { week: 0, outOfRange: true };
    });

    mockT.mockResolvedValue('formatted message');
    mockSendMessage.mockResolvedValue({ ok: true });

    injectMocks({
      firestoreMock: { db: mockDb },
      pregnancyWeekMock: mockCalc,
    });

    mod = req('../sendWeekly.js');
    mod.__inject({ t: mockT, sendMessage: mockSendMessage });

    // Act
    const result = await mod.sendWeeklyNotifications();

    // Assert
    expect(result).toMatchObject({ checked: 3, notified: 3, skipped: 0, errors: 0 });
    expect(mockSendMessage).toHaveBeenCalledTimes(3);
  });

  it('returns zero notified when all users are outOfRange', async () => {
    // Arrange
    const users = [
      { lmpDate: '2024-01-01', chatId: 1 },
      { lmpDate: '2023-06-15', chatId: 2 },
    ];

    const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
    const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
    const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDb = { collection: mockCollection };

    const mockCalc = vi.fn(() => ({ week: 100, outOfRange: true }));

    injectMocks({
      firestoreMock: { db: mockDb },
      pregnancyWeekMock: mockCalc,
    });

    mod = req('../sendWeekly.js');
    mod.__inject({ t: mockT, sendMessage: mockSendMessage });

    // Act
    const result = await mod.sendWeeklyNotifications();

    // Assert
    expect(result).toMatchObject({ checked: 2, notified: 0, skipped: 2, errors: 0 });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // FN-022 message formation tests
  // -----------------------------------------------------------------------

  describe('message formation (FN-022)', () => {
    it('sends message with correct week number (ru locale)', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 12345,
          language: 'ru',
          lastNotifiedWeek: 13,
        },
      ];

      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(createDocSnapshot({
                babyWeightGrams: 100,
                babySize: 'размером с лимон',
                babyDevelopment: 'Активный рост.',
              })),
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn().mockReturnValue({ week: 14, outOfRange: false });

      mockT.mockResolvedValue('🤰 Неделя 14\n\n⚖️ Вес: 100 г\n📏 Размер: размером с лимон\n\n📝 Активный рост.');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      await mod.sendWeeklyNotifications();

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '🤰 Неделя 14\n\n⚖️ Вес: 100 г\n📏 Размер: размером с лимон\n\n📝 Активный рост.');
      expect(mockT).toHaveBeenCalledWith(12345, 'notifications.new_week_full', {
        week: '14',
        weight: '100',
        size: 'размером с лимон',
        development: 'Активный рост.',
      });
    });

    it('uses English locale for en-language user', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 12345,
          language: 'en',
        },
      ];

      let pregnancyDocIdUsed = '';
      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockImplementation((docId) => {
              pregnancyDocIdUsed = docId;
              return {
                get: vi.fn().mockResolvedValue(createDocSnapshot({
                  babyWeightGrams: 100,
                  babySize: 'size of a lemon',
                  babyDevelopment: 'Active growth.',
                })),
              };
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn().mockReturnValue({ week: 14, outOfRange: false });

      mockT.mockResolvedValue('Formatted message');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      await mod.sendWeeklyNotifications();

      // Assert
      expect(pregnancyDocIdUsed).toBe('14_en');
    });

    it('defaults to Russian when user has no language field', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 12345,
          // no language field
        },
      ];

      let pregnancyDocIdUsed = '';
      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockImplementation((docId) => {
              pregnancyDocIdUsed = docId;
              return {
                get: vi.fn().mockResolvedValue(createDocSnapshot({
                  babyWeightGrams: 100,
                  babySize: 'размером с лимон',
                  babyDevelopment: 'Активный рост.',
                })),
              };
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn().mockReturnValue({ week: 14, outOfRange: false });

      mockT.mockResolvedValue('Formatted message');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      await mod.sendWeeklyNotifications();

      // Assert
      expect(pregnancyDocIdUsed).toBe('14_ru');
    });

    it('skips user when pregnancy_data doc is missing', async () => {
      // Arrange
      // First user: doc doesn't exist, second: doc exists
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 111,
          language: 'ru',
        },
        {
          lmpDate: '2026-01-01',
          chatId: 222,
          language: 'ru',
        },
      ];

      const calcWeek = vi.fn((lmpDate) => ({
        week: lmpDate === '2026-03-10' ? 14 : 20,
        outOfRange: false,
      }));

      // First pregnancy lookup returns null (missing), second returns valid data
      const pregnancyDataMap = {
        '14_ru': null,
        '20_ru': { babyWeightGrams: 300, babySize: 'размером с банан', babyDevelopment: 'Двадцатая неделя.' },
      };

      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockImplementation((docId) => ({
              get: vi.fn().mockResolvedValue(createDocSnapshot(pregnancyDataMap[docId])),
            })),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      mockT.mockResolvedValue('formatted');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      const result = await mod.sendWeeklyNotifications();

      // Assert
      // Only second user should be notified
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(222, 'formatted');
      expect(result).toMatchObject({ checked: 2, notified: 1, skipped: 1, errors: 0 });
    });

    it('error in sendMessage does not crash batch', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 111,
          language: 'ru',
        },
        {
          lmpDate: '2026-01-01',
          chatId: 222,
          language: 'ru',
        },
      ];

      const calcWeek = vi.fn((lmpDate) => ({
        week: lmpDate === '2026-03-10' ? 14 : 20,
        outOfRange: false,
      }));

      const pregnancyDataMap = {
        '14_ru': { babyWeightGrams: 100, babySize: 'лимон', babyDevelopment: 'Развитие.' },
        '20_ru': { babyWeightGrams: 300, babySize: 'банан', babyDevelopment: 'Развитие.' },
      };

      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockImplementation((docId) => ({
              get: vi.fn().mockResolvedValue(createDocSnapshot(pregnancyDataMap[docId])),
            })),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      mockT.mockResolvedValue('formatted');
      // First sendMessage rejects, second resolves
      mockSendMessage
        .mockRejectedValueOnce(new Error('Telegram API error'))
        .mockResolvedValueOnce({ ok: true });

      // Mock console.error to prevent noise
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      const result = await mod.sendWeeklyNotifications();

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[sendWeeklyNotifications] Failed to notify user 111:',
        'Telegram API error',
      );
      // Second user still gets notified
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockSendMessage).toHaveBeenLastCalledWith(222, 'formatted');
      expect(result).toMatchObject({ checked: 2, notified: 1, skipped: 0, errors: 1 });

      consoleErrorSpy.mockRestore();
    });

    it('all template variables passed to t()', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 12345,
          language: 'ru',
        },
      ];

      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(createDocSnapshot({
                babyWeightGrams: 100,
                babySize: 'размером с лимон',
                babyDevelopment: 'Активный рост.',
              })),
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn().mockReturnValue({ week: 14, outOfRange: false });

      mockT.mockResolvedValue('formatted');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      await mod.sendWeeklyNotifications();

      // Assert
      expect(mockT).toHaveBeenCalledWith(12345, 'notifications.new_week_full', {
        week: '14',
        weight: '100',
        size: 'размером с лимон',
        development: 'Активный рост.',
      });
      // Verify week and weight are strings
      const vars = mockT.mock.calls[0][2];
      expect(typeof vars.week).toBe('string');
      expect(typeof vars.weight).toBe('string');
      expect(vars).toHaveProperty('size');
      expect(vars).toHaveProperty('development');
    });
  });

  // -----------------------------------------------------------------------
  // FN-038 message formation tests (additional coverage)
  // -----------------------------------------------------------------------

  describe('message formation (FN-038)', () => {
    it('defaults to Russian doc for unsupported language value', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 111,
          language: 'fr',  // unsupported
        },
      ];

      let pregnancyDocIdUsed = '';
      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockImplementation((docId) => {
              pregnancyDocIdUsed = docId;
              return {
                get: vi.fn().mockResolvedValue(createDocSnapshot({
                  babyWeightGrams: 100,
                  babySize: 'размером с лимон',
                  babyDevelopment: 'Активный рост.',
                })),
              };
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn().mockReturnValue({ week: 14, outOfRange: false });

      mockT.mockResolvedValue('Formatted message');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      await mod.sendWeeklyNotifications();

      // Assert
      expect(pregnancyDocIdUsed).toBe('14_ru');
    });

    it('t() failure does not crash the batch', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2026-03-10',
          chatId: 111,
          language: 'ru',
        },
      ];

      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(createDocSnapshot({
                babyWeightGrams: 100,
                babySize: 'размером с лимон',
                babyDevelopment: 'Активный рост.',
              })),
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn().mockReturnValue({ week: 14, outOfRange: false });

      mockT.mockRejectedValue(new Error('Firestore unreachable'));
      mockSendMessage.mockResolvedValue({ ok: true });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      const result = await mod.sendWeeklyNotifications();

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[sendWeeklyNotifications] Failed to notify user 111:',
        'Firestore unreachable',
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(result).toMatchObject({ checked: 1, notified: 0, skipped: 0, errors: 1 });

      consoleErrorSpy.mockRestore();
    });

    it('does not affect outOfRange or duplicate-protection gates', async () => {
      // Arrange
      const users = [
        {
          lmpDate: '2024-01-01',  // outOfRange
          chatId: 1,
        },
        {
          lmpDate: '2026-03-10',
          chatId: 2,
          lastNotifiedWeek: 14,   // already notified for week 14
        },
        {
          lmpDate: '2026-03-10',
          chatId: 3,
          // valid: no lastNotifiedWeek, week 14
        },
      ];

      const mockGet = vi.fn().mockResolvedValue(createQuerySnapshot(users));
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockImplementation((name) => {
        if (name === 'users') {
          return {
            where: mockWhere,
            doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue() }),
          };
        }
        if (name === 'pregnancy_data') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(createDocSnapshot({
                babyWeightGrams: 100,
                babySize: 'размером с лимон',
                babyDevelopment: 'Активный рост.',
              })),
            }),
          };
        }
        return {};
      });
      const mockDb = { collection: mockCollection };

      const calcWeek = vi.fn((lmpDate) => {
        if (lmpDate === '2024-01-01') return { week: 100, outOfRange: true };
        return { week: 14, outOfRange: false };
      });

      mockT.mockResolvedValue('formatted');
      mockSendMessage.mockResolvedValue({ ok: true });

      injectMocks({ firestoreMock: { db: mockDb }, pregnancyWeekMock: calcWeek });
      mod = req('../sendWeekly.js');
      mod.__inject({ t: mockT, sendMessage: mockSendMessage });

      // Act
      const result = await mod.sendWeeklyNotifications();

      // Assert
      expect(result).toMatchObject({ checked: 3, notified: 1, skipped: 2, errors: 0 });
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(3, 'formatted');
    });
  });
});
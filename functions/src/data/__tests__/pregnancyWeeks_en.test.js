import { describe, test, expect } from 'vitest';
import { validatePregnancyData } from '../../schemas/pregnancy_data.js';
import weeks from '../pregnancyWeeks_en.json' with { type: 'json' };

/**
 * Constructs a full pregnancy_data document from a week record.
 * Mirrors the structure the seed script will produce.
 *
 * @param {object} week - Week record from pregnancyWeeks_en.json
 * @returns {object} Document-compatible object for schema validation
 */
function toSeedDoc(week) {
  return {
    weekNumber: week.weekNumber,
    language: 'en',
    babyDevelopment: week.babyDevelopment,
    motherChanges: '',
    nutritionTips: '',
    vitaminRecommendations: '',
    symptomsCommon: '',
    babySize: week.babySize,
    babyWeightGrams: week.babyWeightGrams,
    createdAt: null,
    updatedAt: null,
  };
}

describe('pregnancyWeeks_en.json', () => {
  test('file is parseable valid JSON', () => {
    // If the import succeeded at top level, the file is valid JSON.
    // This test serves as an explicit assertion.
    expect(Array.isArray(weeks)).toBe(true);
  });

  test('contains exactly 40 week records', () => {
    expect(weeks).toHaveLength(40);
  });

  test('contains every week number 1–40 exactly once with no gaps or duplicates', () => {
    const weekNumbers = weeks.map((w) => w.weekNumber).sort((a, b) => a - b);
    expect(weekNumbers).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
  });

  test('every record has all required fields with correct types', () => {
    weeks.forEach((week, _index) => {
      expect(typeof week.weekNumber).toBe('number');
      expect(typeof week.babyWeightGrams).toBe('number');
      expect(typeof week.babySize).toBe('string');
      expect(typeof week.babyDevelopment).toBe('string');
    });
  });

  test('all babySize and babyDevelopment strings are non-empty', () => {
    weeks.forEach((week) => {
      expect(week.babySize.length).toBeGreaterThan(0);
      expect(week.babyDevelopment.length).toBeGreaterThan(0);
    });
  });

  test('all babyWeightGrams are integers in the valid range 1–5000', () => {
    weeks.forEach((week) => {
      expect(Number.isInteger(week.babyWeightGrams)).toBe(true);
      expect(week.babyWeightGrams).toBeGreaterThanOrEqual(1);
      expect(week.babyWeightGrams).toBeLessThanOrEqual(5000);
    });
  });

  test('Latin characters present in babyDevelopment across the file', () => {
    const LATIN_RE = /[A-Za-z]/;
    const hasLatin = weeks.some((week) =>
      LATIN_RE.test(week.babyDevelopment),
    );
    expect(hasLatin).toBe(true);
  });

  test('each record passes validatePregnancyData when wrapped as a seed document', () => {
    weeks.forEach((week) => {
      const doc = toSeedDoc(week);
      const result = validatePregnancyData(doc);
      expect(result.valid).toBe(true);
    });
  });

  test('babyWeightGrams progression is monotonic (non-decreasing)', () => {
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].babyWeightGrams).toBeGreaterThanOrEqual(
        weeks[i - 1].babyWeightGrams,
      );
    }
  });
});
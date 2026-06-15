/**
 * Tests for pregnancy week calculation utility.
 *
 * All dates are computed dynamically relative to today to ensure the tests
 * remain correct regardless of when they are run.
 *
 * @module pregnancyWeek.test
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { calculatePregnancyWeek } = req('../../utils/pregnancyWeek');

/**
 * Returns an ISO date string (YYYY-MM-DD) for N days ago.
 * @param {number} n
 * @returns {string}
 */
function daysAgo(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns an ISO date string (YYYY-MM-DD) for N days from now.
 * @param {number} n
 * @returns {string}
 */
function daysFromNow(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('calculatePregnancyWeek', () => {
  describe('valid range (1–42)', () => {
    it('LMP 14 days ago → week 2', () => {
      expect(calculatePregnancyWeek(daysAgo(14))).toEqual({ week: 2, outOfRange: false });
    });

    it('LMP 280 days ago → week 40', () => {
      expect(calculatePregnancyWeek(daysAgo(280))).toEqual({ week: 40, outOfRange: false });
    });

    it('LMP 7 days ago → week 1', () => {
      expect(calculatePregnancyWeek(daysAgo(7))).toEqual({ week: 1, outOfRange: false });
    });

    it('LMP 1 day ago → week 1', () => {
      expect(calculatePregnancyWeek(daysAgo(1))).toEqual({ week: 1, outOfRange: false });
    });

    it('LMP 6 days ago → week 1', () => {
      expect(calculatePregnancyWeek(daysAgo(6))).toEqual({ week: 1, outOfRange: false });
    });

    it('LMP 8 days ago → week 2', () => {
      expect(calculatePregnancyWeek(daysAgo(8))).toEqual({ week: 2, outOfRange: false });
    });

    it('LMP 13 days ago → week 2', () => {
      expect(calculatePregnancyWeek(daysAgo(13))).toEqual({ week: 2, outOfRange: false });
    });

    it('LMP 15 days ago → week 3', () => {
      expect(calculatePregnancyWeek(daysAgo(15))).toEqual({ week: 3, outOfRange: false });
    });

    it('LMP 287 days ago (41 weeks) → week 41', () => {
      expect(calculatePregnancyWeek(daysAgo(287))).toEqual({ week: 41, outOfRange: false });
    });

    it('LMP 294 days ago (42 weeks exactly) → week 42', () => {
      expect(calculatePregnancyWeek(daysAgo(294))).toEqual({ week: 42, outOfRange: false });
    });
  });

  describe('out of range', () => {
    it('LMP today (0 days ago) → week 0, outOfRange true', () => {
      expect(calculatePregnancyWeek(daysAgo(0))).toEqual({ week: 0, outOfRange: true });
    });

    it('LMP 295 days ago (42 weeks + 1 day) → week 43, outOfRange true', () => {
      expect(calculatePregnancyWeek(daysAgo(295))).toEqual({ week: 43, outOfRange: true });
    });

    it('LMP 1 day from now (future) → outOfRange true', () => {
      const result = calculatePregnancyWeek(daysFromNow(1));
      expect(result.outOfRange).toBe(true);
    });

    it('LMP 365 days from now (far future) → outOfRange true', () => {
      const result = calculatePregnancyWeek(daysFromNow(365));
      expect(result.outOfRange).toBe(true);
    });
  });

  describe('boundary weeks (42-week cutoff)', () => {
    it('LMP 293 days ago → week 42 (ceil(293/7) = ceil(41.86) = 42)', () => {
      expect(calculatePregnancyWeek(daysAgo(293))).toEqual({ week: 42, outOfRange: false });
    });

    it('LMP 294 days ago → week 42 (ceil(294/7) = 42)', () => {
      expect(calculatePregnancyWeek(daysAgo(294))).toEqual({ week: 42, outOfRange: false });
    });

    it('LMP 295 days ago → week 43 (ceil(295/7) = ceil(42.14) = 43)', () => {
      expect(calculatePregnancyWeek(daysAgo(295))).toEqual({ week: 43, outOfRange: true });
    });
  });

  describe('return type', () => {
    it('returns an object with week (number) and outOfRange (boolean)', () => {
      const result = calculatePregnancyWeek(daysAgo(14));
      expect(result).toHaveProperty('week');
      expect(result).toHaveProperty('outOfRange');
      expect(typeof result.week).toBe('number');
      expect(typeof result.outOfRange).toBe('boolean');
    });

    it('outOfRange is never undefined — always true or false', () => {
      const results = [
        calculatePregnancyWeek(daysAgo(14)),
        calculatePregnancyWeek(daysAgo(0)),
        calculatePregnancyWeek(daysAgo(295)),
        calculatePregnancyWeek(daysFromNow(365)),
      ];
      for (const r of results) {
        expect(r.outOfRange).not.toBeUndefined();
        expect(typeof r.outOfRange).toBe('boolean');
      }
    });
  });
});
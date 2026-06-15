/**
 * Pregnancy week calculation utility.
 *
 * Provides {@link calculatePregnancyWeek} — a pure date-arithmetic function
 * that computes the current pregnancy week from the last menstrual period (LMP)
 * date using the standard obstetric formula.
 *
 * The formula is: week = ceil(daysSinceLMP / 7)
 *
 * @module pregnancyWeek
 */

/**
 * Calculates the current pregnancy week from the LMP date.
 *
 * Uses the standard obstetric formula: week = ceil(days_since_LMP / 7).
 * Week range is 1–42; values outside this range set `outOfRange: true`.
 *
 * @param {string} lmpDateString - ISO date string in YYYY-MM-DD format
 *   (e.g. '2026-03-15'). The date is interpreted at midnight UTC.
 * @returns {{ week: number, outOfRange: boolean }}
 *   `week` — the computed pregnancy week (0-based if before LMP, ≥1 otherwise).
 *   `outOfRange` — true when week < 1 OR week > 42.
 *
 * @example
 *   calculatePregnancyWeek('2026-06-01')           // LMP 14 days ago → { week: 2, outOfRange: false }
 *   calculatePregnancyWeek('2025-09-08')           // LMP 280 days ago → { week: 40, outOfRange: false }
 *   calculatePregnancyWeek(new Date().toISOString().slice(0,10))  // LMP today → { week: 0, outOfRange: true }
 */
function calculatePregnancyWeek(lmpDateString) {
  // Parse LMP date at midnight UTC
  const lmpMs = new Date(lmpDateString + 'T00:00:00Z').getTime();

  // Get today's date at midnight UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Difference in milliseconds
  const diffMs = todayMs - lmpMs;

  // Convert to whole calendar days
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Compute week using standard obstetric formula
  const week = Math.ceil(days / 7);

  // Determine if out of valid range (1–42)
  const outOfRange = week < 1 || week > 42;

  return { week, outOfRange };
}

module.exports = { calculatePregnancyWeek };
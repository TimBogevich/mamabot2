/**
 * Weekly notification handler.
 *
 * Queries all users with an LMP date, computes their current pregnancy week,
 * fetches pregnancy development data from Firestore, formats a rich message
 * in the user's preferred language, and sends it via Telegram.
 *
 * @module sendWeekly
 */

const { FieldValue } = require('firebase-admin/firestore');
const { db: _dbCore } = require('../../firestore');
const { calculatePregnancyWeek } = require('../../utils/pregnancyWeek');
const { t: _tCore } = require('../../i18n');
const { sendMessage: _sendMessageCore } = require('../../utils/telegram');

// ---------------------------------------------------------------------------
// Mutable dependency references for testability (see __inject)
// ---------------------------------------------------------------------------

/** @type {FirebaseFirestore.Firestore} */
let _db = _dbCore;
/** @type {typeof _tCore} */
let _t = _tCore;
/** @type {typeof _sendMessageCore} */
let _sendMessage = _sendMessageCore;

/**
 * Overrides internal dependencies for testing.
 *
 * @param {{ db?: Function, t?: Function, sendMessage?: Function }} deps
 */
function __inject(deps) {
  if (deps.db) _db = deps.db;
  if (deps.t) _t = deps.t;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
}

/**
 * Sends weekly pregnancy notifications to all eligible users.
 *
 * For each user with a valid LMP date, computes the current pregnancy week,
 * checks if a notification has already been sent for that week, fetches
 * pregnancy development data, formats a locale-aware message, and sends it
 * via Telegram. Errors for individual users are logged and do not crash
 * the entire batch.
 *
 * @returns {Promise<{ checked: number, notified: number, skipped: number, errors: number }>}
 *   `checked` — number of users with an LMP date
 *   `notified` — number of users who received a notification
 *   `skipped` — number of users skipped (outOfRange, duplicate, or missing pregnancy data)
 *   `errors` — number of users where notification send failed
 */
async function sendWeeklyNotifications() {
  const snap = await _db.collection('users').where('lmpDate', '!=', null).get();

  let checked = 0;
  let notified = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const user = doc.data();
    checked++;

    const { week, outOfRange } = calculatePregnancyWeek(user.lmpDate);

    // Skip users whose pregnancy is out of range (before week 1 or after week 42)
    if (outOfRange) {
      skipped++;
      continue;
    }

    // Duplicate protection: skip if already notified for this week
    if (week <= (user.lastNotifiedWeek || 0)) {
      skipped++;
      continue;
    }

    // Message formation and sending
    try {
      // Determine user language (default to 'ru' if missing)
      const lang = (user.language === 'en') ? 'en' : 'ru';

      // Fetch pregnancy data from Firestore
      const pregnancyDocId = `${week}_${lang}`;
      const pregnancySnap = await _db.collection('pregnancy_data').doc(pregnancyDocId).get();

      if (!pregnancySnap.exists) {
        console.warn(`[sendWeeklyNotifications] No pregnancy data for ${pregnancyDocId}, user ${user.chatId}`);
        skipped++;
        continue;
      }

      const pregnancyData = pregnancySnap.data();

      const message = await _t(user.chatId, 'notifications.new_week_full', {
        week: String(week),
        weight: String(pregnancyData.babyWeightGrams),
        size: pregnancyData.babySize,
        development: pregnancyData.babyDevelopment,
      });

      await _sendMessage(user.chatId, message);
      console.log(`[sendWeeklyNotifications] Sent week ${week} notification to user ${user.chatId} (${lang})`);

      // Update lastNotifiedWeek after successful send
      await _db.collection('users').doc(String(user.chatId)).update({
        lastNotifiedWeek: week,
        updatedAt: FieldValue.serverTimestamp(),
      });

      notified++;
    } catch (err) {
      console.error(`[sendWeeklyNotifications] Failed to notify user ${user.chatId}:`, err.message);
      errors++;
      // Continue to next user — failure for one should not crash the batch
    }
  }

  console.log(`[sendWeeklyNotifications] Checked ${checked} users with lmpDate`);
  console.log(`[sendWeeklyNotifications] Notified ${notified} users`);

  return { checked, notified, skipped, errors };
}

module.exports = { sendWeeklyNotifications, __inject };

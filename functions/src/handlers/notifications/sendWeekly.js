/**
 * Weekly notification handler.
 *
 * Queries all users with an LMP date, computes their current pregnancy week,
 * and returns counts of checked and notified users. Actual notification logic
 * (duplicate protection, message sending) is added by sibling tasks FN-021
 * and FN-022.
 *
 * @module sendWeekly
 */

const { db } = require("../../firestore");
const { calculatePregnancyWeek } = require("../../utils/pregnancyWeek");

/**
 * Checks all users with an LMP date and determines who should receive a
 * weekly notification.
 *
 * @returns {Promise<{ checked: number, notified: number }>}
 *   `checked` — number of users with an LMP date
 *   `notified` — number of users who would receive a notification
 */
async function sendWeeklyNotifications() {
  const snap = await db.collection("users").where("lmpDate", "!=", null).get();

  let checked = 0;
  let notified = 0;

  snap.forEach((doc) => {
    const user = doc.data();
    checked++;

    const { week: _week, outOfRange } = calculatePregnancyWeek(user.lmpDate);

    if (outOfRange) {
      return;
    }

    // -----------------------------------------------------------------------
    // TODO (FN-021): Check _week > (lastNotifiedWeek || 0) — skip if false
    // TODO (FN-022): Fetch pregnancy data, format message, call sendMessage
    // TODO (FN-021): Update lastNotifiedWeek via updateUser
    // -----------------------------------------------------------------------

    notified++;
  });

  console.log(`[sendWeeklyNotifications] Checked ${checked} users with lmpDate`);
  console.log(`[sendWeeklyNotifications] Would notify ${notified} users`);

  return { checked, notified };
}

module.exports = { sendWeeklyNotifications };

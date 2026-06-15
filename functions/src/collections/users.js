/**
 * @fileoverview Users collection helper module.
 *
 * Provides CRUD helpers for the `users` Firestore collection. Each document
 * represents a registered bot user, keyed by Telegram chat ID.
 *
 * Collection: users
 * Document ID: String(chatId)
 *
 * Usage:
 *   const { createUser, getUser, updateUser } = require('./collections/users');
 *   await createUser(chatId, { firstName, language, role, ... });
 *   const user = await getUser(chatId);
 *   await updateUser(chatId, { language: 'en' });
 */

const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("../firestore");

// ---------------------------------------------------------------------------
// Collection reference
// ---------------------------------------------------------------------------

const USERS_COLLECTION = "users";

/**
 * Returns a DocumentReference for the given Telegram chat ID.
 *
 * @param {number} chatId - Telegram chat ID
 * @returns {FirebaseFirestore.DocumentReference}
 */
function userDocRef(chatId) {
  return db.collection(USERS_COLLECTION).doc(String(chatId));
}

// ---------------------------------------------------------------------------
// User document shape (JSDoc type)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} UserDocument
 * @property {number} chatId          — Telegram chat ID (also used as document ID)
 * @property {string} userId          — Telegram user ID (from update.message.from.id)
 * @property {string} firstName       — Telegram first name
 * @property {string} [lastName]      — Telegram last name (optional)
 * @property {string} [username]      — Telegram @username (optional)
 * @property {'ru'|'en'} language     — selected language
 * @property {string} [lmpDate]       — ISO date string (YYYY-MM-DD) of last menstrual period
 * @property {number} [currentWeek]   — computed current pregnancy week (1–42)
 * @property {string} [eddDate]       — estimated due date in ISO format (YYYY-MM-DD), calculated via Naegele's rule
 * @property {number} [lastNotifiedWeek]  — pregnancy week number for which the last weekly notification was sent (1–42)
 * @property {string} [partnerCode]   — 6-character invite code for partner linking
 * @property {'mom'|'partner'} role   — user role
 * @property {FirebaseFirestore.Timestamp} createdAt    — Firestore server timestamp
 * @property {FirebaseFirestore.Timestamp} updatedAt    — Firestore server timestamp
 */

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Creates a new user document.
 *
 * The document ID is set to `String(chatId)`. Both `createdAt` and `updatedAt`
 * are set to the Firestore server timestamp.
 *
 * @param {number} chatId - Telegram chat ID (used as document ID)
 * @param {Omit<UserDocument, 'createdAt'|'updatedAt'>} data - User data
 * @returns {Promise<void>}
 */
async function createUser(chatId, data) {
  const docData = {
    ...data,
    chatId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await userDocRef(chatId).set(docData);
}

/**
 * Fetches a user document by chatId.
 *
 * @param {number} chatId - Telegram chat ID
 * @returns {Promise<UserDocument|null>} The user document, or null if not found
 */
async function getUser(chatId) {
  const snap = await userDocRef(chatId).get();

  if (!snap.exists) {
    return null;
  }

  return { ...snap.data(), chatId };
}

/**
 * Partially updates a user document.
 *
 * Automatically sets `updatedAt` to the Firestore server timestamp.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {Partial<Omit<UserDocument, 'chatId'|'createdAt'|'updatedAt'>>} data - Fields to update
 * @returns {Promise<void>}
 */
async function updateUser(chatId, data) {
  await userDocRef(chatId).update({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

module.exports = {
  USERS_COLLECTION,
  createUser,
  getUser,
  updateUser,
};
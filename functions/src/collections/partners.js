/**
 * @fileoverview Partners collection helper module.
 *
 * Provides CRUD and query helpers for the `partners` Firestore collection.
 * Each document represents a partnership between a mother and her partner,
 * keyed by a 6-character partnerCode.
 *
 * Collection: partners
 * Document ID: partnerCode (6-character uppercase alphanumeric string)
 *
 * Usage:
 *   const {
 *     createPartner, getPartner, linkPartner, getPartnershipByMom
 *   } = require('./collections/partners');
 *   await createPartner('ABC123', { momChatId: '111' });
 *   const partnership = await getPartner('ABC123');
 *   await linkPartner('ABC123', '222');
 *   const momPartnership = await getPartnershipByMom('111');
 */

const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../firestore');
const { PARTNERS_COLLECTION, validatePartners } = require('../schemas/partners');

// ---------------------------------------------------------------------------
// Collection reference
// ---------------------------------------------------------------------------

/**
 * Returns a DocumentReference for the given partnerCode.
 *
 * @param {string} partnerCode - 6-символьный код-приглашение
 * @returns {FirebaseFirestore.DocumentReference}
 */
function partnerDocRef(partnerCode) {
  return db.collection(PARTNERS_COLLECTION).doc(partnerCode);
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Создаёт новый документ партнёрства в состоянии `pending`.
 *
 * Документ создаётся с идентификатором, равным `partnerCode`.
 * Поля `createdAt` и `updatedAt` устанавливаются в Firestore server timestamp.
 *
 * Перед записью проверяется, что `partnerCode` имеет длину ровно 6 символов.
 *
 * @param {string} partnerCode - 6-символьный код-приглашение
 * @param {{ momChatId: string }} options - Данные мамы
 * @returns {Promise<void>}
 * @throws {Error} Если partnerCode не является строкой из 6 символов
 */
async function createPartner(partnerCode, { momChatId }) {
  if (typeof partnerCode !== 'string' || partnerCode.length !== 6) {
    throw new Error(
      `Invalid partnerCode: expected 6-character string, got "${partnerCode}"`,
    );
  }

  const docData = {
    partnerCode,
    momChatId,
    partnerChatId: null,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const { valid, errors } = validatePartners(docData);
  if (!valid) {
    throw new Error(`Partner validation failed: ${errors.join('; ')}`);
  }

  await partnerDocRef(partnerCode).set(docData);
}

/**
 * Читает документ партнёрства по коду-приглашению.
 *
 * @param {string} partnerCode - 6-символьный код-приглашение
 * @returns {Promise<Object|null>} Данные документа или null, если не найден
 */
async function getPartner(partnerCode) {
  const snap = await partnerDocRef(partnerCode).get();

  if (!snap.exists) {
    return null;
  }

  return { id: snap.id, ...snap.data() };
}

/**
 * Привязывает партнёра к существующему партнёрству.
 *
 * Обновляет `partnerChatId`, переводит статус в `'active'` и
 * устанавливает `updatedAt` в серверную метку времени.
 *
 * Проверяет, что документ существует и находится в статусе `'pending'`.
 * Если условие не выполнено — выбрасывает ошибку.
 *
 * @param {string} partnerCode - 6-символьный код-приглашение
 * @param {string} partnerChatId - Telegram chat ID партнёра (stringified)
 * @returns {Promise<void>}
 * @throws {Error} Если документ не найден или статус не 'pending'
 */
async function linkPartner(partnerCode, partnerChatId) {
  const existing = await getPartner(partnerCode);

  if (!existing) {
    throw new Error(`Partner document not found: "${partnerCode}"`);
  }

  if (existing.status !== 'pending') {
    throw new Error(
      `Cannot link partner: document "${partnerCode}" has status "${existing.status}", expected "pending"`,
    );
  }

  await partnerDocRef(partnerCode).update({
    partnerChatId,
    status: 'active',
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Находит партнёрство по chatId мамы.
 *
 * Выполняет запрос `.where('momChatId', '==', momChatId).limit(1)`.
 * Требует составного индекса на `momChatId` в коллекции `partners`.
 *
 * @param {string} momChatId - Telegram chat ID мамы (stringified)
 * @returns {Promise<Object|null>} Первый найденный документ или null
 */
async function getPartnershipByMom(momChatId) {
  const snapshot = await db
    .collection(PARTNERS_COLLECTION)
    .where('momChatId', '==', momChatId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

module.exports = {
  PARTNERS_COLLECTION,
  createPartner,
  getPartner,
  linkPartner,
  getPartnershipByMom,
};
/**
 * @fileoverview Integration tests for seed-pregnancy-data.js against the
 * Firestore emulator.
 *
 * Prerequisites:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080  (or appropriate host:port)
 *
 * Usage:
 *   cd functions && FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run scripts/__tests__/seed-pregnancy-data
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Use createRequire for CJS modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { seedPregnancyData } = require('../seed-pregnancy-data.js');
const { validatePregnancyData } = require('../../src/schemas/pregnancy_data.js');

const PROJECT_ID = 'mamabot-97d22';
const COLLECTION = 'pregnancy_data';

/** @type {import('firebase-admin/firestore').Firestore | null} */
let db = null;

beforeAll(async () => {
  try {
    // Initialize Firestore admin app against the emulator
    if (getApps().length === 0) {
      initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore();
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    if (host) {
      db.settings({ host, ssl: false });
    }

    // Verify connectivity by listing collections
    await db.listCollections();
  } catch (err) {
    // If connection fails, skip all tests with a clear message
    throw new Error(
      'Cannot connect to Firestore emulator. ' +
        'Set FIRESTORE_EMULATOR_HOST (e.g. localhost:8080) and ensure the emulator is running. ' +
        'Error: ' + err.message,
    );
  }
});

afterAll(async () => {
  if (!db) return;
  // Clean up: delete all documents in pregnancy_data collection
  const snapshot = await db.collection(COLLECTION).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  if (snapshot.size > 0) {
    await batch.commit();
  }
});

describe('seed-pregnancy-data', () => {
  test('seed writes exactly 80 documents', async () => {
    await seedPregnancyData(db);
    const snapshot = await db.collection(COLLECTION).get();
    expect(snapshot.size).toBe(80);
  });

  test('seed writes 40 ru documents', async () => {
    await seedPregnancyData(db);
    const snapshot = await db
      .collection(COLLECTION)
      .where('language', '==', 'ru')
      .get();
    expect(snapshot.size).toBe(40);
  });

  test('seed writes 40 en documents', async () => {
    await seedPregnancyData(db);
    const snapshot = await db
      .collection(COLLECTION)
      .where('language', '==', 'en')
      .get();
    expect(snapshot.size).toBe(40);
  });

  test('document IDs follow composite format', async () => {
    await seedPregnancyData(db);
    const snapshot = await db.collection(COLLECTION).get();
    const idPattern = /^\d{1,2}_(ru|en)$/;
    snapshot.docs.forEach((doc) => {
      const match = doc.id.match(idPattern);
      expect(match).not.toBeNull();
      const weekNum = parseInt(doc.id.split('_')[0], 10);
      expect(weekNum).toBeGreaterThanOrEqual(1);
      expect(weekNum).toBeLessThanOrEqual(40);
    });
    // Verify no bare-number IDs
    const badIds = snapshot.docs.filter((doc) => !idPattern.test(doc.id));
    expect(badIds).toHaveLength(0);
  });

  test('each of 80 documents passes schema validation', async () => {
    await seedPregnancyData(db);
    const snapshot = await db.collection(COLLECTION).get();
    const failures = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const result = validatePregnancyData(data);
      if (!result.valid) {
        failures.push(
          'Document "' + doc.id + '" failed validation: ' + result.errors.join('; '),
        );
      }
    });
    expect(failures).toHaveLength(0);
  });

  test('all 11 required fields present in document 1_ru', async () => {
    await seedPregnancyData(db);
    const docRef = db.collection(COLLECTION).doc('1_ru');
    const snap = await docRef.get();
    expect(snap.exists).toBe(true);
    const data = snap.data();

    // weekNumber (number === 1)
    expect(data).toHaveProperty('weekNumber');
    expect(typeof data.weekNumber).toBe('number');
    expect(data.weekNumber).toBe(1);

    // language (string === "ru")
    expect(data).toHaveProperty('language');
    expect(typeof data.language).toBe('string');
    expect(data.language).toBe('ru');

    // babyDevelopment (non-empty string)
    expect(data).toHaveProperty('babyDevelopment');
    expect(typeof data.babyDevelopment).toBe('string');
    expect(data.babyDevelopment.length).toBeGreaterThan(0);

    // motherChanges (string — may be empty)
    expect(data).toHaveProperty('motherChanges');
    expect(typeof data.motherChanges).toBe('string');

    // nutritionTips (string — may be empty)
    expect(data).toHaveProperty('nutritionTips');
    expect(typeof data.nutritionTips).toBe('string');

    // vitaminRecommendations (string — may be empty)
    expect(data).toHaveProperty('vitaminRecommendations');
    expect(typeof data.vitaminRecommendations).toBe('string');

    // symptomsCommon (string — may be empty)
    expect(data).toHaveProperty('symptomsCommon');
    expect(typeof data.symptomsCommon).toBe('string');

    // babySize (non-empty string)
    expect(data).toHaveProperty('babySize');
    expect(typeof data.babySize).toBe('string');
    expect(data.babySize.length).toBeGreaterThan(0);

    // babyWeightGrams (integer)
    expect(data).toHaveProperty('babyWeightGrams');
    expect(typeof data.babyWeightGrams).toBe('number');
    expect(Number.isInteger(data.babyWeightGrams)).toBe(true);

    // createdAt (Timestamp or null for serverTimestamp placeholder)
    expect(data).toHaveProperty('createdAt');
    expect(
      data.createdAt === null || data.createdAt instanceof Timestamp,
    ).toBe(true);

    // updatedAt (Timestamp or null for serverTimestamp placeholder)
    expect(data).toHaveProperty('updatedAt');
    expect(
      data.updatedAt === null || data.updatedAt instanceof Timestamp,
    ).toBe(true);
  });

  test('idempotency — running twice still produces exactly 80 documents', async () => {
    await seedPregnancyData(db);
    await seedPregnancyData(db);
    const snapshot = await db.collection(COLLECTION).get();
    expect(snapshot.size).toBe(80);
  });

  test('ru and en documents for same week have identical babyWeightGrams', async () => {
    await seedPregnancyData(db);
    for (let week = 1; week <= 40; week++) {
      const ruSnap = await db.collection(COLLECTION).doc(week + '_ru').get();
      const enSnap = await db.collection(COLLECTION).doc(week + '_en').get();
      expect(ruSnap.exists).toBe(true);
      expect(enSnap.exists).toBe(true);
      const ruData = ruSnap.data();
      const enData = enSnap.data();
      expect(ruData.babyWeightGrams).toBe(enData.babyWeightGrams);
    }
  });

  test('seedPregnancyData returns correct summary', async () => {
    const result = await seedPregnancyData(db);
    expect(result).toEqual({ ru: 40, en: 40 });
  });
});
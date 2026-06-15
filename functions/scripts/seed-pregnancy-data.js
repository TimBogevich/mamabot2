#!/usr/bin/env node
/**
 * @fileoverview Seed script for the pregnancy_data Firestore collection.
 *
 * Loads bilingual pregnancy week data (ru/en) from JSON files and writes
 * each week as a separate document in the pregnancy_data collection.
 * Uses set() with a composite document ID ({weekNumber}_{language}) so
 * re-running is idempotent and doesn't create duplicates.
 *
 * Prerequisites (one of):
 *   1. FIRESTORE_EMULATOR_HOST set — run with Firestore emulator
 *   2. GOOGLE_APPLICATION_CREDENTIALS set — run with a service account
 *   3. gcloud auth application-default login — run with ADC
 *
 * Usage:
 *   node scripts/seed-pregnancy-data.js
 *
 *   # With emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-pregnancy-data.js
 *
 *   # With service account:
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/seed-pregnancy-data.js
 */

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const PROJECT_ID = 'mamabot-97d22';
const COLLECTION = 'pregnancy_data';

function loadJSON(filename) {
  const filePath = path.resolve(__dirname, '..', 'src', 'data', filename);
  return require(filePath);
}

async function main() {
  console.log('\n  \u{1F331} Seeding pregnancy_data collection\u2026\n');
  console.log('  Project:  ' + PROJECT_ID);
  const backend = process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : 'Firestore (ADC)';
  console.log('  Backend:  ' + backend + '\n');

  // Load data
  const ruWeeks = loadJSON('pregnancyWeeks_ru.json');
  const enWeeks = loadJSON('pregnancyWeeks_en.json');

  console.log('  \u{1F4D6} Loaded ' + ruWeeks.length + ' weeks (ru), ' + enWeeks.length + ' weeks (en)\n');

  // Validate both have 40 weeks
  if (ruWeeks.length !== 40) {
    throw new Error('Expected 40 weeks for ru, got ' + ruWeeks.length);
  }
  if (enWeeks.length !== 40) {
    throw new Error('Expected 40 weeks for en, got ' + enWeeks.length);
  }

  // Initialize Firestore
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
  }
  const db = getFirestore();
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    db.settings({
      host: process.env.FIRESTORE_EMULATOR_HOST,
      ssl: false,
    });
  }

  // Seed Russian weeks
  console.log('  \u{1F1F7}\u{1F1FA} Seeding Russian pregnancy weeks\u2026');
  for (const week of ruWeeks) {
    const docId = week.weekNumber + '_ru';
    const docRef = db.collection(COLLECTION).doc(docId);
    await docRef.set({
      ...week,
      language: 'ru',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log('  \u2705 Seeded ' + ruWeeks.length + ' ru documents\n');

  // Seed English weeks
  console.log('  \u{1F1EC}\u{1F1E7} Seeding English pregnancy weeks\u2026');
  for (const week of enWeeks) {
    const docId = week.weekNumber + '_en';
    const docRef = db.collection(COLLECTION).doc(docId);
    await docRef.set({
      ...week,
      language: 'en',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log('  \u2705 Seeded ' + enWeeks.length + ' en documents\n');

  console.log('  \u{1F389} Seeded ' + ruWeeks.length + ' pregnancies for ru, ' + enWeeks.length + ' for en\n');
  process.exit(0);
}

main().catch(function (err) {
  console.error('\n  \u274C Error: ' + err.message + '\n');
  console.error('  Make sure one of these is set:\n');
  console.error('    FIRESTORE_EMULATOR_HOST=localhost:8080');
  console.error('    GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json');
  console.error('    (or run: gcloud auth application-default login)\n');
  process.exit(1);
});
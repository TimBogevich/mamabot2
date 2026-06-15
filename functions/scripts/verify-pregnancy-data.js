#!/usr/bin/env node
/**
 * @fileoverview Verification script for the pregnancy_data Firestore schema.
 *
 * Writes a test document (week=1, lang=ru) to the pregnancy_data collection,
 * reads it back, validates all fields, and cleans up.
 *
 * Prerequisites (one of):
 *   1. FIRESTORE_EMULATOR_HOST set — run with Firestore emulator
 *   2. GOOGLE_APPLICATION_CREDENTIALS set — run with a service account
 *   3. gcloud auth application-default login — run with ADC
 *
 * Usage:
 *   node scripts/verify-pregnancy-data.js
 *
 *   # With emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/verify-pregnancy-data.js
 *
 *   # With service account:
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/verify-pregnancy-data.js
 */

const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = "mamabot-97d22";
const COLLECTION = "pregnancy_data";
const DOC_ID = "1_ru";

const TEST_DOC = {
  weekNumber: 1,
  language: "ru",
  babyDevelopment:
    "Оплодотворённая яйцеклетка начинает активно делиться, " +
    "продвигаясь по маточной трубе в полость матки.",
  motherChanges:
    "Задержка менструации — самый первый и главный признак " +
    "беременности. Могут появиться лёгкие кровянистые выделения.",
  nutritionTips:
    "Начните приём фолиевой кислоты, если ещё не начали. " +
    "Пейте достаточное количество воды.",
  vitaminRecommendations: "Фолиевая кислота 400 мкг/сутки",
  symptomsCommon:
    "Усталость, чувствительность груди, тошнота, повышенная утомляемость",
  babySize: "размером с маковое зёрнышко",
  babyWeightGrams: 1,
};

async function main() {
  console.log(`\n  🔍 Verifying pregnancy_data schema…\n`);
  console.log(`  Project:  ${PROJECT_ID}`);
  console.log(`  Document: ${COLLECTION}/${DOC_ID}`);
  console.log(`  Backend:  ${process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : "Firestore (ADC)"}\n`);

  // Initialize
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

  const docRef = db.collection(COLLECTION).doc(DOC_ID);
  const expectedFields = Object.keys(TEST_DOC);

  // --- Step 1: Write ---
  console.log("  📝 Writing test document…");
  await docRef.set({
    ...TEST_DOC,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("  ✅ Document written\n");

  // --- Step 2: Read back ---
  console.log("  📖 Reading document back…");
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Document not found after write");
  }
  const data = snap.data();
  console.log("  ✅ Document read successfully\n");

  // --- Step 3: Verify fields ---
  console.log("  ✅ Verifying fields:");
  let allOk = true;
  for (const field of expectedFields) {
    if (data[field] === TEST_DOC[field]) {
      console.log(`    ✓ ${field}: "${TEST_DOC[field]}"`);
    } else {
      console.log(`    ✗ ${field}: expected "${TEST_DOC[field]}", got "${data[field]}"`);
      allOk = false;
    }
  }

  // Verify timestamps exist
  if (data.createdAt) {
    console.log(`    ✓ createdAt: ${data.createdAt.toDate().toISOString()}`);
  } else {
    console.log(`    ✗ createdAt: missing`);
    allOk = false;
  }
  if (data.updatedAt) {
    console.log(`    ✓ updatedAt: ${data.updatedAt.toDate().toISOString()}`);
  } else {
    console.log(`    ✗ updatedAt: missing`);
    allOk = false;
  }

  console.log(`\n  ${allOk ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}\n`);

  // --- Step 4: Clean up ---
  await docRef.delete();
  console.log("  🧹 Test document deleted\n");

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n  ❌ Error: ${err.message}\n`);
  console.error(`  Make sure one of these is set:\n`);
  console.error(`    FIRESTORE_EMULATOR_HOST=localhost:8080`);
  console.error(`    GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`);
  console.error(`    (or run: gcloud auth application-default login)\n`);
  process.exit(1);
});
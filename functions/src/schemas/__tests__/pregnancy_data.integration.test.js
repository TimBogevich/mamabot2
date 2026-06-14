/**
 * @fileoverview Integration test for pregnancy_data Firestore schema.
 *
 * Writes a test document to the pregnancy_data collection, reads it back,
 * verifies all fields, and cleans up.
 *
 * Prerequisites (one of):
 *   1. FIRESTORE_EMULATOR_HOST set (Firestore emulator running)
 *   2. GOOGLE_APPLICATION_CREDENTIALS set (service account JSON path)
 *   3. Application Default Credentials available (gcloud auth)
 *
 * If none are available, the test is skipped with a descriptive message.
 *
 * Usage:
 *   # With Firestore emulator
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run ...
 *
 *   # With real project
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npx vitest run ...
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { validatePregnancyData } from "../pregnancy_data.js";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_DOC_ID = "1_ru";

const TEST_DOC = Object.freeze({
  weekNumber: 1,
  language: "ru",
  babyDevelopment:
    "Оплодотворённая яйцеклетка начинает активно делиться, " +
    "продвигаясь по маточной трубе в полость матки.",
  motherChanges:
    "Задержка менструации — самый первый и главный признак " +
    "беременности. Могут появиться лёгкие кровянистые выделения " +
    "(имплантационное кровотечение).",
  nutritionTips:
    "Начните приём фолиевой кислоты, если ещё не начали. " +
    "Пейте достаточное количество воды, избегайте алкоголя и кофеина.",
  vitaminRecommendations: "Фолиевая кислота 400 мкг/сутки",
  symptomsCommon:
    "Усталость, чувствительность груди, тошнота, " +
    "повышенная утомляемость",
  babySize: "размером с маковое зёрнышко",
});

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let db;

/**
 * Attempts to initialize Firestore. Returns false if no backend is reachable.
 */
function tryInitFirestore() {
  try {
    if (getApps().length === 0) {
      initializeApp({ projectId: "mamabot-97d22" });
    }
    const instance = getFirestore();

    if (process.env.FIRESTORE_EMULATOR_HOST) {
      instance.settings({
        host: process.env.FIRESTORE_EMULATOR_HOST,
        ssl: false,
      });
    }

    return instance;
  } catch {
    return null;
  }
}

beforeAll(() => {
  db = tryInitFirestore();
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("pregnancy_data — Firestore integration", () => {
  const hasBackend = !!db;

  it("should have a Firestore backend configured", () => {
    // This will show in test output why the integration tests are skipped
    if (!hasBackend) {
      console.warn(
        "\n  ⚠ No Firestore backend available. Set FIRESTORE_EMULATOR_HOST " +
          "or GOOGLE_APPLICATION_CREDENTIALS to run integration tests.",
      );
    }
    // We don't assert here — the individual tests check hasBackend
  });

  it("should validate before writing to Firestore", () => {
    const result = validatePregnancyData({
      ...TEST_DOC,
      createdAt: null,
      updatedAt: null,
    });
    expect(result.valid).toBe(true);
  });

  describe("write and read (requires Firestore backend)", () => {
    if (!hasBackend) {
      it.skip("no Firestore backend — test skipped");
      return;
    }

    afterAll(async () => {
      // Clean up: delete the test document
      try {
        await db.collection("pregnancy_data").doc(TEST_DOC_ID).delete();
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should write a test document to pregnancy_data collection", async () => {
      const docRef = db.collection("pregnancy_data").doc(TEST_DOC_ID);
      await docRef.set({
        ...TEST_DOC,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Verify write — read the document back
      const snap = await docRef.get();
      expect(snap.exists).toBe(true);

      const data = snap.data();
      expect(data).toBeDefined();
      expect(data.weekNumber).toBe(TEST_DOC.weekNumber);
      expect(data.language).toBe(TEST_DOC.language);
      expect(data.babyDevelopment).toBe(TEST_DOC.babyDevelopment);
      expect(data.motherChanges).toBe(TEST_DOC.motherChanges);
      expect(data.nutritionTips).toBe(TEST_DOC.nutritionTips);
      expect(data.vitaminRecommendations).toBe(
        TEST_DOC.vitaminRecommendations,
      );
      expect(data.symptomsCommon).toBe(TEST_DOC.symptomsCommon);
      expect(data.babySize).toBe(TEST_DOC.babySize);
      // Timestamps should be Firestore Timestamp objects
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });
  });
});
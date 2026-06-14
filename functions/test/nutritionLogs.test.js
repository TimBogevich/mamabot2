/**
 * @fileoverview Integration tests for the nutrition_logs Firestore schema.
 *
 * Tests the create, read, validation, and query helpers for nutrition_logs
 * documents using a live Firestore instance (production or emulator).
 *
 * Environment variable support:
 *   FIRESTORE_EMULATOR_HOST — connect to Firestore emulator when set
 *   FIRESTORE_PROJECT_ID    — Firestore project ID (default: mamabot-test)
 *
 * Run: node --test functions/test/nutritionLogs.test.js
 */

const { describe, it, after, before } = require("node:test");
const assert = require("node:assert");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {
  NUTRITION_LOGS_COLLECTION,
  validateNutritionLog,
  createNutritionLog,
  getNutritionLogsByUserAndDate,
} = require("../src/schemas/nutritionLogs");

// ---------------------------------------------------------------------------
// Lazy Firestore initializer
// ---------------------------------------------------------------------------

let _db = null;
let _dbReady; // undefined = not yet tried; false = failed; true = succeeded

/**
 * Returns a Firestore instance if the backend is reachable, or null.
 * On first call, initializes Firebase and probes connectivity.
 *
 * @returns {import("firebase-admin/firestore").Firestore|null}
 */
async function getDb() {
  if (_dbReady) return _db;
  if (_dbReady === false) return null;

  try {
    if (getApps().length === 0) {
      initializeApp({
        projectId: process.env.FIRESTORE_PROJECT_ID || "mamabot-test",
      });
    }
    const db = getFirestore();

    if (process.env.FIRESTORE_EMULATOR_HOST) {
      db.settings({
        host: process.env.FIRESTORE_EMULATOR_HOST,
        ssl: false,
      });
    }

    // Probe connectivity
    await db.collection(NUTRITION_LOGS_COLLECTION).limit(1).get();

    _db = db;
    _dbReady = true;
    return db;
  } catch (err) {
    console.warn(
      "Firestore not available — integration tests will be skipped.",
      err.message,
    );
    _dbReady = false;
    return null;
  }
}

/** Prefix for all test documents to enable cleanup */
const TEST_PREFIX = "_test_nutrition_";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deletes all test documents (documents whose userId starts with TEST_PREFIX).
 * @param {import("firebase-admin/firestore").Firestore} db
 */
async function cleanupTestDocs(db) {
  if (!db) return;
  try {
    const snapshot = await db
      .collection(NUTRITION_LOGS_COLLECTION)
      .where("userId", ">=", TEST_PREFIX)
      .where("userId", "<", TEST_PREFIX + "\uf8ff")
      .get();

    const batch = db.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    if (snapshot.size > 0) {
      await batch.commit();
    }
  } catch {
    // Ignore cleanup errors
  }
}

/** A minimal valid nutrition log data object with createdAt: null for validation */
function validNutritionLogData(overrides = {}) {
  return {
    userId: "user1",
    date: "2026-06-15",
    mealType: "lunch",
    foods: ["apple", "banana"],
    waterGlasses: 2,
    createdAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Validation tests (no Firestore needed)
// ---------------------------------------------------------------------------

describe("nutrition_logs — validation", () => {
  it("should reject invalid mealType ('invalid')", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ mealType: "invalid" }),
    );
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("mealType")),
      "Should mention mealType field",
    );
  });

  it("should reject empty string mealType", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ mealType: "" }),
    );
    assert.strictEqual(result.valid, false);
  });

  it("should reject empty foods array", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ foods: [] }),
    );
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("foods")),
      "Should mention foods field",
    );
  });

  it("should reject foods array with empty string item", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ foods: [""] }),
    );
    assert.strictEqual(result.valid, false);
  });

  it("should reject negative waterGlasses", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ waterGlasses: -1 }),
    );
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("waterGlasses")),
      "Should mention waterGlasses field",
    );
  });

  it("should reject missing userId", () => {
    const data = validNutritionLogData();
    delete data.userId;
    const result = validateNutritionLog(data);
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("userId")),
      "Should mention userId",
    );
  });

  it("should reject missing date", () => {
    const data = validNutritionLogData();
    delete data.date;
    const result = validateNutritionLog(data);
    assert.strictEqual(result.valid, false);
  });

  it("should reject missing mealType", () => {
    const data = validNutritionLogData();
    delete data.mealType;
    const result = validateNutritionLog(data);
    assert.strictEqual(result.valid, false);
  });

  it("should reject missing foods", () => {
    const data = validNutritionLogData();
    delete data.foods;
    const result = validateNutritionLog(data);
    assert.strictEqual(result.valid, false);
  });

  it("should reject invalid date format", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ date: "not-a-date" }),
    );
    assert.strictEqual(result.valid, false);
  });

  it("should accept valid meal types (breakfast, lunch, dinner, snack)", () => {
    for (const mealType of ["breakfast", "lunch", "dinner", "snack"]) {
      const result = validateNutritionLog(
        validNutritionLogData({ mealType }),
      );
      assert.strictEqual(
        result.valid,
        true,
        `Should accept mealType="${mealType}"`,
      );
    }
  });

  it("should accept a valid nutrition log with vitamins and waterGlasses", () => {
    const result = validateNutritionLog(
      validNutritionLogData({
        vitamins: ["vitamin D", "iron"],
        waterGlasses: 5,
      }),
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should accept waterGlasses = 0", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ waterGlasses: 0 }),
    );
    assert.strictEqual(result.valid, true);
  });

  it("should reject non-integer waterGlasses", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ waterGlasses: 2.5 }),
    );
    assert.strictEqual(result.valid, false);
  });

  it("should reject null for non-nullable field", () => {
    const result = validateNutritionLog(
      validNutritionLogData({ userId: null }),
    );
    assert.strictEqual(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// createNutritionLog factory tests (no Firestore needed)
// ---------------------------------------------------------------------------

describe("createNutritionLog() — factory function", () => {
  it("should return a valid document object with all fields", () => {
    const doc = createNutritionLog({
      userId: "user1",
      date: "2026-06-15",
      mealType: "dinner",
      foods: ["chicken", "rice", "broccoli"],
      vitamins: ["vitamin C"],
      waterGlasses: 3,
    });
    assert.strictEqual(doc.userId, "user1");
    assert.strictEqual(doc.date, "2026-06-15");
    assert.strictEqual(doc.mealType, "dinner");
    assert.deepStrictEqual(doc.foods, ["chicken", "rice", "broccoli"]);
    assert.deepStrictEqual(doc.vitamins, ["vitamin C"]);
    assert.strictEqual(doc.waterGlasses, 3);
    assert.ok(doc.createdAt);
  });

  it("should default vitamins to empty array when not provided", () => {
    const doc = createNutritionLog({
      userId: "user1",
      date: "2026-06-15",
      mealType: "breakfast",
      foods: ["toast"],
      waterGlasses: 1,
    });
    assert.deepStrictEqual(doc.vitamins, []);
  });

  it("should default waterGlasses to 0 when not provided", () => {
    const doc = createNutritionLog({
      userId: "user1",
      date: "2026-06-15",
      mealType: "snack",
      foods: ["apple"],
    });
    assert.strictEqual(doc.waterGlasses, 0);
  });

  it("should default both vitamins and waterGlasses when omitted", () => {
    const doc = createNutritionLog({
      userId: "user1",
      date: "2026-06-15",
      mealType: "lunch",
      foods: ["salad"],
    });
    assert.deepStrictEqual(doc.vitamins, []);
    assert.strictEqual(doc.waterGlasses, 0);
  });

  it("should throw on invalid data", () => {
    assert.throws(
      () =>
        createNutritionLog({
          userId: "user1",
          date: "2026-06-15",
          mealType: "invalid",
          foods: ["apple"],
        }),
      /validation failed/i,
    );
  });

  it("should throw on empty foods array", () => {
    assert.throws(
      () =>
        createNutritionLog({
          userId: "user1",
          date: "2026-06-15",
          mealType: "lunch",
          foods: [],
        }),
      /validation failed/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Firestore integration tests (dynamically skipped when no backend)
// ---------------------------------------------------------------------------

describe("nutrition_logs — Firestore integration", () => {
  let db = null;
  let firestoreOk = false;

  before(async () => {
    db = await getDb();
    firestoreOk = db !== null;
  });

  after(async () => {
    if (db) {
      await cleanupTestDocs(db);
    }
  });

  it("should create and read a nutrition_log document", { skip: () => !firestoreOk }, async () => {
    const docData = createNutritionLog({
      userId: `${TEST_PREFIX}cr_test`,
      date: "2026-06-15",
      mealType: "lunch",
      foods: ["sandwich", "apple", "water"],
      vitamins: ["vitamin D"],
      waterGlasses: 2,
    });

    const ref = await db.collection(NUTRITION_LOGS_COLLECTION).add(docData);
    const snap = await ref.get();
    assert.ok(snap.exists, "Document should exist");

    const data = snap.data();
    assert.strictEqual(data.userId, `${TEST_PREFIX}cr_test`);
    assert.strictEqual(data.date, "2026-06-15");
    assert.strictEqual(data.mealType, "lunch");
    assert.deepStrictEqual(data.foods, ["sandwich", "apple", "water"]);
    assert.deepStrictEqual(data.vitamins, ["vitamin D"]);
    assert.strictEqual(data.waterGlasses, 2);
    assert.ok(data.createdAt, "createdAt should be set (may be Timestamp)");

    await ref.delete();
  });

  it("should have vitamins default to empty array in Firestore", { skip: () => !firestoreOk }, async () => {
    const docData = createNutritionLog({
      userId: `${TEST_PREFIX}vitamins_test`,
      date: "2026-06-15",
      mealType: "breakfast",
      foods: ["toast"],
      waterGlasses: 1,
    });
    // vitamins is not passed, so it should default to []

    const ref = await db.collection(NUTRITION_LOGS_COLLECTION).add(docData);
    const snap = await ref.get();
    const data = snap.data();
    assert.deepStrictEqual(
      data.vitamins,
      [],
      "vitamins should default to empty array",
    );

    await ref.delete();
  });

  it("should query by userId + date range", { skip: () => !firestoreOk }, async () => {
    const testUserId = `${TEST_PREFIX}query_test`;

    // Create 3 documents with different dates
    const entries = [
      { date: "2026-06-10", mealType: "breakfast", foods: ["eggs"] },
      { date: "2026-06-12", mealType: "lunch", foods: ["salad"] },
      { date: "2026-06-14", mealType: "dinner", foods: ["pasta"] },
    ];

    const refs = [];
    for (const entry of entries) {
      const docData = createNutritionLog({
        userId: testUserId,
        date: entry.date,
        mealType: entry.mealType,
        foods: entry.foods,
        waterGlasses: 1,
      });
      const ref = await db.collection(NUTRITION_LOGS_COLLECTION).add(docData);
      refs.push(ref);
    }

    try {
      const docs = await getNutritionLogsByUserAndDate(
        db,
        testUserId,
        "2026-06-09",
        "2026-06-15",
      );

      assert.strictEqual(docs.length, 3, "Should return all 3 documents");
      // Should be ordered by date descending
      assert.strictEqual(docs[0].date, "2026-06-14");
      assert.strictEqual(docs[1].date, "2026-06-12");
      assert.strictEqual(docs[2].date, "2026-06-10");
    } finally {
      const batch = db.batch();
      for (const ref of refs) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  });

  it("should return empty array for non-matching date range", { skip: () => !firestoreOk }, async () => {
    const docs = await getNutritionLogsByUserAndDate(
      db,
      `${TEST_PREFIX}empty_test`,
      "2025-01-01",
      "2025-01-31",
    );

    assert.strictEqual(docs.length, 0, "Should return empty array");
  });
});
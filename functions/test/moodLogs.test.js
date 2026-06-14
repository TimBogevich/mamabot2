/**
 * @fileoverview Integration tests for the mood_logs Firestore schema.
 *
 * Tests the create, read, validation, and query helpers for mood_logs
 * documents using a live Firestore instance (production or emulator).
 *
 * Environment variable support:
 *   FIRESTORE_EMULATOR_HOST — connect to Firestore emulator when set
 *   FIRESTORE_PROJECT_ID    — Firestore project ID (default: mamabot-test)
 *
 * Run: node --test functions/test/moodLogs.test.js
 */

const { describe, it, after, before } = require("node:test");
const assert = require("node:assert");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {
  MOOD_LOGS_COLLECTION,
  validateMoodLog,
  createMoodLog,
  getMoodLogsByUserAndDate,
} = require("../src/schemas/moodLogs");

// ---------------------------------------------------------------------------
// Lazy Firestore initializer
// ---------------------------------------------------------------------------

let _db = null;
let _dbReady; // undefined = not yet tried; false = failed; true = succeeded

/**
 * Returns a Firestore instance if the backend is reachable, or null.
 * On first call, initializes Firebase and probes connectivity by listing
 * the mood_logs collection (empty result is fine).
 *
 * @returns {import("firebase-admin/firestore").Firestore|null}
 */
async function getDb() {
  if (_dbReady) return _db;
  if (_dbReady === false) return null; // already failed

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

    // Probe connectivity with a lightweight list operation
    // Use limit(1) so we never fetch more than necessary
    await db.collection(MOOD_LOGS_COLLECTION).limit(1).get();

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
const TEST_PREFIX = "_test_mood_";

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
      .collection(MOOD_LOGS_COLLECTION)
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

/** A minimal valid mood log data object with createdAt: null for validation */
function validMoodLogData(overrides = {}) {
  return {
    userId: "user1",
    date: "2026-06-15",
    mood: 3,
    energy: 3,
    createdAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Validation tests (no Firestore needed)
// ---------------------------------------------------------------------------

describe("mood_logs — validation", () => {
  it("should reject invalid mood (0)", () => {
    const result = validateMoodLog(validMoodLogData({ mood: 0 }));
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("mood")),
      "Should mention mood field",
    );
  });

  it("should reject invalid mood (6)", () => {
    const result = validateMoodLog(validMoodLogData({ mood: 6 }));
    assert.strictEqual(result.valid, false);
  });

  it("should reject invalid energy (0)", () => {
    const result = validateMoodLog(validMoodLogData({ energy: 0 }));
    assert.strictEqual(result.valid, false);
  });

  it("should reject invalid energy (6)", () => {
    const result = validateMoodLog(validMoodLogData({ energy: 6 }));
    assert.strictEqual(result.valid, false);
  });

  it("should reject missing userId", () => {
    const data = validMoodLogData();
    delete data.userId;
    const result = validateMoodLog(data);
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("userId")),
      "Should mention userId",
    );
  });

  it("should reject missing date", () => {
    const data = validMoodLogData();
    delete data.date;
    const result = validateMoodLog(data);
    assert.strictEqual(result.valid, false);
  });

  it("should reject missing mood", () => {
    const data = validMoodLogData();
    delete data.mood;
    const result = validateMoodLog(data);
    assert.strictEqual(result.valid, false);
  });

  it("should reject missing energy", () => {
    const data = validMoodLogData();
    delete data.energy;
    const result = validateMoodLog(data);
    assert.strictEqual(result.valid, false);
  });

  it("should reject invalid date format", () => {
    const result = validateMoodLog(validMoodLogData({ date: "15-06-2026" }));
    assert.strictEqual(result.valid, false);
  });

  it("should accept a valid mood log with note field omitted", () => {
    const result = validateMoodLog(validMoodLogData());
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should accept a valid mood log with empty note string", () => {
    const result = validateMoodLog(validMoodLogData({ note: "" }));
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should accept boundary mood values (1 and 5)", () => {
    assert.strictEqual(
      validateMoodLog(validMoodLogData({ mood: 1 })).valid,
      true,
    );
    assert.strictEqual(
      validateMoodLog(validMoodLogData({ mood: 5 })).valid,
      true,
    );
  });

  it("should accept boundary energy values (1 and 5)", () => {
    assert.strictEqual(
      validateMoodLog(validMoodLogData({ energy: 1 })).valid,
      true,
    );
    assert.strictEqual(
      validateMoodLog(validMoodLogData({ energy: 5 })).valid,
      true,
    );
  });

  it("should reject non-integer mood", () => {
    const result = validateMoodLog(validMoodLogData({ mood: 3.5 }));
    assert.strictEqual(result.valid, false);
  });

  it("should reject null for non-nullable field", () => {
    const result = validateMoodLog(validMoodLogData({ userId: null }));
    assert.strictEqual(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// createMoodLog factory tests (no Firestore needed)
// ---------------------------------------------------------------------------

describe("createMoodLog() — factory function", () => {
  it("should return a valid document object with all fields", () => {
    const doc = createMoodLog({
      userId: "user1",
      date: "2026-06-15",
      mood: 4,
      energy: 3,
      note: "Great day!",
    });
    assert.strictEqual(doc.userId, "user1");
    assert.strictEqual(doc.date, "2026-06-15");
    assert.strictEqual(doc.mood, 4);
    assert.strictEqual(doc.energy, 3);
    assert.strictEqual(doc.note, "Great day!");
    assert.ok(doc.createdAt);
  });

  it("should default note to empty string when not provided", () => {
    const doc = createMoodLog({
      userId: "user1",
      date: "2026-06-15",
      mood: 3,
      energy: 3,
    });
    assert.strictEqual(doc.note, "");
  });

  it("should throw on invalid data", () => {
    assert.throws(
      () =>
        createMoodLog({
          userId: "user1",
          date: "invalid",
          mood: 3,
          energy: 3,
        }),
      /validation failed/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Firestore integration tests (dynamically skipped when no backend)
// ---------------------------------------------------------------------------

describe("mood_logs — Firestore integration", () => {
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

  it("should create and read a mood_log document", { skip: () => !firestoreOk }, async () => {
    const docData = createMoodLog({
      userId: `${TEST_PREFIX}cr_test`,
      date: "2026-06-15",
      mood: 4,
      energy: 3,
      note: "Feeling good today",
    });

    const ref = await db.collection(MOOD_LOGS_COLLECTION).add(docData);
    const snap = await ref.get();
    assert.ok(snap.exists, "Document should exist");

    const data = snap.data();
    assert.strictEqual(data.userId, `${TEST_PREFIX}cr_test`);
    assert.strictEqual(data.date, "2026-06-15");
    assert.strictEqual(data.mood, 4);
    assert.strictEqual(data.energy, 3);
    assert.strictEqual(data.note, "Feeling good today");
    assert.ok(data.createdAt, "createdAt should be set (may be Timestamp)");

    // Clean up
    await ref.delete();
  });

  it("should query by userId + date range", { skip: () => !firestoreOk }, async () => {
    const testUserId = `${TEST_PREFIX}query_test`;

    // Create 3 documents with different dates
    const dates = [
      { date: "2026-06-10", mood: 2, energy: 2 },
      { date: "2026-06-12", mood: 4, energy: 3 },
      { date: "2026-06-14", mood: 5, energy: 5 },
    ];

    const refs = [];
    for (const d of dates) {
      const docData = createMoodLog({
        userId: testUserId,
        date: d.date,
        mood: d.mood,
        energy: d.energy,
        note: "",
      });
      const ref = await db.collection(MOOD_LOGS_COLLECTION).add(docData);
      refs.push(ref);
    }

    try {
      const docs = await getMoodLogsByUserAndDate(
        db,
        testUserId,
        "2026-06-09",
        "2026-06-15",
      );

      assert.strictEqual(docs.length, 3, "Should return all 3 documents");
      assert.strictEqual(docs[0].date, "2026-06-14");
      assert.strictEqual(docs[1].date, "2026-06-12");
      assert.strictEqual(docs[2].date, "2026-06-10");
    } finally {
      // Clean up
      const batch = db.batch();
      for (const ref of refs) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  });

  it("should return empty array for non-matching date range", { skip: () => !firestoreOk }, async () => {
    const docs = await getMoodLogsByUserAndDate(
      db,
      `${TEST_PREFIX}empty_test`,
      "2025-01-01",
      "2025-01-31",
    );

    assert.strictEqual(docs.length, 0, "Should return empty array");
  });
});
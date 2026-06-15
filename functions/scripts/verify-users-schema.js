#!/usr/bin/env node
/**
 * @fileoverview Verification script for the users Firestore schema.
 *
 * Creates a test user document in the `users` collection, reads it back,
 * validates all fields match the expected schema, and cleans up.
 *
 * Supports multiple authentication methods (tried in order):
 *   1. FIRESTORE_EMULATOR_HOST — local Firestore emulator
 *   2. GOOGLE_APPLICATION_CREDENTIALS — service account key file
 *   3. gcloud auth application-default login — ADC
 *   4. Firebase CLI cached token (firebase-tools.json) — CI / local
 *
 * Usage:
 *   node scripts/verify-users-schema.js
 *
 *   # With emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/verify-users-schema.js
 *
 *   # With service account:
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/verify-users-schema.js
 */

const PROJECT_ID = "mamabot-97d22";
const COLLECTION = "users";
const TEST_CHAT_ID = 999999999;

const TEST_DOC = {
  chatId: TEST_CHAT_ID,
  userId: "999999999",
  firstName: "Test",
  lastName: "User",
  username: "test_user",
  language: "ru",
  lmpDate: "2026-01-15",
  currentWeek: 21,
  eddDate: "2026-12-20",
  partnerCode: "ABC123",
  role: "mom",
};

// ---------------------------------------------------------------------------
// Authentication helpers
// ---------------------------------------------------------------------------

/**
 * Reads the Firebase CLI access token from the local config store.
 *
 * @returns {string|null} Access token, or null if not available
 */
function readFirebaseCliToken() {
  try {
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(
      require("os").homedir(),
      ".config",
      "configstore",
      "firebase-tools.json",
    );
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config.tokens?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Detects whether the Firebase Admin SDK can initialise via ADC.
 */
function hasAdcCredentials() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIRESTORE_EMULATOR_HOST
  );
}

// ---------------------------------------------------------------------------
// Firestore REST API client (used when ADC is not available)
// ---------------------------------------------------------------------------

/**
 * Builds a Firestore REST API URL for a collection.
 *
 * @param {string} collection
 * @returns {string}
 */
function collectionUrl(collection) {
  return (
    "https://firestore.googleapis.com/v1/projects/" +
    PROJECT_ID +
    "/databases/(default)/documents/" +
    collection
  );
}

/**
 * Builds a Firestore REST API URL for a document.
 *
 * @param {string} collection
 * @param {string} docId
 * @returns {string}
 */
function documentUrl(collection, docId) {
  return collectionUrl(collection) + "/" + docId;
}

/**
 * Converts a flat JS object to Firestore REST API fields format.
 *
 * @param {Object} doc
 * @returns {Object}
 */
function toFields(doc) {
  const fields = {};
  for (const [key, value] of Object.entries(doc)) {
    if (typeof value === "number") {
      fields[key] = { integerValue: String(value) };
    } else if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    }
  }
  return fields;
}

/**
 * Converts Firestore REST API fields back to a flat JS object.
 *
 * @param {Object} fields
 * @returns {Object}
 */
function fromFields(fields) {
  const obj = {};
  for (const [key, field] of Object.entries(fields)) {
    if ("integerValue" in field) {
      obj[key] = Number(field.integerValue);
    } else if ("stringValue" in field) {
      obj[key] = field.stringValue;
    } else if ("booleanValue" in field) {
      obj[key] = field.booleanValue;
    } else if ("timestampValue" in field) {
      obj[key] = field.timestampValue;
    }
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Verification logic (REST API variant — used when Admin SDK unavailable)
// ---------------------------------------------------------------------------

async function verifyViaRestApi(token) {
  console.log(`  Backend:    Firestore (REST API via Firebase CLI token)\n`);

  const url = documentUrl(COLLECTION, String(TEST_CHAT_ID));
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  const expectedFields = Object.keys(TEST_DOC);

  // --- Step 1: Write ---
  console.log("  📝 Writing test document…");
  const createUrl = collectionUrl(COLLECTION) + "?documentId=" + TEST_CHAT_ID;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ fields: toFields(TEST_DOC) }),
  });
  if (!createRes.ok) {
    throw new Error(
      "Write failed: " + createRes.status + " " + (await createRes.text()),
    );
  }
  console.log("  ✅ Document written\n");

  // --- Step 2: Read back ---
  console.log("  📖 Reading document back…");
  const readRes = await fetch(url, { headers });
  if (!readRes.ok) {
    throw new Error(
      "Read failed: " + readRes.status + " " + (await readRes.text()),
    );
  }
  const readData = await readRes.json();
  const data = fromFields(readData.fields);
  console.log("  ✅ Document read successfully\n");

  // --- Step 3: Verify fields ---
  console.log("  ✅ Verifying fields:");
  let allOk = true;
  for (const field of expectedFields) {
    if (data[field] === TEST_DOC[field]) {
      console.log(`    ✓ ${field}: "${TEST_DOC[field]}"`);
    } else {
      console.log(
        `    ✗ ${field}: expected "${TEST_DOC[field]}", got "${data[field]}"`,
      );
      allOk = false;
    }
  }

  // Timestamps are not set via REST API (no serverTimestamp equivalent),
  // so we skip timestamp validation in REST mode.
  console.log(`    ∼ createdAt: skipped (REST API mode)`);
  console.log(`    ∼ updatedAt: skipped (REST API mode)`);

  console.log(
    `\n  ${allOk ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}\n`,
  );

  // --- Step 4: Clean up ---
  const delRes = await fetch(url, { method: "DELETE", headers });
  if (!delRes.ok) {
    throw new Error(
      "Delete failed: " + delRes.status + " " + (await delRes.text()),
    );
  }
  console.log("  🧹 Test document deleted\n");

  process.exit(allOk ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Verification logic (Admin SDK variant — preferred path)
// ---------------------------------------------------------------------------

async function verifyViaAdminSdk() {
  const { db } = require("../src/firestore");
  const { FieldValue } = require("firebase-admin/firestore");

  const docRef = db.collection(COLLECTION).doc(String(TEST_CHAT_ID));
  const expectedFields = Object.keys(TEST_DOC);

  console.log(`  Backend:    ${process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : "Firestore (ADC)"}\n`);

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
      console.log(
        `    ✗ ${field}: expected "${TEST_DOC[field]}", got "${data[field]}"`,
      );
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

  console.log(
    `\n  ${allOk ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}\n`,
  );

  // --- Step 4: Clean up ---
  await docRef.delete();
  console.log("  🧹 Test document deleted\n");

  process.exit(allOk ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n  🔍 Verifying users schema…\n`);
  console.log(`  Collection: ${COLLECTION}`);
  console.log(`  Document:   ${COLLECTION}/${TEST_CHAT_ID}`);

  // Try Admin SDK path first (emulator or service account)
  if (hasAdcCredentials()) {
    return verifyViaAdminSdk();
  }

  // Fall back to REST API with Firebase CLI token
  const token = readFirebaseCliToken();
  if (token) {
    console.log(`  Auth:       Firebase CLI token\n`);
    return verifyViaRestApi(token);
  }

  // No credentials available
  console.error(`\n  ❌ No authentication method available.\n`);
  console.error(`  Set one of:\n`);
  console.error(`    FIRESTORE_EMULATOR_HOST=localhost:8080`);
  console.error(`    GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`);
  console.error(`    (or run: gcloud auth application-default login)\n`);
  console.error(`  Or run via Firebase CLI (firebase-tools.json is required).\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n  ❌ Error: ${err.message}\n`);
  process.exit(1);
});
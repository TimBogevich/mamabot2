/**
 * @fileoverview Integration tests for users collection helpers.
 *
 * Tests createUser, getUser, updateUser round-trip for the eddDate field
 * using the Firestore emulator. All tests are skipped if no Firestore
 * backend (emulator or ADC) is available.
 *
 * Prerequisites (one of):
 *   1. FIRESTORE_EMULATOR_HOST set (Firestore emulator running)
 *   2. GOOGLE_APPLICATION_CREDENTIALS set (service account JSON path)
 *   3. Application Default Credentials available (gcloud auth)
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run src/collections/__tests__/users.test.js
 *
 * @module users.test
 */

// ---------------------------------------------------------------------------
// Environment — prevent firebase-admin from hanging on credential lookups.
// Must be set before any firebase-dependent module is loaded.
// ---------------------------------------------------------------------------

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { createRequire } = require('node:module');

const req = createRequire(import.meta.url);
const { db } = req('../../firestore.js');
const { createUser, getUser, updateUser } = req('../users.js');

// ---------------------------------------------------------------------------
// Fixtures — unique chat IDs to avoid collisions between tests
// ---------------------------------------------------------------------------

const CHAT_ID_1 = 900000001;
const CHAT_ID_2 = 900000002;
const CHAT_ID_3 = 900000003;
const CHAT_ID_4 = 900000004;
const CHAT_ID_5 = 900000005;
const CHAT_ID_6 = 900000006;
const CHAT_ID_7 = 900000007;
const CHAT_ID_8 = 900000008;

const BASE_USER = {
  userId: '900000000',
  firstName: 'Test',
  lastName: 'User',
  username: 'test_user',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether the Firestore emulator (or backend) is actually reachable.
 *
 * @returns {Promise<boolean>}
 */
async function isFirestoreReachable() {
  try {
    const testRef = db.collection('_health_check').doc('_ping');
    await testRef.set({ ts: Date.now() });
    await testRef.delete();
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a test user document if it exists.
 *
 * @param {number} chatId
 */
async function deleteUser(chatId) {
  try {
    await db.collection('users').doc(String(chatId)).delete();
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Cleanup after all tests
// ---------------------------------------------------------------------------

afterAll(async () => {
  await Promise.all([
    deleteUser(CHAT_ID_1),
    deleteUser(CHAT_ID_2),
    deleteUser(CHAT_ID_3),
    deleteUser(CHAT_ID_4),
    deleteUser(CHAT_ID_5),
    deleteUser(CHAT_ID_6),
    deleteUser(CHAT_ID_7),
    deleteUser(CHAT_ID_8),
  ]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('users — Firestore integration', () => {
  let firestoreReady = false;

  beforeAll(async () => {
    firestoreReady = await isFirestoreReachable();
    if (!firestoreReady) {
      console.warn(
        '\n  ⚠ No Firestore backend available. Set FIRESTORE_EMULATOR_HOST ' +
          'or GOOGLE_APPLICATION_CREDENTIALS to run integration tests.',
      );
    }
  });

  describe('eddDate field round-trip', () => {
    if (!firestoreReady) {
      it.skip('no Firestore backend — test skipped');
      return;
    }

    it('should save eddDate via updateUser and return it via getUser', async () => {
      // Create a user without eddDate
      await createUser(CHAT_ID_1, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
      });

      // Update with eddDate
      await updateUser(CHAT_ID_1, { eddDate: '2026-12-20' });

      // Read back and verify
      const user = await getUser(CHAT_ID_1);
      expect(user).not.toBeNull();
      expect(user.eddDate).toBe('2026-12-20');
    });

    it('should allow setting eddDate directly via createUser', async () => {
      await createUser(CHAT_ID_2, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
        eddDate: '2026-11-15',
      });

      const user = await getUser(CHAT_ID_2);
      expect(user).not.toBeNull();
      expect(user.eddDate).toBe('2026-11-15');
    });

    it('should update an existing eddDate value', async () => {
      // Create with initial eddDate
      await createUser(CHAT_ID_3, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
        eddDate: '2026-10-01',
      });

      // Update eddDate to a new value
      await updateUser(CHAT_ID_3, { eddDate: '2026-12-25' });

      // Read back and verify new value
      const user = await getUser(CHAT_ID_3);
      expect(user).not.toBeNull();
      expect(user.eddDate).toBe('2026-12-25');
    });

    it('should return undefined for eddDate when user has no PDD set', async () => {
      // Create user WITHOUT eddDate
      await createUser(CHAT_ID_4, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
      });

      const user = await getUser(CHAT_ID_4);
      expect(user).not.toBeNull();
      expect(user.eddDate).toBeUndefined();
    });
  });

  describe('lastNotifiedWeek field round-trip', () => {
    if (!firestoreReady) {
      it.skip('no Firestore backend — test skipped');
      return;
    }

    it('should save lastNotifiedWeek via updateUser and return it via getUser', async () => {
      // Create a user without lastNotifiedWeek
      await createUser(CHAT_ID_5, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
      });

      // Update with lastNotifiedWeek
      await updateUser(CHAT_ID_5, { lastNotifiedWeek: 14 });

      // Read back and verify
      const user = await getUser(CHAT_ID_5);
      expect(user).not.toBeNull();
      expect(user.lastNotifiedWeek).toBe(14);
    });

    it('should allow setting lastNotifiedWeek directly via createUser', async () => {
      await createUser(CHAT_ID_6, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
        lastNotifiedWeek: 8,
      });

      const user = await getUser(CHAT_ID_6);
      expect(user).not.toBeNull();
      expect(user.lastNotifiedWeek).toBe(8);
    });

    it('should update an existing lastNotifiedWeek value', async () => {
      // Create with initial lastNotifiedWeek
      await createUser(CHAT_ID_7, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
        lastNotifiedWeek: 5,
      });

      // Update lastNotifiedWeek to a new value
      await updateUser(CHAT_ID_7, { lastNotifiedWeek: 20 });

      // Read back and verify new value
      const user = await getUser(CHAT_ID_7);
      expect(user).not.toBeNull();
      expect(user.lastNotifiedWeek).toBe(20);
    });

    it('should return undefined for lastNotifiedWeek when user has no notifications sent', async () => {
      // Create user WITHOUT lastNotifiedWeek
      await createUser(CHAT_ID_8, {
        ...BASE_USER,
        language: 'ru',
        role: 'mom',
      });

      const user = await getUser(CHAT_ID_8);
      expect(user).not.toBeNull();
      expect(user.lastNotifiedWeek).toBeUndefined();
    });
  });
});
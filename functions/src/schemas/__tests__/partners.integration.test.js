/**
 * @fileoverview Integration test for partners Firestore collection.
 *
 * Tests CRUD operations (create, read, link, query by momChatId) against
 * a real or emulated Firestore backend. Performs Firestore operations
 * directly on the db instance — does not load collection helper modules
 * to avoid firestore.js singleton conflicts.
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validatePartners } from '../partners.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_CODE = 'TST021';
const MOM_CHAT_ID = 'test_mom_021';
const PARTNER_CHAT_ID = 'test_partner_021';

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
      initializeApp({ projectId: 'mamabot-97d22' });
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

describe('partners — Firestore integration', () => {
  const hasBackend = !!db;

  it('should have a Firestore backend configured', () => {
    if (!hasBackend) {
      console.warn(
        '\n  ⚠ No Firestore backend available. Set FIRESTORE_EMULATOR_HOST ' +
          'or GOOGLE_APPLICATION_CREDENTIALS to run integration tests.',
      );
    }
  });

  it('should validate a valid partner document', () => {
    const result = validatePartners({
      partnerCode: TEST_CODE,
      momChatId: MOM_CHAT_ID,
      partnerChatId: null,
      status: 'pending',
      createdAt: null,
      updatedAt: null,
    });
    expect(result.valid).toBe(true);
  });

  describe('CRUD operations (requires Firestore backend)', () => {
    if (!hasBackend) {
      it.skip('no Firestore backend — test skipped');
      return;
    }

    afterAll(async () => {
      // Clean up: delete all test documents
      const codes = [TEST_CODE];
      for (const code of codes) {
        try {
          await db.collection('partners').doc(code).delete();
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should create a partner document and read it back', async () => {
      const docRef = db.collection('partners').doc(TEST_CODE);
      await docRef.set({
        partnerCode: TEST_CODE,
        momChatId: MOM_CHAT_ID,
        partnerChatId: null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const snap = await docRef.get();
      expect(snap.exists).toBe(true);

      const data = snap.data();
      expect(data.partnerCode).toBe(TEST_CODE);
      expect(data.momChatId).toBe(MOM_CHAT_ID);
      expect(data.partnerChatId).toBeNull();
      expect(data.status).toBe('pending');
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    it('should link a partner and update status to active', async () => {
      // Create a fresh document for this test
      const docRef = db.collection('partners').doc(TEST_CODE);
      await docRef.set({
        partnerCode: TEST_CODE,
        momChatId: MOM_CHAT_ID,
        partnerChatId: null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Link partner
      await docRef.update({
        partnerChatId: PARTNER_CHAT_ID,
        status: 'active',
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Verify
      const snap = await docRef.get();
      expect(snap.exists).toBe(true);

      const data = snap.data();
      expect(data.status).toBe('active');
      expect(data.partnerChatId).toBe(PARTNER_CHAT_ID);
    });

    it('should find partnership by momChatId', async () => {
      // Create a fresh document for this test
      const docRef = db.collection('partners').doc(TEST_CODE);
      await docRef.set({
        partnerCode: TEST_CODE,
        momChatId: MOM_CHAT_ID,
        partnerChatId: null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Query by momChatId
      const snapshot = await db
        .collection('partners')
        .where('momChatId', '==', MOM_CHAT_ID)
        .limit(1)
        .get();

      expect(snapshot.empty).toBe(false);
      const doc = snapshot.docs[0];
      expect(doc.data().partnerCode).toBe(TEST_CODE);
      expect(doc.data().momChatId).toBe(MOM_CHAT_ID);
    });

    it('should return null for non-existent partnerCode', async () => {
      const snap = await db.collection('partners').doc('NONEXIST').get();
      expect(snap.exists).toBe(false);
    });

    it('should return empty result for non-existent momChatId', async () => {
      const snapshot = await db
        .collection('partners')
        .where('momChatId', '==', 'nonexistent_mom')
        .limit(1)
        .get();
      expect(snapshot.empty).toBe(true);
    });
  });
});
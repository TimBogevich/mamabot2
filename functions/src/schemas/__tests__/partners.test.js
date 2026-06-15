/**
 * @fileoverview Unit tests for the partners schema module.
 *
 * Tests cover field metadata, the document ID helper, and field-level
 * validation for all required/optional/nullable fields.
 */

import { describe, it, expect } from 'vitest';
import {
  PARTNERS_COLLECTION,
  PARTNERS_FIELDS,
  partnersDocId,
  validatePartners,
} from '../partners.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Возвращает минимальный валидный документ partners для тестирования.
 * Поля с отметкой времени принимают null (заполнитель Firestore serverTimestamp).
 */
function validDoc(overrides = {}) {
  return {
    partnerCode: 'ABC123',
    momChatId: '111',
    partnerChatId: null,
    status: 'pending',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('PARTNERS_COLLECTION', () => {
  it('should be set to "partners"', () => {
    expect(PARTNERS_COLLECTION).toBe('partners');
  });
});

describe('PARTNERS_FIELDS', () => {
  it('should define all 6 fields', () => {
    expect(Object.keys(PARTNERS_FIELDS)).toHaveLength(6);
  });

  it('should include partnerCode with string type and required', () => {
    const f = PARTNERS_FIELDS.partnerCode;
    expect(f.type).toBe('string');
    expect(f.required).toBe(true);
  });

  it('should include momChatId with string type and required', () => {
    const f = PARTNERS_FIELDS.momChatId;
    expect(f.type).toBe('string');
    expect(f.required).toBe(true);
  });

  it('should include partnerChatId as optional and nullable', () => {
    const f = PARTNERS_FIELDS.partnerChatId;
    expect(f.type).toBe('string');
    expect(f.required).toBe(false);
    expect(f.nullable).toBe(true);
  });

  it('should include status with string type and required', () => {
    const f = PARTNERS_FIELDS.status;
    expect(f.type).toBe('string');
    expect(f.required).toBe(true);
  });

  it('should include createdAt and updatedAt as required with nullable', () => {
    for (const name of ['createdAt', 'updatedAt']) {
      const f = PARTNERS_FIELDS[name];
      expect(f.type).toBe('Timestamp');
      expect(f.required).toBe(true);
      expect(f.nullable).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// partnersDocId
// ---------------------------------------------------------------------------

describe('partnersDocId()', () => {
  it('should return "ABC123" for partnerCode "ABC123"', () => {
    expect(partnersDocId('ABC123')).toBe('ABC123');
  });

  it('should return "XYZ789" for partnerCode "XYZ789"', () => {
    expect(partnersDocId('XYZ789')).toBe('XYZ789');
  });

  it('should preserve numeric-looking codes as strings', () => {
    expect(partnersDocId('000000')).toBe('000000');
  });
});

// ---------------------------------------------------------------------------
// validatePartners — valid documents
// ---------------------------------------------------------------------------

describe('validatePartners() — valid documents', () => {
  it('should accept a valid document with status "pending"', () => {
    const result = validatePartners(validDoc());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept a valid document with status "active" and partnerChatId set', () => {
    const result = validatePartners(
      validDoc({ status: 'active', partnerChatId: '222' }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept a valid code with all characters (A-Z, 0-9)', () => {
    const result = validatePartners(validDoc({ partnerCode: 'ZZ9999' }));
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePartners — missing required fields
// ---------------------------------------------------------------------------

describe('validatePartners() — missing required fields', () => {
  const requiredFields = [
    'partnerCode',
    'momChatId',
    'status',
    'createdAt',
    'updatedAt',
  ];

  for (const field of requiredFields) {
    it(`should reject missing "${field}"`, () => {
      const doc = validDoc();
      delete doc[field];
      const result = validatePartners(doc);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Missing required field: "${field}"`);
    });
  }

  it('should list multiple missing fields at once', () => {
    const doc = { partnerCode: 'ABC123' };
    const result = validatePartners(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject undefined document', () => {
    const result = validatePartners(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/i);
  });

  it('should reject null document', () => {
    const result = validatePartners(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/i);
  });
});

// ---------------------------------------------------------------------------
// validatePartners — invalid field values
// ---------------------------------------------------------------------------

describe('validatePartners() — invalid field values', () => {
  // partnerCode length
  it('should reject partnerCode shorter than 6 characters', () => {
    const result = validatePartners(validDoc({ partnerCode: 'AB12' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject partnerCode longer than 6 characters', () => {
    const result = validatePartners(validDoc({ partnerCode: 'ABCD1234' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // partnerCode character set
  it('should reject partnerCode with lowercase letters', () => {
    const result = validatePartners(validDoc({ partnerCode: 'abc123' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject partnerCode with special characters', () => {
    const result = validatePartners(validDoc({ partnerCode: 'AB@#$%' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject non-string partnerCode', () => {
    const result = validatePartners(validDoc({ partnerCode: 123456 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // status
  it('should reject status other than "pending" or "active"', () => {
    const result = validatePartners(validDoc({ status: 'deleted' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject empty string status', () => {
    const result = validatePartners(validDoc({ status: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // momChatId
  it('should reject empty momChatId', () => {
    const result = validatePartners(validDoc({ momChatId: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject non-string momChatId', () => {
    const result = validatePartners(validDoc({ momChatId: 111 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // partnerChatId
  it('should reject empty partnerChatId string', () => {
    const result = validatePartners(validDoc({ partnerChatId: '', status: 'active' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject non-string partnerChatId', () => {
    const result = validatePartners(validDoc({ partnerChatId: 222, status: 'active' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // Null handling for nullable fields
  it('should accept partnerChatId: null (nullable field)', () => {
    const result = validatePartners(validDoc({ partnerChatId: null }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject partnerChatId: null when status is "active" (cross-field)', () => {
    const result = validatePartners(
      validDoc({ partnerChatId: null, status: 'active' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should accept partnerChatId: null with status: "pending"', () => {
    const result = validatePartners(
      validDoc({ partnerChatId: null, status: 'pending' }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject null for non-nullable fields', () => {
    const doc = validDoc({ partnerCode: null });
    const result = validatePartners(doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: "partnerCode"');
  });
});
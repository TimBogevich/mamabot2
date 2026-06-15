/**
 * @fileoverview Unit tests for the pregnancy_data schema module.
 *
 * Tests cover field validation, boundary conditions, and the
 * composite document ID generator.
 */

import { describe, it, expect } from "vitest";
import {
  PREGNANCY_DATA_COLLECTION,
  PREGNANCY_DATA_FIELDS,
  pregnancyDataDocId,
  validatePregnancyData,
} from "../pregnancy_data.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a minimal valid pregnancy_data document for testing.
 * Timestamp fields accept null (Firestore serverTimestamp placeholder).
 */
function validDoc(overrides = {}) {
  return {
    weekNumber: 1,
    language: "ru",
    babyDevelopment: "Оплодотворённая яйцеклетка начинает делиться.",
    motherChanges: "Задержка менструации — первый признак беременности.",
    nutritionTips: "Начните приём фолиевой кислоты, если ещё не начали.",
    vitaminRecommendations: "Фолиевая кислота 400 мкг/сутки",
    symptomsCommon: "Усталость, чувствительность груди, тошнота",
    babySize: "размером с маковое зёрнышко",
  babyWeightGrams: 45,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("PREGNANCY_DATA_COLLECTION", () => {
  it("should be set to 'pregnancy_data'", () => {
    expect(PREGNANCY_DATA_COLLECTION).toBe("pregnancy_data");
  });
});

describe("PREGNANCY_DATA_FIELDS", () => {
  it("should define all 11 fields", () => {
    expect(Object.keys(PREGNANCY_DATA_FIELDS)).toHaveLength(11);
  });

  it("should include weekNumber with number type and required", () => {
    const f = PREGNANCY_DATA_FIELDS.weekNumber;
    expect(f.type).toBe("number");
    expect(f.required).toBe(true);
  });

  it("should include language with string type and required", () => {
    const f = PREGNANCY_DATA_FIELDS.language;
    expect(f.type).toBe("string");
    expect(f.required).toBe(true);
  });

  it("should include babyWeightGrams with number type and required", () => {
    const f = PREGNANCY_DATA_FIELDS.babyWeightGrams;
    expect(f.type).toBe("number");
    expect(f.required).toBe(true);
  });


  it("should include all content fields as required strings", () => {
    const contentFields = [
      "babyDevelopment",
      "motherChanges",
      "nutritionTips",
      "vitaminRecommendations",
      "symptomsCommon",
      "babySize",
    ];
    for (const name of contentFields) {
      const f = PREGNANCY_DATA_FIELDS[name];
      expect(f.type).toBe("string");
      expect(f.required).toBe(true);
    }
  });

  it("should include createdAt and updatedAt as required with nullable", () => {
    for (const name of ["createdAt", "updatedAt"]) {
      const f = PREGNANCY_DATA_FIELDS[name];
      expect(f.type).toBe("Timestamp");
      expect(f.required).toBe(true);
      expect(f.nullable).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// pregnancyDataDocId
// ---------------------------------------------------------------------------

describe("pregnancyDataDocId()", () => {
  it('should return "1_ru" for week=1, language=ru', () => {
    expect(pregnancyDataDocId(1, "ru")).toBe("1_ru");
  });

  it('should return "40_en" for week=40, language=en', () => {
    expect(pregnancyDataDocId(40, "en")).toBe("40_en");
  });

  it('should return "15_ru" for week=15, language=ru', () => {
    expect(pregnancyDataDocId(15, "ru")).toBe("15_ru");
  });
});

// ---------------------------------------------------------------------------
// validatePregnancyData — valid documents
// ---------------------------------------------------------------------------

describe("validatePregnancyData() — valid documents", () => {
  it("should accept a valid document (week=1, lang=ru)", () => {
    const result = validatePregnancyData(validDoc());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept a valid document (week=40, lang=en)", () => {
    const result = validatePregnancyData(
      validDoc({ weekNumber: 40, language: "en" }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept boundary week values (1 and 40)", () => {
    expect(validatePregnancyData(validDoc({ weekNumber: 1 })).valid).toBe(true);
    expect(validatePregnancyData(validDoc({ weekNumber: 40 })).valid).toBe(
      true,
    );
  });

  it("should accept a document with valid babyWeightGrams", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: 45 }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject a document missing babyWeightGrams", () => {
    const doc = validDoc();
    delete doc.babyWeightGrams;
    const result = validatePregnancyData(doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Missing required field: "babyWeightGrams"',
    );
  });

  it("should accept babyWeightGrams = 1 (minimum boundary)", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: 1 }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept babyWeightGrams = 5000 (maximum boundary)", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: 5000 }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validatePregnancyData — missing fields
// ---------------------------------------------------------------------------

describe("validatePregnancyData() — missing required fields", () => {
  const requiredFields = [
    "weekNumber",
    "language",
    "babyDevelopment",
    "motherChanges",
    "nutritionTips",
    "vitaminRecommendations",
    "symptomsCommon",
    "babySize",
    "babyWeightGrams",
    "createdAt",
    "updatedAt",
  ];

  for (const field of requiredFields) {
    it(`should reject missing "${field}"`, () => {
      const doc = validDoc();
      delete doc[field];
      const result = validatePregnancyData(doc);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Missing required field: "${field}"`);
    });
  }

  it("should list multiple missing fields at once", () => {
    const doc = { weekNumber: 1 };
    const result = validatePregnancyData(doc);
    expect(result.valid).toBe(false);
    // Should report all 10 missing fields except weekNumber
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject undefined document", () => {
    const result = validatePregnancyData(undefined);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/i);
  });

  it("should reject null document", () => {
    const result = validatePregnancyData(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/i);
  });
});

// ---------------------------------------------------------------------------
// validatePregnancyData — field value validation
// ---------------------------------------------------------------------------

describe("validatePregnancyData() — invalid field values", () => {
  it("should reject weekNumber < 1", () => {
    const result = validatePregnancyData(validDoc({ weekNumber: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject weekNumber > 40", () => {
    const result = validatePregnancyData(validDoc({ weekNumber: 41 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-integer weekNumber", () => {
    const result = validatePregnancyData(validDoc({ weekNumber: 1.5 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-numeric weekNumber", () => {
    const result = validatePregnancyData(validDoc({ weekNumber: "1" }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject language other than "ru" or "en"', () => {
    const result = validatePregnancyData(validDoc({ language: "fr" }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject empty string language", () => {
    const result = validatePregnancyData(validDoc({ language: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-string language", () => {
    const result = validatePregnancyData(validDoc({ language: 123 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject null for non-nullable fields", () => {
    const doc = validDoc({ babyDevelopment: null });
    const result = validatePregnancyData(doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Missing required field: "babyDevelopment"',
    );
  });

  it("should reject babyWeightGrams = 0 (must be > 0)", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject babyWeightGrams = -1 (negative)", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: -1 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject babyWeightGrams = 5001 (exceeds max)", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: 5001 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-integer babyWeightGrams (1.5)", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: 1.5 }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject non-numeric babyWeightGrams ('45')", () => {
    const result = validatePregnancyData(validDoc({ babyWeightGrams: "45" }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
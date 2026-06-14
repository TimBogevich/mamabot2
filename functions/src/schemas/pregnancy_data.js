/**
 * @fileoverview Schema definitions and validation helpers for the
 * `pregnancy_data` Firestore collection.
 *
 * Each document stores pregnancy-week content (baby development, mother
 * changes, nutrition, vitamins, symptoms, baby size) for a given language.
 *
 * Document ID format: `{weekNumber}_{language}`
 *   Example: `1_ru`, `1_en`, `15_ru`, `40_en`
 *
 * Collection: pregnancy_data
 */

const { Timestamp } = require("firebase-admin/firestore");

// ---------------------------------------------------------------------------
// Field metadata
// ---------------------------------------------------------------------------

/** @type {Object<string, {type: string, required: boolean, description: string, validate?: Function}>} */
const PREGNANCY_DATA_FIELDS = {
  weekNumber: {
    type: "number",
    required: true,
    description: "Неделя беременности (1–40)",
    validate: (v) =>
      typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 40,
  },
  language: {
    type: "string",
    required: true,
    description: "Язык контента: 'ru' или 'en'",
    validate: (v) => typeof v === "string" && (v === "ru" || v === "en"),
  },
  babyDevelopment: {
    type: "string",
    required: true,
    description: "Развитие ребёнка на этой неделе",
  },
  motherChanges: {
    type: "string",
    required: true,
    description: "Изменения в организме матери",
  },
  nutritionTips: {
    type: "string",
    required: true,
    description: "Советы по питанию",
  },
  vitaminRecommendations: {
    type: "string",
    required: true,
    description: "Рекомендации по витаминам",
  },
  symptomsCommon: {
    type: "string",
    required: true,
    description: "Типичные симптомы",
  },
  babySize: {
    type: "string",
    required: true,
    description: "Размер ребёнка (сравнение)",
  },
  createdAt: {
    type: "Timestamp",
    required: true,
    nullable: true,
    description: "Время создания документа (server timestamp; null = Firestore serverTimestamp)",
  },
  updatedAt: {
    type: "Timestamp",
    required: true,
    nullable: true,
    description: "Время последнего обновления (server timestamp; null = Firestore serverTimestamp)",
  },
};

// ---------------------------------------------------------------------------
// Collection name
// ---------------------------------------------------------------------------

const PREGNANCY_DATA_COLLECTION = "pregnancy_data";

// ---------------------------------------------------------------------------
// Composite ID helper
// ---------------------------------------------------------------------------

/**
 * Generates the composite document ID for a pregnancy_data document.
 *
 * @param {number} weekNumber - Week of pregnancy (1–40)
 * @param {string} language - Language code ('ru' | 'en')
 * @returns {string} Composite ID like `1_ru`, `40_en`
 */
function pregnancyDataDocId(weekNumber, language) {
  return `${weekNumber}_${language}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a pregnancy_data document against the schema.
 *
 * @param {Object} doc - The document data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 *   `valid` is true when all required fields pass.
 *   `errors` contains human-readable messages for each violation.
 */
function validatePregnancyData(doc) {
  const errors = [];

  if (!doc || typeof doc !== "object") {
    return { valid: false, errors: ["Document must be a non-null object"] };
  }

  for (const [fieldName, meta] of Object.entries(PREGNANCY_DATA_FIELDS)) {
    const value = doc[fieldName];

    // Check required
    if (meta.required && value === undefined) {
      errors.push(`Missing required field: "${fieldName}"`);
      continue;
    }

    // Skip further checks if value is not present (or null for nullable fields)
    if (value === undefined) {
      continue;
    }
    if (value === null && meta.nullable) {
      continue;
    }
    if (value === null) {
      errors.push(`Missing required field: "${fieldName}"`);
      continue;
    }

    // Type check + optional custom validation
    if (meta.validate) {
      if (!meta.validate(value)) {
        errors.push(
          `Invalid value for field "${fieldName}": ${JSON.stringify(value)}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  PREGNANCY_DATA_COLLECTION,
  PREGNANCY_DATA_FIELDS,
  pregnancyDataDocId,
  validatePregnancyData,
};
/**
 * @fileoverview Schema definitions and validation helpers for the
 * `partners` Firestore collection.
 *
 * Each document represents a partnership between a mother (mom) and her
 * partner. The document is created when the mother generates a 6-character
 * invite code (`partnerCode`), and the partner later claims it to link their
 * accounts.
 *
 * Document ID: partnerCode (6-character uppercase alphanumeric string)
 *   Example: `ABC123`, `XYZ789`
 *
 * Collection: partners
 *
 * Lifecycle:
 *   - `pending`:  created when mom generates the invite code
 *   - `active`:   partner has claimed the code and linked their account
 *
 * Query patterns:
 *   - By partnerCode: direct document lookup via partnersDocId(partnerCode)
 *   - By momChatId:   .where('momChatId', '==', ...) — requires composite index
 */

// ---------------------------------------------------------------------------
// Field metadata
// ---------------------------------------------------------------------------

/** @type {Object<string, {type: string, required: boolean, nullable?: boolean, description: string, validate?: Function}>} */
const PARTNERS_FIELDS = {
  partnerCode: {
    type: 'string',
    required: true,
    description: '6-символьный код-приглашение (латиница + цифры верхнего регистра). Также используется как ID документа.',
    validate: (v) => typeof v === 'string' && /^[A-Z0-9]{6}$/.test(v),
  },
  momChatId: {
    type: 'string',
    required: true,
    description: 'Telegram chat ID мамы (stringified, для сравнения в Firestore Rules).',
    validate: (v) => typeof v === 'string' && v.length > 0,
  },
  partnerChatId: {
    type: 'string',
    required: false,
    nullable: true,
    description: 'Telegram chat ID партнёра. null до момента привязки.',
    validate: (v) => typeof v === 'string' && v.length > 0,
  },
  status: {
    type: 'string',
    required: true,
    description: 'Статус партнёрства: \'pending\' (ожидает привязки) или \'active\' (партнёр привязан).',
    validate: (v) => v === 'pending' || v === 'active',
  },
  createdAt: {
    type: 'Timestamp',
    required: true,
    nullable: true,
    description: 'Время создания документа (server timestamp; null = Firestore serverTimestamp)',
  },
  updatedAt: {
    type: 'Timestamp',
    required: true,
    nullable: true,
    description: 'Время последнего обновления (server timestamp; null = Firestore serverTimestamp)',
  },
};

// ---------------------------------------------------------------------------
// Collection name
// ---------------------------------------------------------------------------

const PARTNERS_COLLECTION = 'partners';

// ---------------------------------------------------------------------------
// Document ID helper
// ---------------------------------------------------------------------------

/**
 * Генерирует идентификатор документа для коллекции partners.
 *
 * Идентификатором является сам `partnerCode` — 6-символьная строка
 * в верхнем регистре из латиницы и цифр. Это позволяет выполнять
 * прямой lookup документа без необходимости в составном индексе.
 *
 * @param {string} partnerCode - 6-символьный код-приглашение
 * @returns {string} Идентификатор документа (строка)
 */
function partnersDocId(partnerCode) {
  return String(partnerCode);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Проверяет документ коллекции partners на соответствие схеме.
 *
 * @param {Object} doc - Данные документа для проверки
 * @returns {{ valid: boolean, errors: string[] }}
 *   `valid` равен true, если все обязательные поля присутствуют и проходят
 *   валидацию. `errors` содержит человекочитаемые сообщения для каждого
 *   нарушения.
 */
function validatePartners(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Document must be a non-null object'] };
  }

  for (const [fieldName, meta] of Object.entries(PARTNERS_FIELDS)) {
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

    // Custom validation
    if (meta.validate) {
      if (!meta.validate(value)) {
        errors.push(
          `Invalid value for field "${fieldName}": ${JSON.stringify(value)}`,
        );
      }
    }
  }

  // Cross-field: active status requires a non-null partnerChatId
  if (doc.status === 'active' && doc.partnerChatId === null) {
    errors.push('partnerChatId must not be null when status is "active"');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  PARTNERS_COLLECTION,
  PARTNERS_FIELDS,
  partnersDocId,
  validatePartners,
};

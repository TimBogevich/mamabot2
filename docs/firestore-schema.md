# Firestore Schema — MamaBot

Last updated: 2026-06-17

---

## Collection: `pregnancy_data`

Stores pregnancy-week content (weeks 1–40) in Russian and English.

### Document ID format

```
{weekNumber}_{language}
```

e.g., `1_ru`, `15_en`, `40_en`

### Fields

| Field | Type | Required | Nullable | Description |
|---|---|---|---|---|
| `weekNumber` | `number` (integer) | ✅ | ❌ | Week of pregnancy (1–40) |
| `language` | `string` | ✅ | ❌ | Content language: `'ru'` or `'en'` |
| `babyDevelopment` | `string` | ✅ | ❌ | Baby's development this week |
| `motherChanges` | `string` | ✅ | ❌ | Changes in mother's body |
| `nutritionTips` | `string` | ✅ | ❌ | Nutrition advice |
| `vitaminRecommendations` | `string` | ✅ | ❌ | Vitamin recommendations |
| `symptomsCommon` | `string` | ✅ | ❌ | Common symptoms |
| `babySize` | `string` | ✅ | ❌ | Baby size comparison |
| `babyWeightGrams` | `number` (integer) | ✅ | ❌ | Estimated fetal weight in grams (1–5000) |
| `createdAt` | `Timestamp` | ✅ | ✅ | Document creation time (server timestamp) |
| `updatedAt` | `Timestamp` | ✅ | ✅ | Document last update time (server timestamp) |

### Seed data

The collection is populated from canonical JSON asset files in `functions/src/data/`:

| File | Content |
|---|---|
| `functions/src/data/pregnancyWeeks_ru.json` | 40 week records (weeks 1–40) in Russian |
| `functions/src/data/pregnancyWeeks_en.json` | 40 week records (weeks 1–40) in English |

Each file is a JSON array of 40 objects containing `weekNumber`, `babyWeightGrams`, `babySize`, and `babyDevelopment` fields. The fields `motherChanges`, `nutritionTips`, `vitaminRecommendations`, and `symptomsCommon` may be provided in the JSON; if absent, the seed script defaults them to empty strings.

### Validation

See `functions/src/schemas/pregnancy_data.js` for the validation logic (`validatePregnancyData` function).

### Source Code

- `functions/src/schemas/pregnancy_data.js` — validation logic
- `functions/scripts/seed-pregnancy-data.js` — seed script for populating 40 weeks

---

## Collection: `users`

Main registry of MamaBot users. Each document represents one user interacting with the bot. Created on first `/start` command and updated on profile or settings changes.

Serves as the foundation for all other collections (`pregnancy_data`, `mood_logs`, `nutrition_logs`), each referencing the user via `chatId`.

### Document ID

```
String(chatId)
```

Telegram `chat.id` is used as the document ID to guarantee natural uniqueness and fast lookups.

### Fields

| Field | Type | Required | Default | Description |
|-------|------|:--------:|---------|-------------|
| `chatId` | `number` | ✅ | — | Telegram chat ID. Also used as document ID. |
| `userId` | `string` | ✅ | — | Telegram user ID from `update.message.from.id`. |
| `firstName` | `string` | ✅ | — | User's first name in Telegram. |
| `lastName` | `string` | ❌ | — | User's last name in Telegram (optional). |
| `username` | `string` | ❌ | — | @username in Telegram (optional). |
| `language` | `'ru' \| 'en'` | ✅ | `'ru'` | Selected interface language. |
| `lmpDate` | `string` | ❌ | — | First day of last menstrual period, ISO format (`YYYY-MM-DD`). |
| `currentWeek` | `number` | ❌ | — | Calculated current pregnancy week (1–42). |
| `eddDate` | `string` | ❌ | — | Estimated due date, ISO format (`YYYY-MM-DD`). |
| `lastNotifiedWeek` | `number` | ❌ | — | Last pregnancy week a notification was sent to (1–42). Updated atomically by `sendWeeklyNotifications`. |
| `onboardingState` | `string` | ❌ | — | Transient onboarding state (`'awaiting_edd'`). Cleared on completion. |
| `partnerCode` | `string` | ❌ | — | 6-character invitation code for partner linking. |
| `role` | `'mom' \| 'partner'` | ✅ | `'mom'` | User role: mom or partner. |
| `createdAt` | `Timestamp` | ✅ | `serverTimestamp()` | Document creation timestamp. |
| `updatedAt` | `Timestamp` | ✅ | `serverTimestamp()` | Document last update timestamp. |

No additional composite indexes required for `users` — `chatId` is the document ID and indexed automatically.

### Sample document

```json
{
  "chatId": 123456789,
  "userId": "123456789",
  "firstName": "Анна",
  "lastName": "Иванова",
  "username": "anna_ivanova",
  "language": "ru",
  "lmpDate": "2026-01-15",
  "currentWeek": 21,
  "eddDate": "2026-10-22",
  "lastNotifiedWeek": 21,
  "partnerCode": "ABC123",
  "role": "mom",
  "createdAt": "2026-06-14T10:30:00.000Z",
  "updatedAt": "2026-06-14T10:30:00.000Z"
}
```

### Access scenarios

| Scenario | Operation | Code |
|----------|-----------|------|
| Register user | Create document | `createUser(chatId, data)` |
| Load profile on start | Read document | `getUser(chatId)` |
| Change language | Update `language` | `updateUser(chatId, { language: 'en' })` |
| Set LMP date | Update `lmpDate`, `currentWeek` | `updateUser(chatId, { lmpDate: '2026-03-01', currentWeek: 14 })` → sends EDD confirmation with Верно/Исправить buttons |
| Set EDD date | Update `eddDate`, `onboardingState` | `updateUser(chatId, { eddDate: '2026-12-25', onboardingState: null })` |
| Update role | Update `role` | `updateUser(chatId, { role: 'partner' })` |
| Create partner code | Update `partnerCode` | `updateUser(chatId, { partnerCode: 'XYZ789' })` |

### Document lifecycle

1. **Creation** — on first bot interaction (`/start`). Fields: `chatId`, `userId`, `firstName`, `lastName`, `username`, `language`, `role`.
2. **Updates** — on settings or pregnancy progress changes: `language`, `lmpDate`, `currentWeek`, `partnerCode`.
3. **Deletion** — not implemented. Users can request data removal via support.

### Source Code

- `functions/src/collections/users.js` — CRUD helpers (`createUser`, `getUser`, `updateUser`)
- `functions/src/handlers/onboarding/lmpDialog.js` — LMP date input handler
- `functions/src/handlers/onboarding/languageDialog.js` — language selection handler
- `functions/src/firestore.js` — Firestore client initialization

---

## Collection: `mood_logs`

Stores daily mood and energy level entries for each user. One document per day per user (technically no unique constraint is enforced).

Document ID: auto-generated by Firestore.

### Fields

| Field | Type | Required | Nullable | Description |
|-------|------|:--------:|:--------:|-------------|
| `userId` | `string` | ✅ | ❌ | Telegram user ID (stringified) |
| `date` | `string` (ISO 8601) | ✅ | ❌ | Date in `YYYY-MM-DD` format |
| `mood` | `number` (integer) | ✅ | ❌ | Mood rating (1–5; 1 = very bad, 5 = excellent) |
| `energy` | `number` (integer) | ✅ | ❌ | Energy level (1–5; 1 = very low, 5 = very high) |
| `note` | `string` | ❌ | ❌ | Optional note about the mood/energy state (defaults to `""`) |
| `createdAt` | `Timestamp` | ✅ | ✅ | Time of document creation (Firestore serverTimestamp; null before write) |

### Example document

```json
{
  "userId": "123456789",
  "date": "2026-06-15",
  "mood": 4,
  "energy": 3,
  "note": "Чувствую себя хорошо сегодня",
  "createdAt": "<server timestamp>"
}
```

### Queries

**By userId + date range (primary pattern):**

```js
const { getMoodLogsByUserAndDate } = require("./src/schemas/moodLogs");

const logs = await getMoodLogsByUserAndDate(
  db,
  userId,
  "2026-06-01",
  "2026-06-15",
);
```

Requires a composite index on `mood_logs`: `userId` ASC, `date` DESC (described in `firestore.indexes.json`).

### Creation

```js
const { createMoodLog } = require("./src/schemas/moodLogs");

const doc = createMoodLog({
  userId: "123456789",
  date: "2026-06-15",
  mood: 4,
  energy: 3,
  note: "Всё отлично!",
});

await db.collection("mood_logs").add(doc);
```

### Source Code

- `functions/src/schemas/moodLogs.js` — validation, factory, and query helpers

---

## Collection: `nutrition_logs`

Stores meal, vitamin, and water intake records for each user. One document per meal (multiple entries per day possible).

Document ID: auto-generated by Firestore.

### Fields

| Field | Type | Required | Nullable | Description |
|-------|------|:--------:|:--------:|-------------|
| `userId` | `string` | ✅ | ❌ | Telegram user ID (stringified) |
| `date` | `string` (ISO 8601) | ✅ | ❌ | Date in `YYYY-MM-DD` format |
| `mealType` | `string` (enum) | ✅ | ❌ | Type of meal: `'breakfast'`, `'lunch'`, `'dinner'`, or `'snack'` |
| `foods` | `array` of `string` | ✅ | ❌ | List of food items consumed (at least 1 element) |
| `vitamins` | `array` of `string` | ❌ | ❌ | List of vitamins taken (defaults to `[]`) |
| `waterGlasses` | `number` (integer) | ✅ | ❌ | Number of glasses of water consumed (≥0, defaults to `0`) |
| `createdAt` | `Timestamp` | ✅ | ✅ | Time of document creation (Firestore serverTimestamp; null before write) |

### Example document

```json
{
  "userId": "123456789",
  "date": "2026-06-15",
  "mealType": "lunch",
  "foods": ["куриная грудка", "бурый рис", "брокколи"],
  "vitamins": ["витамин D", "железо"],
  "waterGlasses": 3,
  "createdAt": "<server timestamp>"
}
```

### Queries

**By userId + date range (primary pattern):**

```js
const { getNutritionLogsByUserAndDate } = require("./src/schemas/nutritionLogs");

const logs = await getNutritionLogsByUserAndDate(
  db,
  userId,
  "2026-06-01",
  "2026-06-15",
);
```

Requires a composite index on `nutrition_logs`: `userId` ASC, `date` DESC (described in `firestore.indexes.json`).

### Creation

```js
const { createNutritionLog } = require("./src/schemas/nutritionLogs");

const doc = createNutritionLog({
  userId: "123456789",
  date: "2026-06-15",
  mealType: "lunch",
  foods: ["салат", "рыба"],
  vitamins: ["витамин C"],
  waterGlasses: 2,
});

await db.collection("nutrition_logs").add(doc);
```

### Source Code

- `functions/src/schemas/nutritionLogs.js` — validation, factory, and query helpers

---

## Collection: `partners`

Stores partnerships between a mom and her partner. Each document represents one partnership, created by the mom via a 6-character invitation code (`partnerCode`). The partner enters the code to link accounts.

### Document ID

```
partnerCode
```

The 6-character alphanumeric code (uppercase Latin + digits) serves as the document ID for direct lookups.

### Fields

| Field | Type | Required | Default | Description |
|-------|------|:--------:|---------|-------------|
| `partnerCode` | `string` | ✅ | — | 6-character invitation code (`/^[A-Z0-9]{6}$/`). Also used as document ID. |
| `momChatId` | `string` | ✅ | — | Mom's Telegram chat ID (stringified for Firestore Rules). |
| `partnerChatId` | `string` | ❌ | `null` | Partner's Telegram chat ID. `null` until linked. |
| `status` | `'pending' \| 'active'` | ✅ | `'pending'` | Partnership status: `'pending'` or `'active'`. |
| `createdAt` | `Timestamp` | ✅ | `serverTimestamp()` | Document creation timestamp. |
| `updatedAt` | `Timestamp` | ✅ | `serverTimestamp()` | Document last update timestamp. |

### Sample documents

**Pending partnership:**

```json
{
  "partnerCode": "XYZ789",
  "momChatId": "333",
  "partnerChatId": null,
  "status": "pending",
  "createdAt": "2026-06-15T10:00:00.000Z",
  "updatedAt": "2026-06-15T10:00:00.000Z"
}
```

**Active partnership:**

```json
{
  "partnerCode": "ABC123",
  "momChatId": "111",
  "partnerChatId": "222",
  "status": "active",
  "createdAt": "2026-06-15T09:00:00.000Z",
  "updatedAt": "2026-06-15T09:30:00.000Z"
}
```

### Access scenarios

| Scenario | Operation | Code |
|----------|-----------|------|
| Create invitation code | Create document (server) | `createPartner(code, { momChatId })` |
| Link partner | Update document (server) | `linkPartner(code, partnerChatId)` |
| Read document by code | Direct lookup | `getPartner(code)` |
| Find by mom ID | Filtered query | `getPartnershipByMom(momChatId)` |

### Document lifecycle

1. **`pending`** — Document created when mom generates an invitation code. Fields: `partnerCode`, `momChatId`, `partnerChatId: null`, `status: 'pending'`.
2. **`active`** — Partner enters the code and bot links them. Updated: `partnerChatId`, `status: 'active'`, `updatedAt`.
3. **Deletion** — Not implemented in the current version.

### Relationship with `users`

- **`users.partnerCode`** — Field in the mom's user document referencing the same 6-character code.
- **`users.role`** — User role (`'mom'` or `'partner'`). Partner gets `'partner'` role after linking.
- **`partners.{partnerCode}.momChatId`** — Links to the mom's profile in `users`.
- **`partners.{partnerCode}.partnerChatId`** — Links to the partner's profile in `users`.

### Source Code

- `functions/src/collections/partners.js` — CRUD helpers

---

## Composite Indexes

The file `firestore.indexes.json` (project root) defines the composite indexes required for queries:

| Collection | Index Fields | Direction |
|------------|--------------|-----------|
| `mood_logs` | `userId`, `date` | ASC, DESC |
| `nutrition_logs` | `userId`, `date` | ASC, DESC |
| `partners` | `momChatId` | Ascending |

> **Note:** For `partners`, the `momChatId` index is required for `getPartnershipByMom()` (`.where('momChatId', '==', momChatId).limit(1)`). Without it, the query fails with `FAILED_PRECONDITION: The query requires an index.`

---

## Validation Functions

Each schema exports a `validate<Schema>(doc)` function for checking documents before writing to Firestore. The function returns:

```js
{ valid: boolean, errors: string[] }
```

Usage example:

```js
const { validateMoodLog } = require("./src/schemas/moodLogs");

const result = validateMoodLog(doc);
if (!result.valid) {
  console.error("Validation errors:", result.errors);
}
```

| Collection | Validation | Factory | Query Helper |
|------------|------------|---------|--------------|
| `pregnancy_data` | `validatePregnancyData(doc)` | — | — |
| `mood_logs` | `validateMoodLog(doc)` | `createMoodLog(params)` | `getMoodLogsByUserAndDate(db, uid, start, end)` |
| `nutrition_logs` | `validateNutritionLog(doc)` | `createNutritionLog(params)` | `getNutritionLogsByUserAndDate(db, uid, start, end)` |

---

## Firestore Security Rules

Rules are defined in `firestore.rules` (project root).

### Principles

- **User isolation:** each user (identified by `request.auth.uid == chatId`) has access only to their own documents.
- **Default deny:** any access not explicitly allowed is denied.
- **Authentication:** bot uses Firebase Custom Tokens; token `uid` equals `String(chatId)` of the Telegram user.

### Rules by collection

| Collection | Read | Write |
|---|---|---|
| `users/{chatId}` | Owner only (`request.auth.uid == chatId`) | Owner only |
| `mood_logs/{docId}` | Owner only (`resource.data.userId == request.auth.uid`) | Owner only |
| `nutrition_logs/{docId}` | Owner only (`resource.data.userId == request.auth.uid`) | Owner only |
| `pregnancy_data/{docId}` | Any authenticated | Server only (firebase-admin) |
| `partners/{partnerCode}` | Mom (`momChatId == uid`) or linked partner (`partnerChatId == uid`) | Server only |
| Everything else | Denied | Denied |

### Testing

Rules are covered by automated tests (Firestore emulator + `@firebase/rules-unit-testing`).
Run: `cd functions && npm run test:rules`
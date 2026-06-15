# Схемы коллекций Firestore — MamaBot

> Дата: 2026-06-15
> Проект: mamabot-97d22
> Документация описывает структуру документов в коллекциях Firestore бота MamaBot.

---

## 1. Коллекция `pregnancy_data`

Хранит контент о беременности по неделям (1–40) на двух языках (ru/en).

### Составной ID документа

Формат: `{weekNumber}_{language}`

| ID      | weekNumber | language |
|---------|-----------|----------|
| `1_ru`  | 1         | ru       |
| `1_en`  | 1         | en       |
| `15_ru` | 15        | ru       |
| `40_en` | 40        | en       |

### Поля документа

| Поле                    | Тип                   | Обязательное | Nullable | Описание                                                 |
|-------------------------|-----------------------|:------------:|:--------:|----------------------------------------------------------|
| `weekNumber`            | `number` (integer)    |      ✅      |    ❌    | Неделя беременности (1–40)                                |
| `language`              | `string`              |      ✅      |    ❌    | Язык контента: `'ru'` или `'en'`                          |
| `babyDevelopment`       | `string`              |      ✅      |    ❌    | Развитие ребёнка на этой неделе                           |
| `motherChanges`         | `string`              |      ✅      |    ❌    | Изменения в организме матери                              |
| `nutritionTips`         | `string`              |      ✅      |    ❌    | Советы по питанию                                         |
| `vitaminRecommendations`| `string`              |      ✅      |    ❌    | Рекомендации по витаминам                                 |
| `symptomsCommon`        | `string`              |      ✅      |    ❌    | Типичные симптомы                                         |
| `babySize`              | `string`              |      ✅      |    ❌    | Размер ребёнка (сравнение с фруктом/овощем)               |
| `babyWeightGrams`       | `number` (integer)    |      ✅      |    ❌    | Вес ребёнка в граммах (1–5000)                            |
| `createdAt`             | `Timestamp`           |      ✅      |    ✅    | Время создания (Firestore serverTimestamp)                |
| `updatedAt`             | `Timestamp`           |      ✅      |    ✅    | Время последнего обновления (Firestore serverTimestamp)   |

> **Примечание:** Поля `createdAt` и `updatedAt` помечены как nullable, так как
> при создании документа передаётся `FieldValue.serverTimestamp()`, который
> разрешается в конкретное время только после записи в Firestore.

### Пример документа (JSON)

```json
{
  "weekNumber": 1,
  "language": "ru",
  "babyDevelopment": "Оплодотворённая яйцеклетка начинает активно делиться...",
  "motherChanges": "Задержка менструации — самый первый признак беременности.",
  "nutritionTips": "Начните приём фолиевой кислоты, если ещё не начали.",
  "vitaminRecommendations": "Фолиевая кислота 400 мкг/сутки",
  "symptomsCommon": "Усталость, чувствительность груди, тошнота",
  "babySize": "размером с маковое зёрнышко",
  "babyWeightGrams": 4,
  "createdAt": "<server timestamp>",
  "updatedAt": "<server timestamp>"
}
```

### Использование в боте

Бот запрашивает контент по неделе и языку пользователя:

```js
// Получить контент для недели N на языке пользователя
const weekNumber = 12;
const language = "ru"; // или "en", из профиля пользователя
const docId = `${weekNumber}_${language}`;
const doc = await db.collection("pregnancy_data").doc(docId).get();
```

---

## 2. Коллекция `users`

Хранит профили пользователей бота. Каждый документ соответствует одному
пользователю Telegram. ID документа — `String(chatId)`.

### Поля документа

| Поле         | Тип                   | Обязательное | Nullable | Описание                                        |
|--------------|-----------------------|:------------:|:--------:|-------------------------------------------------|
| `chatId`     | `number`              |      ✅      |    ❌    | Telegram chat ID (также ID документа)            |
| `userId`     | `string`              |      ✅      |    ❌    | Telegram user ID (из `from.id`)                  |
| `firstName`  | `string`              |      ✅      |    ❌    | Имя пользователя Telegram                        |
| `lastName`   | `string`              |      ❌      |    ❌    | Фамилия пользователя Telegram                    |
| `username`   | `string`              |      ❌      |    ❌    | @username в Telegram                             |
| `language`   | `'ru'\|'en'`          |      ✅      |    ❌    | Выбранный язык (заполняется при онбординге)      |
| `lmpDate`    | `string` (ISO 8601)   |      ❌      |    ❌    | Дата первого дня последней менструации в формате YYYY-MM-DD. Заполняется обработчиком `functions/src/handlers/onboarding/lmpDialog.js` во время онбординга. |
| `currentWeek`| `number` (integer)    |      ❌      |    ❌    | Вычисленная текущая неделя беременности (1–42). Заполняется обработчиком `functions/src/handlers/onboarding/lmpDialog.js` вместе с `lmpDate`. |
| `partnerCode`| `string`              |      ❌      |    ❌    | 6-символьный код для приглашения партнёра        |
| `role`       | `'mom'\|'partner'`    |      ✅      |    ❌    | Роль пользователя                                |
| `createdAt`  | `Timestamp`           |      ✅      |    ✅    | Время создания (Firestore serverTimestamp)       |
| `updatedAt`  | `Timestamp`           |      ✅      |    ✅    | Время последнего обновления (serverTimestamp)    |

### Жизненный цикл документа

1. **Создание:** Документ создаётся при первом взаимодействии пользователя с
   ботом — когда пользователь нажимает кнопку выбора языка в диалоге онбординга
   (`functions/src/handlers/onboarding/languageDialog.js`).
2. **Обновление:** Поле `language` может быть обновлено через `setLanguage()`
   (i18n-модуль) или через меню настроек.
3. **Другие поля** (`lmpDate`, `currentWeek`) заполняются обработчиком
   `functions/src/handlers/onboarding/lmpDialog.js` после успешного ввода и проверки
   даты последней менструации. Поле `partnerCode` заполняется последующими шагами онбординга.

### Использование в боте

Пользователь создаётся при первом запуске бота (`/start`). После выбора языка
и ввода даты ПМ поля `lmpDate` и `currentWeek` заполняются автоматически.

```js
const { getUser, updateUser } = require('./collections/users');

// Получить пользователя
const user = await getUser(chatId);

// Обновить поля
await updateUser(chatId, {
  lmpDate: '2026-03-15',
  currentWeek: 14,
});
```

### Пример документа (JSON)

```json
{
  "chatId": 123456789,
  "userId": "123456789",
  "firstName": "Анна",
  "lastName": "Иванова",
  "username": "anna_i",
  "language": "ru",
  "role": "mom",
  "createdAt": "<server timestamp>",
  "updatedAt": "<server timestamp>"
}
```

### Исходный код

- `functions/src/collections/users.js` — CRUD-хелперы (`createUser`, `getUser`, `updateUser`)
- `functions/src/handlers/onboarding/lmpDialog.js` — обработчик ввода даты ПМ
- `functions/src/handlers/onboarding/languageDialog.js` — обработчик выбора языка
- `functions/src/firestore.js` — инициализация Firestore клиента

---

## 3. Коллекция `mood_logs`

Хранит записи настроения и уровня энергии пользователя по дням.
Каждый документ соответствует одному дню (одному пользователю — одна запись на дату,
хотя технически ограничение не накладывается).

ID документа: авто-генерируется Firestore.

### Поля документа

| Поле       | Тип                   | Обязательное | Nullable | Описание                                        |
|------------|-----------------------|:------------:|:--------:|-------------------------------------------------|
| `userId`   | `string`              |      ✅      |    ❌    | ID пользователя Telegram (string)               |
| `date`     | `string` (ISO 8601)   |      ✅      |    ❌    | Дата в формате `YYYY-MM-DD`                     |
| `mood`     | `number` (integer)    |      ✅      |    ❌    | Настроение (1–5; 1 = очень плохо, 5 = отлично)  |
| `energy`   | `number` (integer)    |      ✅      |    ❌    | Уровень энергии (1–5; 1 = очень низкий, 5 = очень высокий) |
| `note`     | `string`              |      ❌      |    ❌    | Опциональная заметка (по умолчанию `""`)         |
| `createdAt`| `Timestamp`           |      ✅      |    ✅    | Время создания (Firestore serverTimestamp)       |

> **Примечание:** Поле `createdAt` помечено как nullable, так как при создании
> документа передаётся `FieldValue.serverTimestamp()`, который разрешается
> в конкретное время только после записи в Firestore.

### Пример документа (JSON)

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

### Запросы

**По userId + диапазон дат (основной паттерн):**

```js
const { getMoodLogsByUserAndDate } = require("./src/schemas/moodLogs");

const logs = await getMoodLogsByUserAndDate(
  db,
  userId,
  "2026-06-01",
  "2026-06-15",
);
```

Требуется составной индекс:
- `mood_logs`: `userId` ASC, `date` DESC (описан в `firestore.indexes.json`)

### Создание документа

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

---

## 4. Коллекция `nutrition_logs`

Хранит записи о питании пользователя: приёмы пищи, витамины и потребление воды.
Каждый документ соответствует одному приёму пищи (возможно несколько записей на один день).

ID документа: авто-генерируется Firestore.

### Поля документа

| Поле           | Тип                   | Обязательное | Nullable | Описание                                                 |
|----------------|-----------------------|:------------:|:--------:|----------------------------------------------------------|
| `userId`       | `string`              |      ✅      |    ❌    | ID пользователя Telegram (string)                        |
| `date`         | `string` (ISO 8601)   |      ✅      |    ❌    | Дата в формате `YYYY-MM-DD`                              |
| `mealType`     | `string` (enum)       |      ✅      |    ❌    | Тип приёма пищи: `'breakfast'`, `'lunch'`, `'dinner'`, `'snack'` |
| `foods`        | `array` of `string`   |      ✅      |    ❌    | Список съеденных продуктов (минимум 1 элемент)           |
| `vitamins`     | `array` of `string`   |      ❌      |    ❌    | Список принятых витаминов (по умолчанию `[]`)            |
| `waterGlasses` | `number` (integer)    |      ✅      |    ❌    | Количество выпитых стаканов воды (≥0, по умолчанию `0`)  |
| `createdAt`    | `Timestamp`           |      ✅      |    ✅    | Время создания (Firestore serverTimestamp)               |

> **Примечание:** Поле `createdAt` помечено как nullable, так как при создании
> документа передаётся `FieldValue.serverTimestamp()`, который разрешается
> в конкретное время только после записи в Firestore.

### Пример документа (JSON)

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

### Запросы

**По userId + диапазон дат (основной паттерн):**

```js
const { getNutritionLogsByUserAndDate } = require("./src/schemas/nutritionLogs");

const logs = await getNutritionLogsByUserAndDate(
  db,
  userId,
  "2026-06-01",
  "2026-06-15",
);
```

Требуется составной индекс:
- `nutrition_logs`: `userId` ASC, `date` DESC (описан в `firestore.indexes.json`)

### Создание документа

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

---

## Составные индексы

Файл `firestore.indexes.json` (в корне проекта) определяет составные индексы,
необходимые для запросов по `userId + date`.

| Коллекция        | Поля индекса        | Направление      |
|------------------|---------------------|------------------|
| `mood_logs`      | `userId`, `date`    | ASC, DESC        |
| `nutrition_logs` | `userId`, `date`    | ASC, DESC        |

---

## Валидация данных

Каждая схема экспортирует функцию `validate<Schema>(doc)` для проверки
документа перед записью в Firestore. Функция возвращает:

```js
{ valid: boolean, errors: string[] }
```

Пример использования:

```js
const { validateMoodLog } = require("./src/schemas/moodLogs");

const result = validateMoodLog(doc);
if (!result.valid) {
  console.error("Validation errors:", result.errors);
}
```

| Схема              | Функция валидации              | Фабрика создания          | Помощник запросов                       |
|--------------------|-------------------------------|---------------------------|----------------------------------------|
| `pregnancy_data`   | `validatePregnancyData(doc)`   | —                         | —                                      |
| `mood_logs`        | `validateMoodLog(doc)`         | `createMoodLog(params)`   | `getMoodLogsByUserAndDate(db, uid, start, end)` |
| `nutrition_logs`   | `validateNutritionLog(doc)`    | `createNutritionLog(params)` | `getNutritionLogsByUserAndDate(db, uid, start, end)` |

## Исходный код

- **Схемы:**
  - `functions/src/schemas/pregnancy_data.js`
  - `functions/src/schemas/moodLogs.js`
  - `functions/src/schemas/nutritionLogs.js`
- **Тесты (unit + валидация):**
  - `functions/src/schemas/__tests__/pregnancy_data.test.js`
  - `functions/src/schemas/__tests__/pregnancy_data.integration.test.js`
  - `functions/test/moodLogs.test.js` — `node --test`
  - `functions/test/nutritionLogs.test.js` — `node --test`
- **Скрипты:**
  - `functions/scripts/seed-pregnancy-data.js` — загрузка 40 недель (ru + en) в `pregnancy_data`
  - `functions/scripts/verify-pregnancy-data.js` — верификация схемы документа
- **Индексы:**
  - `firestore.indexes.json` (корень проекта)
- **Обработчики:**
  - `functions/src/handlers/router.js` — центральный callback-роутер (диспетчеризация по префиксам: `menu_*`, `onboarding_*`, `settings_*`, `week_*`, `mood_*`, `nutrition_*`)

  - `functions/src/handlers/menu/mainMenu.js` — рендеринг главного меню (4 кнопки в 2 ряда, локализованные подписи)

---

## 5. i18n / Локализация

Система интернационализации бота реализована в модуле `functions/src/i18n.js`.

- **Функция `t(userId, key, vars?)`** — разрешает dot-нотацию ключа в локализованную
  строку для пользователя.
- **Функция `setLanguage(userId, lang)`** — сохраняет языковую предпочтение
  пользователя в Firestore (`users/{chatId}.language`).
- **Locale-файлы:** `functions/src/locales/{ru,en}.json` — содержат все
  локализованные строки с идентичной структурой ключей.
- **Подстановка:** `{{variable}}` в строках заменяется на значения из объекта `vars`.
- **Fallback:** язык пользователя → русский → сырой ключ.

Подробная документация: [`docs/i18n.md`](./i18n.md).

### Ключи онбординга

| Ключ                    | Описание                                                     | Плейсхолдеры |
|-------------------------|--------------------------------------------------------------|-------------|
| `onboarding.language_ru`| Текст кнопки «🇷🇺 Русский» (одинаков в обоих locale-файлах)   | —           |
| `onboarding.language_en`| Текст кнопки «🇬🇧 English» (одинаков в обоих locale-файлах)   | —           |
| `onboarding.language_saved` | Подтверждение выбора языка                               | `{{lang}}`  |
| `onboarding.already_registered` | Сообщение для повторного /start                       | —           |
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

## 2. Коллекция `users` (планируется — FN-001)

> Базовая схема будет описана после выполнения задачи FN-001.
> Предполагаемые поля: `userId`, `telegramId`, `language`, `pregnancyWeek`, `createdAt`.

---

## 3. Коллекция `mood_logs` (планируется — FN-002)

> Схема будет описана после выполнения задачи FN-002.
> Предполагаемые поля: `userId`, `date`, `mood`, `energy`, `note`, `createdAt`.

---

## 4. Коллекция `nutrition_logs` (планируется — FN-002)

> Схема будет описана после выполнения задачи FN-002.
> Предполагаемые поля: `userId`, `date`, `meals`, `vitamins`, `water`, `createdAt`.

---

## Валидация данных

Каждая схема экспортирует функцию `validatePregnancyData(doc)` для проверки
документа перед записью в Firestore. Функция возвращает:

```js
{ valid: boolean, errors: string[] }
```

Пример использования:

```js
const { validatePregnancyData } = require("./src/schemas/pregnancy_data.js");

const result = validatePregnancyData(doc);
if (!result.valid) {
  console.error("Validation errors:", result.errors);
}
```

## Исходный код

- **Схема:** `functions/src/schemas/pregnancy_data.js`
- **Тесты:** `functions/src/schemas/__tests__/pregnancy_data.test.js`
- **Интеграционный тест:** `functions/src/schemas/__tests__/pregnancy_data.integration.test.js`
- **Скрипт верификации:** `functions/scripts/verify-pregnancy-data.js`
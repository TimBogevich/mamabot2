# MamaBot Backlog

## Критические / Функциональные баги

### 1. Меню слеш-команд не отображается
**Файлы:** `functions/index.js:136-148`, `functions/src/utils/telegram.js`
**Описание:** Бот нигде не вызывает Telegram API `setMyCommands`, поэтому пользователи не видят список доступных команд при вводе `/`. Нужно добавить вызов `setMyCommands` в `registerWebhook` и зарегистрировать команды (`/start`, `/help`, `/settings`, `/menu`).

### 2. Echo fallback на все неизвестные сообщения
**Файл:** `functions/index.js:98-99`
**Описание:** Любое текстовое сообщение, не равное `/start` и не являющееся вводом ПДР, просто возвращается пользователю как эхо. Команды `/help`, `/settings`, `/menu` не обрабатываются — бот просто повторяет их текст. Нужно добавить обработку этих команд вместо отправки эха.

### 3. Три основных фичи ведут на handleNotImplemented
**Файл:** `functions/src/handlers/router.js:157-187`
**Описание:** Домены `week`, `mood`, `nutrition` в таблице маршрутизации есть, но все идут в `handleNotImplemented`. Пользователь видит «Неизвестная команда». Кнопки главного меню `menu_my_week`, `menu_mood_diary`, `menu_nutrition` тоже не работают — ведут туда же. Схемы Firestore для mood_logs и nutrition_logs готовы, тесты написаны, но UI-обработчики отсутствуют.

### 4. Функционал «Пригласить партнёра» не реализован
**Файлы:** `functions/src/collections/partners.js`, `functions/src/schemas/partners.js`
**Описание:** Схема, CRUD и Firestore security rules для partners готовы. Строка `menu.invite_partner` есть в локалях. Но нет ни одной кнопки/обработчика для генерации кода приглашения или его принятия. Кнопка не отображается в главном меню.

### 5. Пустые catch блоки без логгирования в lmpDialog
**Файл:** `functions/src/handlers/onboarding/lmpDialog.js:233, 245`
**Описание:** Два `catch {}` блока (без переменной ошибки) в `handleLmpInput` — при сбое `calculatePregnancyWeek` или `updateUser`. Ошибка проглатывается полностью: пользователь видит generic error, но в логи ничего не попадает. Невозможно отладить.

---

## Средний приоритет

### 6. Пустые поля контента беременности
**Файлы:** `functions/scripts/seed-pregnancy-data.js`, `functions/src/data/pregnancyWeeks_*.json`
**Описание:** При сидировании 4 из 9 полей заполняются пустыми строками: `motherChanges`, `nutritionTips`, `vitaminRecommendations`, `symptomsCommon`. В JSON-файлах данных этих полей нет, схема требует string. Пользователь не получит эту информацию в нотификациях.

### 7. Дублирующиеся директории локалей
**Файлы:** `functions/src/i18n/` и `functions/src/locales/`
**Описание:** Два набора файлов локализации. `i18n.js` загружает из `locales/`, но `i18n/` содержит устаревшие копии. Документация `docs/i18n.md` ссылается на старый путь. Это источник путаницы и рассинхрона при обновлении переводов.

### 8. Дублирующаяся документация по Firestore schema
**Файлы:** `docs/firestore-schema.md`, `functions/docs/schemas.md`
**Описание:** Два файла документируют одно и то же с перекрывающимся содержимым и билингвальными секциями. Один из них нужно удалить или объединить.

### 9. 721 линт-предупреждение
**Описание:** `npm run lint` выдаёт 721 warning (0 errors):
- `quotes`: ~640 случаев двойных кавычек вместо одинарных
- `no-var`: ~56 случаев использования `var` в `src/__tests__/i18n.test.js`
- `no-unused-vars`: ~19 ложных срабатываний на `_err` префиксах
- `comma-dangle`: ~3 пропущенных запятых
Можно автофикснуть `npm run lint -- --fix`.

---

## Низкий приоритет / Улучшения

### 10. Неиспользуемая зависимость `@rolldown/pluginutils`
**Файл:** `functions/package.json`
**Описание:** Пакет в runtimeDependencies, но нигде в коде не импортируется. Возможно, остался от цепочки сборки. Можно удалить.

### 11. Jest как неиспользуемая devDependency
**Файл:** `functions/package.json`
**Описание:** Проект использует Vitest для тестов, но `jest` также указан в devDependencies. Не используется. Можно удалить.

### 12. `verify-pregnancy-data.js` не запускается в CI
**Файл:** `functions/docs/deployment.md`
**Описание:** В документации явно указано, что скрипт верификации не добавлен в CI. Только `verify:users-schema` запускается. При изменении pregnancy-данных ошибки не будут отловлены до деплоя.

### 13. Нет TypeScript / JSDoc type-checking
**Описание:** Проект на чистом JS без `tsconfig.json`. JSDoc-аннотации есть в некоторых файлах, но не проверяются. Можно добавить `tsconfig.json` с `checkJs: true` и `allowJs: true` для базовой проверки типов без миграции на TS.

### 14. Нет обработки `max_topic_id` в sendMessage
**Файл:** `functions/src/utils/telegram.js:36-62`
**Описание:** Если бот используется в топиках Telegram-форумов, параметр `message_thread_id` не пробрасывается в `sendMessage`. Нужно добавить в интерфейс.

---

## Уже смержено / Работает (для справки)

- FN-027 (mainMenu): смержен — меню показывается
- FN-024 (languageChoice): смержен — выбор языка работает
- FN-006 (confirmEdd): смержен — подтверждение ПДР работает
- FN-007 (editEdd): смержен — редактирование ПДР работает
- FN-029 (settings): смержен — настройки работают
- FN-020 (sendWeeklyNotifications): смержен — нотификации работают
- 508 тестов проходят, 22 test files green
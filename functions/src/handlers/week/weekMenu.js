/**
 * @fileoverview Обработчик раздела «Моя неделя» MamaBot.
 *
 * Показывает информацию о текущей неделе беременности: развитие плода,
 * изменения в организме матери, размер и вес ребёнка, советы по питанию,
 * рекомендации по витаминам и типичные симптомы.
 *
 * Данные загружаются из коллекции `pregnancy_data` по составному ID
 * {weekNumber}_{language} (например, `15_ru`, `20_en`).
 *
 * @module weekMenu
 */

const { t } = require('../../i18n');
const { getUser } = require('../../collections/users');
const { sendMessage } = require('../../utils/telegram');
const { pregnancyDataDocId, PREGNANCY_DATA_COLLECTION } = require('../../schemas/pregnancy_data');
const { db } = require('../../firestore');

// ---------------------------------------------------------------------------
// Ленивая загрузка calculatePregnancyWeek (для тестируемости через __inject)
// ---------------------------------------------------------------------------

/** @type {typeof require('../../utils/pregnancyWeek').calculatePregnancyWeek} */
let _calculatePregnancyWeek = null;
try {
  _calculatePregnancyWeek = require('../../utils/pregnancyWeek').calculatePregnancyWeek;
} catch (_err) {
  // FN-026 ещё не смержен
}

// ---------------------------------------------------------------------------
// Безопасная загрузка showMainMenu из mainMenu
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showMainMenu = null;
try {
  _showMainMenu = require('../menu/mainMenu').showMainMenu;
} catch (_err) {
  // mainMenu ещё не смержен
}

// ---------------------------------------------------------------------------
// Ленивая загрузка askForLmpDate (для автоматического онбординга)
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string) => Promise<void>)|null} */
let _askForLmpDate = null;
try {
  _askForLmpDate = require('../onboarding/lmpDialog').askForLmpDate;
} catch (_err) {
  // lmpDialog ещё не смержен
}

// ---------------------------------------------------------------------------
// Внутренние ссылки на зависимости (мутабельные для __inject)
// ---------------------------------------------------------------------------

/** @type {typeof t} */
let _t = t;

/** @type {typeof getUser} */
let _getUser = getUser;

/** @type {typeof sendMessage} */
let _sendMessage = sendMessage;

/** @type {typeof db} */
let _db = db;

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/**
 * Загружает документ pregnancy_data по номеру недели и языку.
 *
 * @param {number} week - Номер недели (1–40)
 * @param {'ru'|'en'} language - Язык контента
 * @returns {Promise<Object|null>} Данные документа или null
 */
async function loadPregnancyData(week, language) {
  const docId = pregnancyDataDocId(week, language);
  const snap = await _db.collection(PREGNANCY_DATA_COLLECTION).doc(docId).get();
  if (!snap.exists) {
    return null;
  }
  return { id: snap.id, ...snap.data() };
}

// ---------------------------------------------------------------------------
// Внутренние async-функции (для тестирования через __inject)
// ---------------------------------------------------------------------------

/**
 * Показывает информацию о неделе беременности.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {number} [weekOverride] - Явно указать номер недели (для навигации)
 * @returns {Promise<{status: string, week?: number}>}
 */
async function _showWeekInfoImpl(chatId, weekOverride) {
  const user = await _getUser(chatId);

  if (!user || !user.lmpDate) {
    await _sendMessage(chatId, await _t(chatId, 'week.no_lmp'));
    if (_askForLmpDate) {
      await _askForLmpDate(chatId);
    } else if (_showMainMenu) {
      await _showMainMenu(chatId);
    }
    return { status: 'no_lmp' };
  }

  const language = user.language === 'en' ? 'en' : 'ru';

  // Пересчитываем неделю из lmpDate (а не из закешированного currentWeek)
  let week = weekOverride;
  if (!week && _calculatePregnancyWeek) {
    const calc = _calculatePregnancyWeek(user.lmpDate);
    week = calc.week;
  }
  if (!week) {
    week = user.currentWeek;
  }

  if (!week || week < 1 || week > 40) {
    await _sendMessage(chatId, await _t(chatId, 'week.no_lmp'));
    if (_showMainMenu) {
      await _showMainMenu(chatId);
    }
    return { status: 'invalid_week', week };
  }

  const data = await loadPregnancyData(week, language);

  if (!data) {
    await _sendMessage(chatId, await _t(chatId, 'week.no_data', { week }));
    if (_showMainMenu) {
      await _showMainMenu(chatId);
    }
    return { status: 'no_data', week };
  }

  // Формирование сообщения
  const title = await _t(chatId, 'week.title', { week: data.weekNumber });
  const labelDev = await _t(chatId, 'week.label_fetal_development');
  const labelMother = await _t(chatId, 'week.label_mother_body');
  const labelNutrition = await _t(chatId, 'week.label_nutrition');
  const labelVitamins = await _t(chatId, 'week.label_vitamins');
  const labelSymptoms = await _t(chatId, 'week.label_symptoms');

  const sizeText = await _t(chatId, 'week.label_size', { size: data.babySize || '' });
  const weightText = await _t(chatId, 'week.label_weight', { weight: data.babyWeightGrams || '?' });

  const blocks = [];
  blocks.push(title);
  blocks.push('');
  blocks.push(`${labelDev}\n${data.babyDevelopment || ''}`);

  if (data.motherChanges) {
    blocks.push('');
    blocks.push(`${labelMother}\n${data.motherChanges}`);
  }

  blocks.push('');
  blocks.push(sizeText);
  blocks.push(weightText);

  if (data.nutritionTips) {
    blocks.push('');
    blocks.push(`${labelNutrition}\n${data.nutritionTips}`);
  }

  if (data.vitaminRecommendations) {
    blocks.push('');
    blocks.push(`${labelVitamins}\n${data.vitaminRecommendations}`);
  }

  if (data.symptomsCommon) {
    blocks.push('');
    blocks.push(`${labelSymptoms}\n${data.symptomsCommon}`);
  }

  const text = blocks.join('\n');

  // Клавиатура навигации
  const backLabel = await _t(chatId, 'week.back_to_menu');

  const keyboard = { inline_keyboard: [] };

  // Кнопки предыдущей/следующей недели
  const navRow = [];
  if (week > 1) {
    const prevLabel = await _t(chatId, 'week.prev_week', { week: week - 1 });
    navRow.push({ text: prevLabel, callback_data: `week_show_${week - 1}` });
  }
  if (week < 40) {
    const nextLabel = await _t(chatId, 'week.next_week', { week: week + 1 });
    navRow.push({ text: nextLabel, callback_data: `week_show_${week + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.inline_keyboard.push(navRow);
  }

  // Кнопка «Назад»
  keyboard.inline_keyboard.push([
    { text: backLabel, callback_data: 'week_back' },
  ]);

  await _sendMessage(chatId, text, { reply_markup: keyboard });

  return { status: 'week_shown', week: data.weekNumber };
}

// ---------------------------------------------------------------------------
// Публичное API
// ---------------------------------------------------------------------------

/**
 * Показывает информацию о текущей неделе беременности пользователя.
 *
 * Если пользователь не завершил онбординг (нет lmpDate),
 * выводится сообщение с предложением выполнить /start.
 *
 * @param {number|string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Результат { status, week? }
 * @throws {Error} Синхронно, если chatId не передан
 */
function showWeekInfo(chatId) {
  if (chatId === null || chatId === undefined) {
    throw new Error('chatId is required');
  }

  return _showWeekInfoImpl(chatId);
}

/**
 * Обрабатывает callback-запросы домена week.
 *
 * Поддерживаемые callback_data:
 *   - week_show_{N} — показать конкретную неделю
 *   - week_back     — вернуться в главное меню
 *   - week_show     — показать текущую неделю (из главного меню)
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} callbackData - Полный callback_data
 * @returns {Promise<Object>} Результат
 */
async function handleWeekCallback(chatId, callbackData) {
  if (chatId === null || chatId === undefined) {
    throw new Error('chatId is required');
  }

  if (callbackData === 'week_back' || callbackData === 'menu_my_week') {
    return _showWeekInfoImpl(chatId);
  }

  // week_show_{N} — показать конкретную неделю
  const weekMatch = callbackData.match(/^week_show_(\d+)$/);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[1], 10);
    if (weekNum >= 1 && weekNum <= 40) {
      return _showWeekInfoImpl(chatId, weekNum);
    }
  }

  return _showWeekInfoImpl(chatId);
}

// ---------------------------------------------------------------------------
// Хук тестируемости
// ---------------------------------------------------------------------------

/**
 * @param {Object} deps
 * @param {Function} [deps.t]
 * @param {Function} [deps.getUser]
 * @param {Function} [deps.sendMessage]
 * @param {Object} [deps.db]
 * @param {Function|null} [deps.showMainMenu]
 * @param {Function|null} [deps.calculatePregnancyWeek]
 * @param {Function|null} [deps.askForLmpDate]
 */
function __inject(deps) {
  if (deps.t) _t = deps.t;
  if (deps.getUser) _getUser = deps.getUser;
  if (deps.sendMessage) _sendMessage = deps.sendMessage;
  if (deps.db) _db = deps.db;
  if (deps.showMainMenu !== undefined) _showMainMenu = deps.showMainMenu;
  if (deps.calculatePregnancyWeek !== undefined) _calculatePregnancyWeek = deps.calculatePregnancyWeek;
  if (deps.askForLmpDate !== undefined) _askForLmpDate = deps.askForLmpDate;
}

module.exports = { showWeekInfo, handleWeekCallback, __inject };

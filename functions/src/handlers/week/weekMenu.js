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

  // -----------------------------------------------------------------------
  // Формирование сводного сообщения (summary) + детальные кнопки
  // -----------------------------------------------------------------------
  const weekNum = data.weekNumber;
  const title = await _t(chatId, 'week.summary_title', { week: weekNum });

  // BabyDevelopment: первые ~250 символов + '...'
  const devRaw = data.babyDevelopment || '';
  const devSummary =
    devRaw.length > 250 ? devRaw.slice(0, 250) + '...' : devRaw;

  const labelDev = await _t(chatId, 'week.label_fetal_development');

  const sizeText = await _t(chatId, 'week.label_size', { size: data.babySize || '' });
  const weightText = await _t(chatId, 'week.label_weight', { weight: data.babyWeightGrams || '?' });

  // Строим сводку напрямую (без blocks-массива)
  let summary = title + '\n\n';
  summary += labelDev + '\n' + devSummary;
  summary += '\n\n' + sizeText;
  summary += '\n' + weightText;

  // -----------------------------------------------------------------------
  // Клавиатура: детальные кнопки, навигация, назад
  // -----------------------------------------------------------------------
  const keyboard = { inline_keyboard: [] };

  // Определяем, какие секции имеют данные
  const sections = [];
  if (data.motherChanges) {
    sections.push({
      field: 'mother',
      labelKey: 'week.detail_mother',
    });
  }
  if (data.nutritionTips) {
    sections.push({
      field: 'nutrition',
      labelKey: 'week.detail_nutrition',
    });
  }
  if (data.vitaminRecommendations) {
    sections.push({
      field: 'vitamins',
      labelKey: 'week.detail_vitamins',
    });
  }
  if (data.symptomsCommon) {
    sections.push({
      field: 'symptoms',
      labelKey: 'week.detail_symptoms',
    });
  }
  // development всегда есть (хотя бы пустая строка), добавляем кнопку только если есть текст
  if (devRaw) {
    sections.unshift({
      field: 'development',
      labelKey: 'week.detail_development',
    });
  }

  // Если ни одна секция не имеет данных — fallback к полному inline-формату
  if (sections.length === 0) {
    const fallbackTitle = await _t(chatId, 'week.title', { week: weekNum });
    const fallbackBlocks = [fallbackTitle];
    fallbackBlocks.push('');
    fallbackBlocks.push(labelDev + '\n' + devRaw);

    if (data.motherChanges) {
      fallbackBlocks.push('');
      fallbackBlocks.push((await _t(chatId, 'week.label_mother_body')) + '\n' + data.motherChanges);
    }

    fallbackBlocks.push('');
    fallbackBlocks.push(sizeText);
    fallbackBlocks.push(weightText);

    if (data.nutritionTips) {
      fallbackBlocks.push('');
      fallbackBlocks.push((await _t(chatId, 'week.label_nutrition')) + '\n' + data.nutritionTips);
    }

    if (data.vitaminRecommendations) {
      fallbackBlocks.push('');
      fallbackBlocks.push((await _t(chatId, 'week.label_vitamins')) + '\n' + data.vitaminRecommendations);
    }

    if (data.symptomsCommon) {
      fallbackBlocks.push('');
      fallbackBlocks.push((await _t(chatId, 'week.label_symptoms')) + '\n' + data.symptomsCommon);
    }

    summary = fallbackBlocks.join('\n');
  }

  // Строки детальных кнопок (до 3 в ряд)
  if (sections.length > 0) {
    const detailRows = [];
    let currentRow = [];
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const label = await _t(chatId, sec.labelKey);
      currentRow.push({
        text: label,
        callback_data: `week_detail_${sec.field}_${weekNum}`,
      });
      if (currentRow.length === 3 || i === sections.length - 1) {
        detailRows.push(currentRow);
        currentRow = [];
      }
    }
    keyboard.inline_keyboard.push(...detailRows);
  }

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

  // Кнопка «Назад» в главное меню
  const backLabel = await _t(chatId, 'week.back_to_menu');
  keyboard.inline_keyboard.push([
    { text: backLabel, callback_data: 'week_back' },
  ]);

  await _sendMessage(chatId, summary, { reply_markup: keyboard });

  return { status: 'week_shown', week: data.weekNumber };
}

// ---------------------------------------------------------------------------
// handleWeekDetail — отправка отдельной секции
// ---------------------------------------------------------------------------

/**
 * Карта соответствия имени секции → поле данных + ключ заголовка
 */
const DETAIL_SECTION_MAP = {
  development: {
    field: 'babyDevelopment',
    titleKey: 'week.detail_development_title',
  },
  mother: {
    field: 'motherChanges',
    titleKey: 'week.detail_mother_title',
  },
  nutrition: {
    field: 'nutritionTips',
    titleKey: 'week.detail_nutrition_title',
  },
  vitamins: {
    field: 'vitaminRecommendations',
    titleKey: 'week.detail_vitamins_title',
  },
  symptoms: {
    field: 'symptomsCommon',
    titleKey: 'week.detail_symptoms_title',
  },
};

/**
 * Отправляет сообщение с содержимым одной секции недели беременности
 * и кнопкой «Назад к сводке».
 *
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} section - Имя секции: development|mother|nutrition|vitamins|symptoms
 * @param {number} weekNum - Номер недели
 * @param {Object} data - Полный объект pregnancyData
 * @returns {Promise<{status: string, week: number, section: string}>}
 */
async function handleWeekDetail(chatId, section, weekNum, data) {
  const mapping = DETAIL_SECTION_MAP[section];

  // Неизвестная секция
  if (!mapping) {
    return { status: 'unknown_section', week: weekNum, section };
  }

  const sectionContent = data[mapping.field] || '';
  const title = await _t(chatId, mapping.titleKey, { week: weekNum });

  let messageText;
  if (!sectionContent) {
    messageText = title + '\n\n' + (await _t(chatId, 'week.detail_no_data'));
    // Fallback-сообщение очень короткое, обрезка не нужна
    await _sendMessage(chatId, messageText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: await _t(chatId, 'week.back_to_summary'), callback_data: `week_detail_back_${weekNum}` }],
        ],
      },
    });
    return { status: 'detail_shown_no_data', week: weekNum, section };
  }

  // Безопасная обрезка: заголовок + разделители + контент ≤ 4000
  const SAFE_MAX = 4000;
  if (sectionContent.length + title.length + 2 > SAFE_MAX) {
    const overhead = title.length + 2; // заголовок + '\n\n'
    const maxContent = SAFE_MAX - overhead - 3; // 3 символа на '...'
    const truncated = sectionContent.slice(0, Math.max(0, maxContent)) + '...';
    messageText = title + '\n\n' + truncated;
  } else {
    messageText = title + '\n\n' + sectionContent;
  }

  // Кнопка «Назад к сводке»
  const backLabel = await _t(chatId, 'week.back_to_summary');
  const keyboard = {
    inline_keyboard: [
      [{ text: backLabel, callback_data: `week_detail_back_${weekNum}` }],
    ],
  };

  await _sendMessage(chatId, messageText, { reply_markup: keyboard });

  return { status: 'detail_shown', week: weekNum, section };
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

  // week_detail_back_{N} — вернуться к сводке недели
  const backMatch = callbackData.match(/^week_detail_back_(\d+)$/);
  if (backMatch) {
    const weekNum = parseInt(backMatch[1], 10);
    if (weekNum >= 1 && weekNum <= 40) {
      return _showWeekInfoImpl(chatId, weekNum);
    }
  }

  // week_detail_{section}_{week} — детальная секция
  const detailMatch = callbackData.match(/^week_detail_(development|mother|nutrition|vitamins|symptoms)_(\d+)$/);
  if (detailMatch) {
    const section = detailMatch[1];
    const weekNum = parseInt(detailMatch[2], 10);
    if (weekNum >= 1 && weekNum <= 40) {
      // Получаем язык пользователя
      const user = await _getUser(chatId);
      if (!user) {
        return { status: 'no_user' };
      }
      const language = user.language === 'en' ? 'en' : 'ru';
      const data = await loadPregnancyData(weekNum, language);
      if (!data) {
        await _sendMessage(chatId, await _t(chatId, 'week.no_data', { week: weekNum }));
        return { status: 'no_data', week: weekNum };
      }
      return handleWeekDetail(chatId, section, weekNum, data);
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

module.exports = { showWeekInfo, handleWeekCallback, handleWeekDetail, __inject };

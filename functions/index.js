const {onRequest} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const {TELEGRAM_API, getTelegramToken, sendMessage, setMyCommands} = require('./src/utils/telegram');
const { routeCallback } = require('./src/handlers/router');
const languageDialog = require('./src/handlers/onboarding/languageDialog');
const { getUser } = require('./src/collections/users');

// ---------------------------------------------------------------------------
// Graceful degradation — FN-007 (editEdd handler) may not be merged yet
// ---------------------------------------------------------------------------

/** @type {((chatId: number|string, text: string) => Promise<Object>)|null} */
let _handleEditEddInput = null;
try {
  _handleEditEddInput = require('./src/handlers/onboarding/editEdd').handleEditEddInput;
} catch (_err) {
  // FN-007 ещё не смержен — текстовый ввод ПДР будет обработан как echo
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showMainMenu = null;
try {
  _showMainMenu = require('./src/handlers/menu/mainMenu').showMainMenu;
} catch (_err) {
  // showMainMenu not available — /menu command will fall back to echo
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showSettingsMenu = null;
try {
  _showSettingsMenu = require('./src/handlers/settings/settingsMenu').showSettingsMenu;
} catch (_err) {
  // showSettingsMenu not available — /settings command will fall back to echo
}

/** @type {((chatId: number|string, text: string) => Promise<Object>)|null} */
let _handleNutritionInput = null;
try {
  _handleNutritionInput = require('./src/handlers/nutrition/nutritionMenu').handleNutritionInput;
} catch (_err) {
  // nutrition handler not available
}

/** @type {((chatId: number|string, text: string) => Promise<Object>)|null} */
let _handlePartnerInput = null;
try {
  _handlePartnerInput = require('./src/handlers/partner/partnerMenu').handlePartnerInput;
} catch (_err) {
  // partner handler not available
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showWeekInfo = null;
try {
  _showWeekInfo = require('./src/handlers/week/weekMenu').showWeekInfo;
} catch (_err) {
  // not available
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showMoodMenu = null;
try {
  _showMoodMenu = require('./src/handlers/mood/moodMenu').showMoodMenu;
} catch (_err) {
  // not available
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showNutritionMenu = null;
try {
  _showNutritionMenu = require('./src/handlers/nutrition/nutritionMenu').showNutritionMenu;
} catch (_err) {
  // not available
}

/** @type {((chatId: number|string) => Promise<Object>)|null} */
let _showPartnerMenu = null;
try {
  _showPartnerMenu = require('./src/handlers/partner/partnerMenu').showPartnerMenu;
} catch (_err) {
  // not available
}

/** @type {((chatId: number|string, text: string) => Promise<Object>)|null} */
let _handleLmpInput = null;
try {
  _handleLmpInput = require('./src/handlers/onboarding/lmpDialog').handleLmpInput;
} catch (_err) {
  // lmpDialog not available
}

const { t } = require('./src/i18n');

const TELEGRAM_TOKEN = defineSecret('TELEGRAM_TOKEN');

// ---------------------------------------------------------------------------
// Graceful degradation — sendWeeklyNotifications handler may not be ready
// ---------------------------------------------------------------------------

/** @type {(() => Promise<{checked: number, notified: number}>)|null} */
let _sendWeeklyNotifications = null;
try {
  _sendWeeklyNotifications = require('./src/handlers/notifications/sendWeekly').sendWeeklyNotifications;
} catch (_err) {
  // FN-020 handler not yet available — scheduled function will log a warning
}

exports.webhook = onRequest(
  {
    invoker: 'public',
    secrets: [TELEGRAM_TOKEN],
  },
  async (req, res) => {
    if (req.method === 'GET') {
      return registerWebhook(req, res);
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const update = req.body;

      // 1. Обработка callback_query (inline-кнопки)
      if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id;
        const callbackData = update.callback_query.data;
        const from = update.callback_query.from;

        await routeCallback(chatId, callbackData, {
          callbackQueryId: update.callback_query.id,
          from: from,
        });

        res.sendStatus(200);
        return;
      }

      // 2. Ранний выход для не-сообщений
      if (!update || !update.message || !update.message.text) {
        res.sendStatus(200);
        return;
      }

      const chatId = update.message.chat.id;
      const text = update.message.text;

      // 3. Handle /start command
      if (update.message.text === '/start') {
        await languageDialog.askLanguage(chatId);
        res.sendStatus(200);
        return;
      }

      // 3.5: Route text messages based on onboarding state
      if (_handleEditEddInput) {
        try {
          const user = await getUser(chatId);
          if (user && user.onboardingState === 'awaiting_edd') {
            await _handleEditEddInput(chatId, text);
            res.sendStatus(200);
            return;
          }
        } catch (_err) {
          // Firestore read failed or handler threw — fall through to echo
          console.warn('[webhook] onboardingState routing error:', _err.message);
        }
      }

      // 3.6: Route text messages based on nutrition state
      if (_handleNutritionInput) {
        try {
          const user = await getUser(chatId);
          if (user && user.nutritionState && user.nutritionState.startsWith('awaiting_foods_')) {
            await _handleNutritionInput(chatId, text);
            res.sendStatus(200);
            return;
          }
        } catch (_err) {
          console.warn('[webhook] nutritionState routing error:', _err.message);
        }
      }

      // 3.7: Route text messages based on partner state
      if (_handlePartnerInput) {
        try {
          const user = await getUser(chatId);
          if (user && user.partnerState === 'awaiting_partner_code') {
            await _handlePartnerInput(chatId, text);
            res.sendStatus(200);
            return;
          }
        } catch (_err) {
          console.warn('[webhook] partnerState routing error:', _err.message);
        }
      }

      // 3.8: Route text messages as LMP date input (onboarding)
      if (_handleLmpInput) {
        try {
          const user = await getUser(chatId);
          if (user && user.language && !user.lmpDate) {
            await _handleLmpInput(chatId, text);
            res.sendStatus(200);
            return;
          }
        } catch (_err) {
          console.warn('[webhook] lmpInput routing error:', _err.message);
        }
      }

      // 4. Handle text commands
      if (text === '/help') {
        const helpText = await t(chatId, 'help.message');
        await sendMessage(chatId, helpText);
        res.sendStatus(200);
        return;
      }

      if (text === '/menu') {
        if (_showMainMenu) {
          await _showMainMenu(chatId);
        } else {
          await sendMessage(chatId, await t(chatId, 'error.generic'));
        }
        res.sendStatus(200);
        return;
      }

      if (text === '/settings') {
        if (_showSettingsMenu) {
          await _showSettingsMenu(chatId);
        } else {
          await sendMessage(chatId, await t(chatId, 'error.generic'));
        }
        res.sendStatus(200);
        return;
      }

      if (text === '/week') {
        if (_showWeekInfo) {
          await _showWeekInfo(chatId);
        } else {
          await sendMessage(chatId, await t(chatId, 'error.generic'));
        }
        res.sendStatus(200);
        return;
      }

      if (text === '/mood') {
        if (_showMoodMenu) {
          await _showMoodMenu(chatId);
        } else {
          await sendMessage(chatId, await t(chatId, 'error.generic'));
        }
        res.sendStatus(200);
        return;
      }

      if (text === '/nutrition') {
        if (_showNutritionMenu) {
          await _showNutritionMenu(chatId);
        } else {
          await sendMessage(chatId, await t(chatId, 'error.generic'));
        }
        res.sendStatus(200);
        return;
      }

      if (text === '/invite') {
        if (_showPartnerMenu) {
          await _showPartnerMenu(chatId);
        } else {
          await sendMessage(chatId, await t(chatId, 'error.generic'));
        }
        res.sendStatus(200);
        return;
      }

      // 5. Fallback for unrecognized input — suggest menu/help
      const fallbackText = await t(chatId, 'error.use_menu');
      await sendMessage(chatId, fallbackText);

      res.sendStatus(200);
    } catch (err) {
      console.error('Error processing update:', err);
      res.sendStatus(200);
    }
  },
);



// ---------------------------------------------------------------------------
// Scheduled: weekly notification check
// ---------------------------------------------------------------------------

exports.sendWeeklyNotifications = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'Europe/Moscow',
  },
  async (_event) => {
    if (!_sendWeeklyNotifications) {
      console.warn('[sendWeeklyNotifications] Handler not loaded — skipping run');
      return;
    }

    try {
      const result = await _sendWeeklyNotifications();
      console.log('[sendWeeklyNotifications] Completed:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[sendWeeklyNotifications] Error:', err.message);
    }
  },
);

async function registerWebhook(req, res) {
  const webhookUrl = `https://${req.headers.host}/webhook`;

  try {
    const setWebhookUrl = `${TELEGRAM_API}/bot${getTelegramToken()}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const response = await fetch(setWebhookUrl);
    const data = await response.json();

    if (data.ok) {
      try {
        const defaultCommands = [
          { command: 'start', description: '🚀 Start the bot / Начать' },
          { command: 'help', description: 'ℹ️ Help / Справка' },
          { command: 'menu', description: '📋 Main menu / Главное меню' },
          { command: 'week', description: '📅 My week / Моя неделя' },
          { command: 'mood', description: '😊 Mood diary / Дневник настроения' },
          { command: 'nutrition', description: '🍎 Nutrition / Питание' },
          { command: 'invite', description: '👥 Invite partner / Пригласить партнёра' },
          { command: 'settings', description: '⚙️ Settings / Настройки' },
        ];
        await setMyCommands(defaultCommands);
      } catch (cmdErr) {
        console.warn('[webhook] setMyCommands failed:', cmdErr.message);
      }
    }

    res.json({success: data.ok, description: data.description, webhookUrl});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
}

module.exports.registerWebhook = registerWebhook;
